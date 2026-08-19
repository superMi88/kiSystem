import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import { MailService } from "./service.js";

export const mailPlugin: Plugin = {
  name: "Mail",
  description: "Verwaltet E-Mail-Postfächer (z.B. Web.de und Gmail), ruft E-Mails sicher ab, ermöglicht das Lesen, Kategorisieren, Zuordnen zu Personen und Versenden von Antworten.",
  tools: [
    {
      definition: {
        name: "hole_mails",
        description: "Ruft E-Mails aus allen oder einem bestimmten Postfach ab. Unterstützt Filterung nach Konto, Kategorie, Person oder Textsuche.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            kontoId: { type: SchemaType.INTEGER, description: "Optionale ID des Kontos." },
            kategorie: { type: SchemaType.STRING, description: "Optionale Kategorie (z.B. 'Arbeit', 'Rechnungen', 'Privat', 'Wichtig')." },
            personId: { type: SchemaType.INTEGER, description: "Optionale ID einer Person aus dem Gedächtnis." },
            suche: { type: SchemaType.STRING, description: "Optionaler Suchbegriff nach Absender, Betreff oder Text." },
            limit: { type: SchemaType.INTEGER, description: "Maximale Anzahl an Mails (Standard ist 30)." },
            jetzt_synchronisieren: { type: SchemaType.BOOLEAN, description: "Wenn true, wird vorher ein Live-Abruf der IMAP-Server gestartet." }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        if (args.jetzt_synchronisieren) {
          try {
            await MailService.syncAllAccounts(prisma);
          } catch (syncErr) {
            console.error("[mailPlugin] Fehler bei Live-Synchronisierung:", syncErr);
          }
        }

        const limit = args.limit ? Number(args.limit) : 30;
        const result = await MailService.getUnifiedEmails(prisma, {
          accountId: args.kontoId ? Number(args.kontoId) : undefined,
          category: args.kategorie,
          personId: args.personId ? Number(args.personId) : undefined,
          query: args.suche,
          limit
        });

        return {
          status: "success",
          gesamt: result.totalCount,
          ungelesen: result.unreadCount,
          mails: result.emails.map(m => ({
            id: m.id,
            konto: m.account.name,
            kontoEmail: m.account.email,
            absender: m.from,
            absenderName: m.fromName,
            empfaenger: m.to,
            betreff: m.subject,
            datum: m.date.toISOString(),
            vorschau: m.snippet,
            gelesen: m.isRead,
            hatAnhaenge: m.hasAttachments,
            kategorie: m.category || "Allgemein",
            person: m.person ? { id: m.person.id, name: m.person.name || m.person.aliases[0]?.name || "Person" } : null
          }))
        };
      }
    },
    {
      definition: {
        name: "lese_mail",
        description: "Liest eine bestimmte E-Mail anhand ihrer ID vollständig aus und markiert sie als gelesen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            mailId: { type: SchemaType.INTEGER, description: "Die ID der zu lesenden E-Mail." }
          },
          required: ["mailId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.mailId);
        const mail = await prisma.cachedEmail.findUnique({
          where: { id },
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
        });

        if (!mail) {
          throw new Error(`E-Mail mit ID ${id} wurde nicht gefunden.`);
        }

        // Als gelesen markieren & IMAP Server Flag synchronisieren
        if (!mail.isRead) {
          await MailService.markEmailReadStatus(prisma, id, true);
        }

        return {
          status: "success",
          mail: {
            id: mail.id,
            konto: mail.account.name,
            kontoEmail: mail.account.email,
            absender: mail.from,
            absenderName: mail.fromName,
            empfaenger: mail.to,
            betreff: mail.subject,
            datum: mail.date.toISOString(),
            inhaltText: mail.bodyText,
            inhaltHtml: mail.bodyHtml,
            hatAnhaenge: mail.hasAttachments,
            kategorie: mail.category || "Allgemein",
            person: mail.person ? { id: mail.person.id, name: mail.person.name || mail.person.aliases[0]?.name || "Person" } : null
          }
        };
      }
    },
    {
      definition: {
        name: "kategorisiere_mail",
        description: "Weist einer E-Mail eine bestimmte Kategorie zu (z.B. 'Arbeit', 'Rechnungen', 'Privat', 'Finanzen', 'Wichtig', 'Bestellungen').",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            mailId: { type: SchemaType.INTEGER, description: "ID der E-Mail." },
            kategorie: { type: SchemaType.STRING, description: "Name der Kategorie (z.B. 'Arbeit', 'Rechnungen', 'Privat', 'Finanzen', 'Wichtig')." }
          },
          required: ["mailId", "kategorie"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.mailId);
        const updated = await MailService.updateEmailCategory(prisma, id, args.kategorie);
        return {
          status: "success",
          message: `E-Mail '${updated.subject}' wurde der Kategorie '${updated.category}' zugewiesen.`,
          mailId: updated.id,
          kategorie: updated.category
        };
      }
    },
    {
      definition: {
        name: "verknuepfe_mail_person",
        description: "Verknüpft eine E-Mail mit einer Person aus dem Gedächtnis (Memory) und speichert die E-Mail-Adresse bei der Person für zukünftige Erkennung.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            mailId: { type: SchemaType.INTEGER, description: "ID der E-Mail." },
            personId: { type: SchemaType.INTEGER, description: "ID der Person aus dem Gedächtnis (oder null zum Entfernen)." }
          },
          required: ["mailId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const mailId = Number(args.mailId);
        const personId = args.personId !== undefined && args.personId !== null ? Number(args.personId) : null;
        const updated = await MailService.linkEmailToPerson(prisma, mailId, personId);
        return {
          status: "success",
          message: personId
            ? `E-Mail wurde erfolgreich mit Person '${updated.person?.name || updated.person?.aliases[0]?.name || personId}' verknüpft.`
            : `Personen-Verknüpfung für E-Mail '${mailId}' entfernt.`,
          mail: updated
        };
      }
    },
    {
      definition: {
        name: "antworte_mail",
        description: "Sendet eine Antwort auf eine bestehende E-Mail über das entsprechende Postfach-Konto.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            mailId: { type: SchemaType.INTEGER, description: "Die ID der E-Mail, auf die geantwortet werden soll." },
            nachricht: { type: SchemaType.STRING, description: "Der Text der Antwortnachricht." },
            betreff: { type: SchemaType.STRING, description: "Optionaler abweichender Betreff (standardmäßig wird 'Re: <Originalbetreff>' verwendet)." }
          },
          required: ["mailId", "nachricht"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.mailId);
        const mail = await prisma.cachedEmail.findUnique({
          where: { id },
          include: { account: true }
        });

        if (!mail) {
          throw new Error(`E-Mail mit ID ${id} wurde nicht gefunden.`);
        }

        const replySubject = args.betreff || (mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`);
        const replyToAddress = mail.from;

        const result = await MailService.sendEmail(
          mail.accountId,
          {
            to: replyToAddress,
            subject: replySubject,
            body: args.nachricht,
            inReplyTo: mail.messageId || undefined,
            references: mail.messageId || undefined
          },
          prisma
        );

        if (!result.success) {
          throw new Error(`Fehler beim Senden der Antwort: ${result.error}`);
        }

        return {
          status: "success",
          message: `Antwort an '${replyToAddress}' über Konto '${mail.account.name}' (${mail.account.email}) erfolgreich gesendet.`,
          messageId: result.messageId
        };
      }
    },
    {
      definition: {
        name: "sende_mail",
        description: "Versendet eine neue E-Mail über ein bestimmtes konfiguriertes Postfach.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            kontoId: { type: SchemaType.INTEGER, description: "ID des Absender-Kontos (siehe Kontoverwaltung)." },
            empfaenger: { type: SchemaType.STRING, description: "E-Mail-Adresse des Empfängers." },
            betreff: { type: SchemaType.STRING, description: "Betreff der Nachricht." },
            nachricht: { type: SchemaType.STRING, description: "Textinhalt der Nachricht." }
          },
          required: ["kontoId", "empfaenger", "betreff", "nachricht"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const kontoId = Number(args.kontoId);
        const result = await MailService.sendEmail(
          kontoId,
          {
            to: args.empfaenger,
            subject: args.betreff,
            body: args.nachricht
          },
          prisma
        );

        if (!result.success) {
          throw new Error(`Fehler beim Senden: ${result.error}`);
        }

        return {
          status: "success",
          message: `E-Mail an '${args.empfaenger}' erfolgreich gesendet.`,
          messageId: result.messageId
        };
      }
    },
    {
      definition: {
        name: "verwalte_mail_konten",
        description: "Verwaltet die hinterlegten E-Mail-Konten (z.B. Auflisten, Anlegen, Löschen, Verbindung testen oder Vollsynchronisation anstoßen).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            aktion: { type: SchemaType.STRING, description: "Aktion: 'list', 'test', 'delete', 'sync' oder 'full_sync'" },
            kontoId: { type: SchemaType.INTEGER, description: "ID des Kontos für delete/test/sync." }
          },
          required: ["aktion"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const aktion = args.aktion.toLowerCase();

        if (aktion === "list") {
          const accounts = await prisma.mailAccount.findMany({
            where: { isDeleted: false },
            select: {
              id: true,
              name: true,
              email: true,
              imapHost: true,
              imapPort: true,
              imapTls: true,
              smtpHost: true,
              smtpPort: true,
              smtpTls: true,
              color: true,
              createdAt: true
            }
          });
          return { status: "success", konten: accounts };
        }

        if (aktion === "sync" || aktion === "full_sync") {
          const fullSync = aktion === "full_sync";
          const res = await MailService.syncAllAccounts(prisma, { fullSync });
          return { status: "success", synchronisiert: res.totalSynced, ergebnisse: res.results };
        }

        if (aktion === "delete") {
          if (!args.kontoId) throw new Error("kontoId ist für delete erforderlich.");
          await prisma.mailAccount.update({
            where: { id: Number(args.kontoId) },
            data: { isDeleted: true }
          });
          return { status: "success", message: "Konto erfolgreich entfernt." };
        }

        if (aktion === "test") {
          if (!args.kontoId) throw new Error("kontoId ist für test erforderlich.");
          const acc = await prisma.mailAccount.findUnique({ where: { id: Number(args.kontoId) } });
          if (!acc) throw new Error("Konto nicht gefunden.");
          const res = await MailService.testConnection(acc);
          return { status: res.success ? "success" : "error", message: res.message };
        }

        throw new Error(`Unbekannte Aktion: ${args.aktion}`);
      }
    }
  ],

  getTopWidgets: async ({ prisma }) => {
    const accounts = await prisma.mailAccount.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        email: true,
        color: true,
        imapHost: true
      }
    });

    const customCategories = await prisma.mailCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, icon: true }
    });

    const recentResult = await MailService.getUnifiedEmails(prisma, { limit: 50 });

    return [
      {
        pluginName: "Mail",
        type: "custom",
        data: {
          widgetType: "mail_overview",
          accounts,
          emails: recentResult.emails.map(e => {
            const primaryAlias = e.person?.aliases.find(a => a.isPrimary) || e.person?.aliases[0];
            const personName = e.person?.name || primaryAlias?.name || null;

            return {
              id: e.id,
              accountId: e.accountId,
              accountName: e.account.name,
              accountEmail: e.account.email,
              accountColor: e.account.color,
              subject: e.subject,
              from: e.from,
              fromName: e.fromName,
              to: e.to,
              date: e.date.toISOString(),
              snippet: e.snippet,
              isRead: e.isRead,
              hasAttachments: e.hasAttachments,
              category: e.category || null,
              personId: e.personId,
              personName: personName,
              personEmail: e.person?.email || null
            };
          }),
          unreadCount: recentResult.unreadCount,
          totalCount: recentResult.totalCount,
          categories: customCategories
        }
      }
    ];
  },

  entityConfig: {
    type: "mail",
    prefix: "app://mail/",
    color: "rgba(166, 227, 161, 0.15)",
    borderColor: "#a6e3a1",
    icon: "📧",
    displayName: "E-Mail"
  },

  resolveEntity: async (id, { prisma }) => {
    return prisma.cachedEmail.findUnique({
      where: { id },
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
    });
  }
};
