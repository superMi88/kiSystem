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
   * Extrahiert die reine E-Mail-Adresse aus Strings wie 'Max Mustermann <max@web.de>' oder 'max@web.de'.
   */
  static extractEmailAddress(str: string): string {
    if (!str) return "";
    const angleMatch = str.match(/<([^>]+)>/);
    if (angleMatch) return angleMatch[1].toLowerCase().trim();
    const regexMatch = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (regexMatch) return regexMatch[0].toLowerCase().trim();
    return str.toLowerCase().trim();
  }

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
   * Synchronisiert E-Mails eines bestimmten Kontos via IMAP in die CachedEmail-Tabelle.
   * Unterstützt Vollabruf (alle vorhandenen E-Mails) sowie automatischen Personen-Abgleich.
   */
  static async syncAccountEmails(
    account: MailAccount,
    prisma: PrismaClient,
    options?: { fullSync?: boolean; batchLimit?: number }
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

        // Lade alle Personen für automatische Absendererkennung
        const allPersons = await prisma.person.findMany({
          where: { isDeleted: false },
          select: {
            id: true,
            email: true,
            emails: true,
            aliases: { select: { name: true } }
          }
        });

        const findMatchingPersonId = (fromRaw: string, fromName?: string): number | null => {
          const cleanEmail = MailService.extractEmailAddress(fromRaw);
          if (!cleanEmail) return null;

          for (const p of allPersons) {
            if (p.email && p.email.toLowerCase().trim() === cleanEmail) {
              return p.id;
            }
            if (p.emails) {
              const list = p.emails.split(",").map(e => e.toLowerCase().trim());
              if (list.includes(cleanEmail)) {
                return p.id;
              }
            }
            if (fromName && fromName.trim()) {
              const nameLower = fromName.toLowerCase().trim();
              for (const a of p.aliases) {
                if (a.name && a.name.toLowerCase().trim() === nameLower) {
                  return p.id;
                }
              }
            }
          }
          return null;
        };

        // Lade bereits gecachte UIDs und deren Status
        const existingCached = await prisma.cachedEmail.findMany({
          where: { accountId: account.id },
          select: { id: true, uid: true, isRead: true, category: true, personId: true }
        });
        const cachedMap = new Map<number, { id: number; uid: number; isRead: boolean; category: string | null; personId: number | null }>();
        existingCached.forEach(item => cachedMap.set(item.uid, item));

        const total = mailbox.exists;
        // Bei Vollsync oder initialem Sync alle Mails abrufen; sonst z. B. letzte 250
        const batchLimit = options?.batchLimit || (options?.fullSync ? total : Math.min(total, 350));
        const startSeq = Math.max(1, total - batchLimit + 1);
        const seqRange = `${startSeq}:${total}`;

        let processedCount = 0;

        for await (const message of client.fetch(seqRange, {
          uid: true,
          flags: true,
          envelope: true,
          source: true
        })) {
          try {
            const uidNum = Number(message.uid);
            const isSeenOnServer = message.flags ? message.flags.has("\\Seen") : false;
            const existing = cachedMap.get(uidNum);

            // Falls bereits vollständig gecacht, synchronisiere nur Flags & Personen-Zuweisung falls nötig
            if (existing) {
              // Behalte lokalen Gelesen-Status bei (oder setze auf gelesen, wenn auf Server gelesen)
              const finalIsRead = existing.isRead || isSeenOnServer;
              let shouldUpdate = false;
              const updateData: any = {};

              if (existing.isRead !== finalIsRead) {
                updateData.isRead = finalIsRead;
                shouldUpdate = true;
              }

              // Falls bisher keine Person zugeordnet war, prüfe ob jetzt eine passt
              if (!existing.personId && message.envelope?.from?.[0]?.address) {
                const matchedPerson = findMatchingPersonId(message.envelope.from[0].address, message.envelope.from[0].name);
                if (matchedPerson) {
                  updateData.personId = matchedPerson;
                  shouldUpdate = true;
                }
              }

              if (shouldUpdate) {
                await prisma.cachedEmail.update({
                  where: { id: existing.id },
                  data: updateData
                });
              }

              processedCount++;
              continue;
            }

            // Neue E-Mail parsen
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
            const isRead = isSeenOnServer;
            const hasAttachments = !!(parsed.attachments && parsed.attachments.length > 0);
            const matchedPersonId = findMatchingPersonId(rawFrom, fromName);

            await prisma.cachedEmail.create({
              data: {
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
                hasAttachments: hasAttachments,
                category: null,
                personId: matchedPersonId
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
  static async syncAllAccounts(
    prisma: PrismaClient,
    options?: { fullSync?: boolean }
  ): Promise<{
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
      try {
        const res = await this.syncAccountEmails(account, prisma, options);
        return {
          accountId: account.id,
          name: account.name,
          email: account.email,
          count: res.count,
          error: res.error
        };
      } catch (err: any) {
        return {
          accountId: account.id,
          name: account.name,
          email: account.email,
          count: 0,
          error: err.message || "Unbekannter Sync-Fehler"
        };
      }
    });

    const results = await Promise.all(promises);
    const totalSynced = results.reduce((acc, curr) => acc + curr.count, 0);
    return { totalSynced, results };
  }

  /**
   * Gibt alle benutzerdefinierten Mail-Kategorien zurück.
   */
  static async getCategories(prisma: PrismaClient) {
    return await prisma.mailCategory.findMany({
      orderBy: { name: "asc" }
    });
  }

  /**
   * Erstellt eine neue benutzerdefinierte Mail-Kategorie mit Name und Icon.
   */
  static async createCategory(prisma: PrismaClient, name: string, icon?: string) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Kategoriename darf nicht leer sein.");
    return await prisma.mailCategory.create({
      data: {
        name: trimmedName,
        icon: icon?.trim() || "🏷️"
      }
    });
  }

  /**
   * Aktualisiert eine benutzerdefinierte Mail-Kategorie.
   */
  static async updateCategory(prisma: PrismaClient, id: number, name: string, icon?: string) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Kategoriename darf nicht leer sein.");
    return await prisma.mailCategory.update({
      where: { id },
      data: {
        name: trimmedName,
        icon: icon?.trim() || "🏷️"
      }
    });
  }

  /**
   * Löscht eine benutzerdefinierte Mail-Kategorie.
   */
  static async deleteCategory(prisma: PrismaClient, id: number) {
    const cat = await prisma.mailCategory.findUnique({ where: { id } });
    if (cat) {
      await prisma.cachedEmail.updateMany({
        where: { category: cat.name },
        data: { category: null }
      });
    }
    return await prisma.mailCategory.delete({
      where: { id }
    });
  }

  /**
   * Ändert den Gelesen-Status einer E-Mail in der Datenbank und synchronisiert das \Seen Flag mit dem IMAP-Server.
   */
  static async markEmailReadStatus(
    prisma: PrismaClient,
    emailId: number,
    isRead: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const email = await prisma.cachedEmail.findUnique({
      where: { id: emailId },
      include: { account: true }
    });
    if (!email) return { success: false, error: "E-Mail nicht gefunden." };

    // 1. Lokale DB aktualisieren
    await prisma.cachedEmail.update({
      where: { id: emailId },
      data: { isRead }
    });

    // 2. IMAP Server Flag \Seen setzen/entfernen
    if (email.account && !email.account.isDeleted) {
      (async () => {
        try {
          const client = new ImapFlow({
            host: email.account.imapHost,
            port: email.account.imapPort,
            secure: email.account.imapTls,
            auth: {
              user: email.account.email,
              pass: email.account.password
            },
            logger: false
          });

          await client.connect();
          const lock = await client.getMailboxLock("INBOX");
          try {
            if (isRead) {
              await client.messageFlagsAdd({ uid: email.uid }, ["\\Seen"]);
            } else {
              await client.messageFlagsRemove({ uid: email.uid }, ["\\Seen"]);
            }
          } finally {
            lock.release();
            await client.logout();
          }
        } catch (err: any) {
          console.warn(`[MailService] Konnte IMAP-Flag für UID ${email.uid} auf ${email.account.email} nicht aktualisieren:`, err.message);
        }
      })().catch(() => {});
    }

    return { success: true };
  }

  /**
   * Ändert die Kategorie einer E-Mail.
   */
  static async updateEmailCategory(
    prisma: PrismaClient,
    emailId: number,
    category: string | null
  ) {
    const cleanCategory = category && category.trim() ? category.trim() : null;
    return await prisma.cachedEmail.update({
      where: { id: emailId },
      data: { category: cleanCategory },
      include: {
        account: { select: { id: true, name: true, email: true, color: true } },
        person: { select: { id: true, name: true, email: true } }
      }
    });
  }

  /**
   * Verknüpft eine Person aus dem Gedächtnis mit einer E-Mail und speichert die Adresse optional bei der Person.
   */
  static async linkEmailToPerson(
    prisma: PrismaClient,
    emailId: number,
    personId: number | null
  ) {
    const email = await prisma.cachedEmail.findUnique({ where: { id: emailId } });
    if (!email) throw new Error("E-Mail nicht gefunden.");

    const updated = await prisma.cachedEmail.update({
      where: { id: emailId },
      data: { personId },
      include: {
        account: { select: { id: true, name: true, email: true, color: true } },
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            aliases: { select: { name: true, isPrimary: true } }
          }
        }
      }
    });

    // Falls eine Person verknüpft wurde und deren E-Mail-Feld leer ist, E-Mail-Adresse automatisch hinterlegen
    if (personId) {
      const cleanEmail = MailService.extractEmailAddress(email.from);
      if (cleanEmail) {
        const person = await prisma.person.findUnique({ where: { id: personId } });
        if (person) {
          if (!person.email) {
            await prisma.person.update({ where: { id: personId }, data: { email: cleanEmail } });
          } else if (!person.email.toLowerCase().includes(cleanEmail.toLowerCase())) {
            const existingEmails = person.emails ? person.emails.split(",").map(e => e.trim()) : [];
            if (!existingEmails.map(e => e.toLowerCase()).includes(cleanEmail.toLowerCase())) {
              existingEmails.push(cleanEmail);
              await prisma.person.update({ where: { id: personId }, data: { emails: existingEmails.join(", ") } });
            }
          }
        }
      }
    }

    return updated;
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

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
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
   * Unterstützt Filterung nach Konto, Kategorie, Person und Suchbegriff.
   */
  static async getUnifiedEmails(
    prisma: PrismaClient,
    options?: {
      accountId?: number;
      category?: string;
      personId?: number;
      query?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const where: any = {
      account: { isDeleted: false }
    };

    if (options?.accountId) {
      where.accountId = Number(options.accountId);
    }

    if (options?.category && options.category !== "all" && options.category !== "Alle") {
      where.category = options.category;
    }

    if (options?.personId) {
      where.personId = Number(options.personId);
    }

    if (options?.query && options.query.trim()) {
      const q = options.query.trim();
      where.OR = [
        { subject: { contains: q, mode: "insensitive" } },
        { from: { contains: q, mode: "insensitive" } },
        { fromName: { contains: q, mode: "insensitive" } },
        { to: { contains: q, mode: "insensitive" } },
        { snippet: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } }
      ];
    }

    const [emails, totalCount, unreadCount] = await Promise.all([
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
          },
          person: {
            select: {
              id: true,
              name: true,
              email: true,
              aliases: { select: { name: true, isPrimary: true } }
            }
          }
        }
      }),
      prisma.cachedEmail.count({ where }),
      prisma.cachedEmail.count({ where: { ...where, isRead: false } })
    ]);

    return { emails, totalCount, unreadCount };
  }
}
