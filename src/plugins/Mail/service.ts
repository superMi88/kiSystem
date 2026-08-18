import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import xss, { IFilterXSSOptions } from "xss";
import { PrismaClient, MailAccount } from "@prisma/client";

/**
 * Sichere HTML-Bereinigung für E-Mail-Inhalte.
 * Entfernt restlos jegliches JavaScript, Tracking-Skripte, iFrames, Formulare und bösartige Tags/Event-Handler.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return "";

  const options: IFilterXSSOptions = {
    whiteList: {
      a: ["href", "title", "target", "rel"],
      abbr: ["title"],
      b: [],
      blockquote: ["style"],
      br: [],
      caption: [],
      code: [],
      div: ["style", "class"],
      em: [],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      h4: ["style"],
      h5: ["style"],
      h6: ["style"],
      hr: [],
      i: [],
      img: ["src", "alt", "title", "width", "height", "style"],
      li: ["style"],
      ol: ["style"],
      p: ["style", "class"],
      pre: ["style"],
      s: [],
      span: ["style", "class"],
      strike: [],
      strong: [],
      sub: [],
      sup: [],
      table: ["style", "width", "border", "cellpadding", "cellspacing"],
      tbody: ["style"],
      td: ["style", "width", "colspan", "rowspan", "align", "valign"],
      tfoot: ["style"],
      th: ["style", "width", "colspan", "rowspan", "align", "valign"],
      thead: ["style"],
      tr: ["style"],
      u: [],
      ul: ["style"]
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script", "iframe", "style", "object", "embed", "form", "textarea", "input", "button", "select"]
  };

  const clean = xss(rawHtml, options);
  return String(clean).replace(/<a\s+(?:[^>]*?\s+)?href=/gi, '<a target="_blank" rel="noopener noreferrer nofollow" href=');
}

export interface MailAccountInput {
  name: string;
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  color?: string;
}

export class MailService {
  /**
   * Testet die IMAP-Verbindung für ein gegebenes Konto.
   */
  static async testConnection(account: {
    email: string;
    password: string;
    imapHost: string;
    imapPort: number;
    imapTls: boolean;
  }): Promise<{ success: boolean; message: string; folderCount?: number }> {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      auth: {
        user: account.email,
        pass: account.password
      },
      logger: false
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      const status = await client.status("INBOX", { messages: true, unseen: true });
      lock.release();
      await client.logout();
      return {
        success: true,
        message: `Verbindung erfolgreich! Posteingang enthält ${status.messages || 0} Nachrichten (${status.unseen || 0} ungelesen).`,
        folderCount: status.messages || 0
      };
    } catch (err: any) {
      console.error(`[MailService] Verbindungstest fehlgeschlagen für ${account.email}:`, err);
      let errorMsg = err.message || "Unbekannter Fehler bei der Verbindung.";
      if (errorMsg.includes("Invalid credentials") || errorMsg.includes("AUTHENTICATIONFAILED")) {
        errorMsg = "Authentifizierung fehlgeschlagen: Bitte prüfe E-Mail-Adresse und Passwort (bei Gmail: App-Passwort verwenden; bei Web.de: POP3/IMAP-Freigabe aktivieren).";
      } else if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("ENOTFOUND")) {
        errorMsg = `Server '${account.imapHost}:${account.imapPort}' konnte nicht erreicht werden.`;
      }
      return { success: false, message: errorMsg };
    }
  }

  /**
   * Synchronisiert die neuesten E-Mails eines bestimmten Kontos via IMAP in die CachedEmail-Tabelle.
   */
  static async syncAccountEmails(
    account: MailAccount,
    prisma: PrismaClient,
    limit: number = 30
  ): Promise<{ count: number; error?: string }> {
    console.log(`[MailService] Starte Synchronisierung für Konto: ${account.name} (${account.email})...`);

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapTls,
      auth: {
        user: account.email,
        pass: account.password
      },
      logger: false
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        const mailbox = client.mailbox;
        if (!mailbox || mailbox.exists === 0) {
          console.log(`[MailService] Posteingang von ${account.email} ist leer.`);
          lock.release();
          await client.logout();
          return { count: 0 };
        }

        // Berechne den Sequenzbereich für die neuesten 'limit' E-Mails
        const total = mailbox.exists;
        const startSeq = Math.max(1, total - limit + 1);
        const seqRange = `${startSeq}:${total}`;

        let processedCount = 0;

        for await (const message of client.fetch(seqRange, {
          uid: true,
          flags: true,
          envelope: true,
          source: true
        })) {
          try {
            if (!message.source) continue;

            const parsed: ParsedMail = await simpleParser(message.source);
            const rawSubject = parsed.subject || "(Kein Betreff)";
            const rawFrom = parsed.from?.text || account.email;
            const fromName = parsed.from?.value?.[0]?.name || parsed.from?.text || "Unbekannt";
            
            let toStr = account.email;
            if (parsed.to) {
              if (Array.isArray(parsed.to)) {
                toStr = parsed.to.map(t => t.text).join(", ");
              } else {
                toStr = parsed.to.text || account.email;
              }
            }

            const mailDate = parsed.date || (message.envelope?.date ? new Date(message.envelope.date) : new Date());
            const rawBodyText = parsed.text || "";
            const rawHtml = parsed.html || parsed.textAsHtml || "";
            const cleanHtml = sanitizeEmailHtml(rawHtml);
            const snippet = rawBodyText.replace(/\s+/g, " ").trim().slice(0, 160);
            const isRead = message.flags ? message.flags.has("\\Seen") : false;
            const hasAttachments = !!(parsed.attachments && parsed.attachments.length > 0);
            const uidNum = Number(message.uid);

            await prisma.cachedEmail.upsert({
              where: {
                accountId_uid: {
                  accountId: account.id,
                  uid: uidNum
                }
              },
              update: {
                subject: rawSubject,
                from: rawFrom,
                fromName: fromName,
                to: toStr,
                date: mailDate,
                bodyText: rawBodyText,
                bodyHtml: cleanHtml,
                snippet: snippet,
                isRead: isRead,
                hasAttachments: hasAttachments
              },
              create: {
                accountId: account.id,
                uid: uidNum,
                messageId: parsed.messageId || null,
                subject: rawSubject,
                from: rawFrom,
                fromName: fromName,
                to: toStr,
                date: mailDate,
                bodyText: rawBodyText,
                bodyHtml: cleanHtml,
                snippet: snippet,
                isRead: isRead,
                hasAttachments: hasAttachments
              }
            });

            processedCount++;
          } catch (itemErr) {
            console.error(`[MailService] Fehler beim Parsen einer E-Mail (UID: ${message.uid}):`, itemErr);
          }
        }

        console.log(`[MailService] ${processedCount} E-Mails für ${account.email} erfolgreich synchronisiert.`);
        return { count: processedCount };
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (err: any) {
      console.error(`[MailService] Fehler beim Abrufen der E-Mails für ${account.email}:`, err);
      return { count: 0, error: err.message };
    }
  }

  /**
   * Synchronisiert alle aktiven Mail-Konten parallel.
   */
  static async syncAllAccounts(prisma: PrismaClient): Promise<{
    totalSynced: number;
    results: { accountId: number; name: string; email: string; count: number; error?: string }[];
  }> {
    const accounts = await prisma.mailAccount.findMany({
      where: { isDeleted: false }
    });

    if (accounts.length === 0) {
      return { totalSynced: 0, results: [] };
    }

    const promises = accounts.map(async account => {
      const res = await this.syncAccountEmails(account, prisma);
      return {
        accountId: account.id,
        name: account.name,
        email: account.email,
        count: res.count,
        error: res.error
      };
    });

    const settled = await Promise.allSettled(promises);
    const results = settled.map((s, idx) => {
      if (s.status === "fulfilled") {
        return s.value;
      } else {
        return {
          accountId: accounts[idx].id,
          name: accounts[idx].name,
          email: accounts[idx].email,
          count: 0,
          error: (s.reason as Error)?.message || "Unbekannter Sync-Fehler"
        };
      }
    });

    const totalSynced = results.reduce((acc, curr) => acc + curr.count, 0);
    return { totalSynced, results };
  }

  /**
   * Sendet eine E-Mail via SMTP über das angegebene Konto.
   */
  static async sendEmail(
    accountId: number,
    params: {
      to: string;
      subject: string;
      body: string;
      inReplyTo?: string;
      references?: string;
    },
    prisma: PrismaClient
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const account = await prisma.mailAccount.findUnique({
      where: { id: accountId }
    });

    if (!account || account.isDeleted) {
      throw new Error(`Mail-Konto mit ID ${accountId} wurde nicht gefunden oder ist gelöscht.`);
    }

    // SMTP Transporter aufbauen
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465, // true für 465 SSL, false für 587 STARTTLS
      auth: {
        user: account.email,
        pass: account.password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${account.name}" <${account.email}>`,
        to: params.to,
        subject: params.subject,
        text: params.body,
        inReplyTo: params.inReplyTo,
        references: params.references
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[MailService] E-Mail erfolgreich gesendet von ${account.email} an ${params.to} (Message-ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error(`[MailService] Fehler beim Senden der E-Mail über ${account.email}:`, err);
      return { success: false, error: err.message || "Fehler beim Senden der E-Mail." };
    }
  }

  /**
   * Liefert eine zusammengeführte E-Mail-Liste aller aktiven Konten chronologisch sortiert.
   */
  static async getUnifiedEmails(
    prisma: PrismaClient,
    options?: { accountId?: number; query?: string; limit?: number; offset?: number }
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const where: any = {
      account: { isDeleted: false }
    };

    if (options?.accountId) {
      where.accountId = Number(options.accountId);
    }

    if (options?.query && options.query.trim()) {
      const q = options.query.trim();
      where.OR = [
        { subject: { contains: q, mode: "insensitive" } },
        { from: { contains: q, mode: "insensitive" } },
        { fromName: { contains: q, mode: "insensitive" } },
        { to: { contains: q, mode: "insensitive" } },
        { snippet: { contains: q, mode: "insensitive" } }
      ];
    }

    const [emails, totalCount] = await Promise.all([
      prisma.cachedEmail.findMany({
        where,
        orderBy: { date: "desc" },
        take: limit,
        skip: offset,
        include: {
          account: {
            select: {
              id: true,
              name: true,
              email: true,
              color: true
            }
          }
        }
      }),
      prisma.cachedEmail.count({ where })
    ]);

    return { emails, totalCount };
  }
}
