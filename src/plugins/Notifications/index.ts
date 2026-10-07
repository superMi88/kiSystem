import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import { getAgentConfig } from "../../settings.js";

export const notificationsPlugin: Plugin = {
  name: "Notifications",
  description: "Verwaltet Benachrichtigungen, Fragen und Handlungsbedarf von autonomen Agent Runs für den Arbeitstisch.",
  tools: [
    {
      definition: {
        name: "erstelle_benachrichtigung",
        description: "Erstellt eine Benachrichtigung oder Frage mit interaktiven Buttons für den Benutzer auf dem Arbeitstisch.",
        detailedInstructions: `[ERSTELLE_BENACHRICHTIGUNG - REGELN & VORGABEN]
1. Einsatz: Nutze dieses Tool immer, wenn du Rückfragen stellen, Optionen zur Auswahl anbieten oder Bestätigungen vor Aktionen (z. B. Discord-Ankündigung senden) einholen möchtest.
2. Vorschau-Pflicht bei Entwürfen: Im Parameter 'nachricht' MUSST du zwingend den VOLLSTÄNDIGEN Entwurfstext (Titel, Inhalt/Beschreibung, Zielkanal, Rollen) als lesbare Vorschau einfügen. Sag niemals nur 'Ich habe einen Entwurf vorbereitet'.
3. Interaktive Buttons: Lege sinnvolle Buttons an (typ='question' mit Buttons wie Ja/Nein oder Auswahlmöglichkeiten).`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: {
              type: SchemaType.STRING,
              description: "Prägnanter Betreff oder Titel der Benachrichtigung (z. B. 'Veranstaltung: Keramik bemalen' oder 'Nina auf Parship')"
            },
            nachricht: {
              type: SchemaType.STRING,
              description: "Der Text der Benachrichtigung oder die Frage an den Benutzer. WICHTIG: Wenn du eine Bestätigung oder Rückfrage für eine geplante Aktion oder einen Entwurf einholst (z.B. Ankündigung veröffentlichen, E-Mail senden, Termin/Aufgabe anlegen), MUSST du hier den VOLLSTÄNDIGEN Entwurfstext (Titel, kompletter Inhalt/Beschreibung, Kanal, Rollen/Pings etc.) als lesbare Vorschau einfügen! Schreibe niemals nur 'Ich habe einen Entwurf vorbereitet', sondern zeige immer den vollständigen Entwurf, damit der Benutzer genau weiß, was getan oder veröffentlicht wird!"
            },
            begruendung: {
              type: SchemaType.STRING,
              description: "Gedankengang oder Begründung des Agenten, warum diese Meldung relevant ist und auf dem Arbeitstisch erscheinen soll."
            },
            agentName: {
              type: SchemaType.STRING,
              description: "Name des meldenden Agenten (z. B. 'E-Mail-Agent', 'Kalender-Agent', 'System-Agent')."
            },
            typ: {
              type: SchemaType.STRING,
              description: "Typ der Benachrichtigung: 'question' (Rückfrage/Entscheidung), 'action_required' (Handlungsbedarf) oder 'info' (reine Information). Standard: 'info'"
            },
            prioritaet: {
              type: SchemaType.STRING,
              description: "Priorität: 'low', 'normal', 'high'. Standard: 'normal'"
            },
            buttons: {
              type: SchemaType.ARRAY,
              description: "Interaktive Buttons für den Benutzer (z. B. [ { label: 'Ja, eintragen', replyText: 'Ja, trage den Termin bitte ein', action: 'reply', style: 'primary' }, { label: 'Nein', action: 'dismiss', style: 'secondary' } ])",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  label: { type: SchemaType.STRING, description: "Text auf dem Button" },
                  replyText: { type: SchemaType.STRING, description: "Antworttext an den Agent Run Chat beim Klick" },
                  action: { type: SchemaType.STRING, description: "'reply' (Antwort an Chat senden) oder 'dismiss' (Benachrichtigung schließen)" },
                  style: { type: SchemaType.STRING, description: "'primary' oder 'secondary'" }
                },
                required: ["label"]
              }
            },
            conversationId: {
              type: SchemaType.STRING,
              description: "Optionale ID der zugehörigen Chat-Konversation / des Agent Runs"
            },
            sourceType: {
              type: SchemaType.STRING,
              description: "Quelle: 'mail', 'system', 'task' etc. Standard: 'mail'"
            },
            sourceId: {
              type: SchemaType.STRING,
              description: "ID des Quell-Objekts (z. B. E-Mail-ID)"
            }
          },
          required: ["titel", "nachricht"]
        } as any
      },
      handler: async (args, { prisma }) => {
        let buttons = args.buttons;
        if (typeof buttons === "string") {
          try {
            buttons = JSON.parse(buttons);
          } catch (e) {
            buttons = [];
          }
        }

        // Standard-Buttons für Fragen vergeben, falls keine übergeben wurden
        if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
          if (args.typ === "question") {
            buttons = [
              { label: "Ja, gerne", replyText: "Ja, bitte durchführen", action: "reply", style: "primary" },
              { label: "Nein", replyText: "Nein, danke", action: "dismiss", style: "secondary" }
            ];
          } else if (args.typ === "info") {
            buttons = [
              { label: "Verstanden", action: "dismiss", style: "secondary" }
            ];
          }
        }

        let validConversationId: string | null = null;
        if (args.conversationId) {
          const convExists = await prisma.conversation.findUnique({
            where: { id: String(args.conversationId) },
            select: { id: true }
          });
          if (convExists) {
            validConversationId = convExists.id;
          }
        }

        const agentConfig = getAgentConfig(args.agentName || args.sourceType || "mail");
        const agentName = agentConfig?.name || args.agentName || (args.sourceType === "mail" ? "E-Mail-Agent" : "Autonomer Agent");
        const agentAvatar = agentConfig?.avatar || (args.sourceType === "mail" ? "✉️" : "🤖");
        const agentColor = agentConfig?.color || (args.sourceType === "mail" ? "#fab387" : "#89b4fa");

        const notif = await prisma.agentNotification.create({
          data: {
            title: args.titel,
            message: args.nachricht,
            reasoning: args.begruendung || args.reasoning || null,
            agentName,
            agentAvatar,
            agentColor,
            actionData: args.actionData || null,
            type: args.typ || "info",
            priority: args.prioritaet || "normal",
            sourceType: args.sourceType || "mail",
            sourceId: args.sourceId ? String(args.sourceId) : null,
            conversationId: validConversationId,
            buttons: buttons || null
          }
        });

        return {
          status: "success",
          message: `Benachrichtigung '${args.titel}' erfolgreich für den Arbeitstisch erstellt.`,
          notificationId: notif.id
        };
      }
    },
    {
      definition: {
        name: "schlage_termin_vor",
        description: "Schlägt dem Benutzer einen Kalendertermin zur Bestätigung auf dem Arbeitstisch vor. WICHTIG: Der Termin wird NICHT sofort eingetragen, sondern erst dann exakt so im Kalender angelegt, wenn der Benutzer auf 'Ja' klickt.",
        detailedInstructions: `[SCHLAGE_TERMIN_VOR]
Nutze dieses Tool IMMER, wenn in einer E-Mail oder Nachricht ein Termin vereinbart, vorgeschlagen oder angekündigt wird.
Erstelle niemals selbst Termine per fuege_termin_hinzu, sondern schlage sie immer über dieses Tool zur Bestätigung vor.
Gib Datum (YYYY-MM-DD), Startzeit (HH:MM), Titel und Begründung an.`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Prägnanter Titel des Termins (z.B. 'Keramik bemalen mit Sarah')" },
            datum: { type: SchemaType.STRING, description: "Datum des Termins im Format YYYY-MM-DD (z.B. '2026-10-10')" },
            startzeit: { type: SchemaType.STRING, description: "Startuhrzeit im Format HH:MM (z.B. '15:00')" },
            endzeit: { type: SchemaType.STRING, description: "Optionale Enduhrzeit im Format HH:MM (z.B. '17:00')" },
            ganztaegig: { type: SchemaType.BOOLEAN, description: "Ob der Termin ganztägig ist (optional, Standard: false)" },
            beschreibung: { type: SchemaType.STRING, description: "Optionale Notizen/Details zum Termin" },
            ort: { type: SchemaType.STRING, description: "Ort des Termins (optional)" },
            mailZusammenfassung: { type: SchemaType.STRING, description: "Kurze Zusammenfassung (1-2 Sätze), was grob in der E-Mail stand (z. B. 'Notar Schmidt bittet um Unterzeichnung des Kaufvertrags am Montag')" },
            begruendung: { type: SchemaType.STRING, description: "Gedankengang/Begründung, warum dieser Termin vorgeschlagen wird" },
            agentName: { type: SchemaType.STRING, description: "Name des vorschlagenden Agenten (optional, default: E-Mail-Agent)" },
            conversationId: { type: SchemaType.STRING, description: "ID der Chat-Konversation (optional)" },
            sourceType: { type: SchemaType.STRING, description: "Quelle z. B. 'mail' (optional)" },
            sourceId: { type: SchemaType.STRING, description: "ID der Quelle (optional)" }
          },
          required: ["titel", "datum", "begruendung"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const agentConfig = getAgentConfig(args.agentName || args.sourceType || "mail");
        const agentAvatar = agentConfig?.avatar || "✉️";
        const agentColor = agentConfig?.color || "#fab387";
        const agentName = agentConfig?.name || args.agentName || "E-Mail-Agent";

        let dateDisplay = args.datum;
        try {
          const d = new Date(args.datum + "T00:00:00");
          if (!isNaN(d.getTime())) {
            dateDisplay = d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
          }
        } catch (_) {}

        const timeDisplay = args.ganztaegig ? "Ganztägig" : (args.startzeit ? (args.endzeit ? `${args.startzeit} – ${args.endzeit} Uhr` : `ab ${args.startzeit} Uhr`) : "Uhrzeit offen");

        let validConversationId: string | null = null;
        if (args.conversationId) {
          const convExists = await prisma.conversation.findUnique({
            where: { id: String(args.conversationId) },
            select: { id: true }
          });
          if (convExists) validConversationId = convExists.id;
        }

        const actionData = {
          actionType: "create_event",
          eventData: {
            title: args.titel,
            date: args.datum,
            startTime: args.startzeit || null,
            endTime: args.endzeit || null,
            isAllDay: !!args.ganztaegig,
            description: args.beschreibung || null,
            location: args.ort || null
          }
        };

        const buttons = [
          { label: "Ja, Termin anlegen", action: "execute_action", style: "primary" },
          { label: "Nein, verwerfen", action: "dismiss", style: "secondary" }
        ];

        const mailSummary = args.mailZusammenfassung || args.begruendung || "";
        const messageText = mailSummary
          ? `**Inhalt der E-Mail:**\n${mailSummary}\n\nSoll dieser Termin in deinen Kalender eingetragen werden?`
          : `Soll folgender Termin in deinen Kalender eingetragen werden?`;

        const notif = await prisma.agentNotification.create({
          data: {
            title: `📅 Terminvorschlag: ${args.titel}`,
            message: messageText,
            reasoning: args.begruendung,
            agentName,
            agentAvatar,
            agentColor,
            actionData,
            type: "action_required",
            priority: "normal",
            sourceType: args.sourceType || "mail",
            sourceId: args.sourceId ? String(args.sourceId) : null,
            conversationId: validConversationId,
            buttons
          }
        });

        return {
          status: "success",
          message: `Terminvorschlag für '${args.titel}' wurde auf dem Arbeitstisch zur Bestätigung angelegt. Der Termin wird erst nach deiner Bestätigung (Klick auf 'Ja') fest im Kalender angelegt.`,
          notificationId: notif.id
        };
      }
    },
    {
      definition: {
        name: "schlage_aufgabe_vor",
        description: "Schlägt dem Benutzer eine To-Do-Aufgabe zur Bestätigung auf dem Arbeitstisch vor. Die Aufgabe wird erst erstellt, wenn der Benutzer auf 'Ja' klickt.",
        detailedInstructions: `[SCHLAGE_AUFGABE_VOR]
Nutze dieses Tool, wenn in einer E-Mail eine Aufgabe oder To-Do anfällt (z.B. Unterlagen nachreichen, Rechnung überweisen).
Erstelle niemals selbst Aufgaben per erstelle_aufgabe, sondern schlage sie immer über dieses Tool zur Bestätigung vor.`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Titel der Aufgabe (z.B. 'Rechnung überweisen')" },
            faelligkeit: { type: SchemaType.STRING, description: "Optionales Fälligkeitsdatum YYYY-MM-DD" },
            notizen: { type: SchemaType.STRING, description: "Optionale Details oder Notizen zur Aufgabe" },
            mailZusammenfassung: { type: SchemaType.STRING, description: "Kurze Zusammenfassung (1-2 Sätze), was grob in der E-Mail stand (z. B. 'Der Notar hat den Vertragsentwurf zur Prüfung übersandt')" },
            begruendung: { type: SchemaType.STRING, description: "Gedankengang/Begründung des Agenten" },
            agentName: { type: SchemaType.STRING, description: "Name des Agenten (optional)" },
            conversationId: { type: SchemaType.STRING, description: "ID der Konversation (optional)" },
            sourceType: { type: SchemaType.STRING, description: "Quelle (optional)" },
            sourceId: { type: SchemaType.STRING, description: "ID der Quelle (optional)" }
          },
          required: ["titel", "begruendung"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const agentConfig = getAgentConfig(args.agentName || args.sourceType || "mail");
        const agentAvatar = agentConfig?.avatar || "✉️";
        const agentColor = agentConfig?.color || "#fab387";
        const agentName = agentConfig?.name || args.agentName || "E-Mail-Agent";

        let dateDisplay = args.faelligkeit ? `Fällig am: ${args.faelligkeit}` : "Ohne festes Datum";

        let validConversationId: string | null = null;
        if (args.conversationId) {
          const convExists = await prisma.conversation.findUnique({
            where: { id: String(args.conversationId) },
            select: { id: true }
          });
          if (convExists) validConversationId = convExists.id;
        }

        const actionData = {
          actionType: "create_task",
          taskData: {
            title: args.titel,
            due: args.faelligkeit || null,
            notes: args.notizen || null
          }
        };

        const buttons = [
          { label: "Ja, Aufgabe anlegen", action: "execute_action", style: "primary" },
          { label: "Nein, verwerfen", action: "dismiss", style: "secondary" }
        ];

        const mailSummary = args.mailZusammenfassung || args.begruendung || "";
        const messageText = mailSummary
          ? `**Inhalt der E-Mail:**\n${mailSummary}\n\nSoll diese Aufgabe für dich angelegt werden?`
          : `Soll diese Aufgabe für dich angelegt werden?`;

        const notif = await prisma.agentNotification.create({
          data: {
            title: `📋 Aufgabenvorschlag: ${args.titel}`,
            message: messageText,
            reasoning: args.begruendung,
            agentName,
            agentAvatar,
            agentColor,
            actionData,
            type: "action_required",
            priority: "normal",
            sourceType: args.sourceType || "mail",
            sourceId: args.sourceId ? String(args.sourceId) : null,
            conversationId: validConversationId,
            buttons
          }
        });

        return {
          status: "success",
          message: `Aufgabenvorschlag für '${args.titel}' wurde auf dem Arbeitstisch zur Bestätigung angelegt. Die Aufgabe wird erst nach Klick auf 'Ja' erstellt.`,
          notificationId: notif.id
        };
      }
    },
    {
      definition: {
        name: "schlage_mail_antwort_vor",
        description: "Fragt den Benutzer, was als Antwort auf eine E-Mail geschrieben werden soll, und schlägt einen fertigen Antwortentwurf vor. Die E-Mail wird erst nach Bestätigung gesendet.",
        detailedInstructions: `[SCHLAGE_MAIL_ANTWORT_VOR]
Nutze dieses Tool immer dann, wenn eine E-Mail eine Rückmeldung oder Beantwortung erfordert.
Formuliere im Parameter 'antwortText' einen vollständigen, professionellen und freundlichen Antwortentwurf, den der Benutzer direkt per Klick auf 'Ja, Antwort senden' abschicken oder im Editor anpassen kann.`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            mailId: { type: SchemaType.INTEGER, description: "ID der eingegangenen E-Mail" },
            empfaenger: { type: SchemaType.STRING, description: "E-Mail-Adresse des Empfängers" },
            betreff: { type: SchemaType.STRING, description: "Betreff der Antwort" },
            antwortText: { type: SchemaType.STRING, description: "Der vollständige, vorgeschlagene Antworttext" },
            mailZusammenfassung: { type: SchemaType.STRING, description: "Kurze Zusammenfassung (1-2 Sätze), worum es in der empfangenen E-Mail ging" },
            begruendung: { type: SchemaType.STRING, description: "Begründung/Gedankengang für diesen Antwortvorschlag" },
            agentName: { type: SchemaType.STRING, description: "Name des Agenten (optional)" },
            conversationId: { type: SchemaType.STRING, description: "ID der Konversation (optional)" }
          },
          required: ["mailId", "empfaenger", "betreff", "antwortText", "begruendung"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const agentConfig = getAgentConfig(args.agentName || "mail");
        const agentAvatar = agentConfig?.avatar || "✉️";
        const agentColor = agentConfig?.color || "#fab387";
        const agentName = agentConfig?.name || "E-Mail-Agent";

        let validConversationId: string | null = null;
        if (args.conversationId) {
          const convExists = await prisma.conversation.findUnique({
            where: { id: String(args.conversationId) },
            select: { id: true }
          });
          if (convExists) validConversationId = convExists.id;
        }

        const actionData = {
          actionType: "send_mail_reply",
          replyData: {
            mailId: Number(args.mailId),
            to: args.empfaenger,
            subject: args.betreff,
            body: args.antwortText
          }
        };

        const buttons = [
          { label: "Ja, Antwort senden", action: "execute_action", style: "primary" },
          { label: "Im Editor bearbeiten", action: "open_composer", replyText: String(args.mailId), style: "secondary" },
          { label: "Nein, nicht antworten", action: "dismiss", style: "secondary" }
        ];

        const mailSummary = args.mailZusammenfassung || args.begruendung || "";
        const messageText = mailSummary
          ? `**Inhalt der E-Mail:**\n${mailSummary}\n\nIch habe folgenden Antwortentwurf vorbereitet. Soll ich diese Antwort so abschicken oder möchtest du sie im Editor anpassen?`
          : `Ich habe einen passenden Antwortentwurf für **${args.empfaenger}** vorbereitet. Soll ich diese Antwort so abschicken oder möchtest du sie im Editor anpassen?`;

        const notif = await prisma.agentNotification.create({
          data: {
            title: `✉️ Antwortentwurf: ${args.betreff}`,
            message: messageText,
            reasoning: args.begruendung,
            agentName,
            agentAvatar,
            agentColor,
            actionData,
            type: "action_required",
            priority: "normal",
            sourceType: "mail",
            sourceId: String(args.mailId),
            conversationId: validConversationId,
            buttons
          }
        });

        return {
          status: "success",
          message: `Antwortvorschlag für Mail #${args.mailId} wurde zur Bestätigung angelegt. Die Antwort wird erst nach Klick auf 'Ja' versendet.`,
          notificationId: notif.id
        };
      }
    },
    {
      definition: {
        name: "quittiere_benachrichtigung",
        description: "Markiert eine Benachrichtigung auf dem Arbeitstisch als erledigt/geschlossen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID der Benachrichtigung" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        const updated = await prisma.agentNotification.update({
          where: { id },
          data: { isDismissed: true, isRead: true }
        });
        return {
          status: "success",
          message: `Benachrichtigung ${id} wurde geschlossen.`,
          notification: updated
        };
      }
    },
    {
      definition: {
        name: "liste_benachrichtigungen",
        description: "Ruft aktive Benachrichtigungen und Rückfragen vom Arbeitstisch ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nurOffene: { type: SchemaType.BOOLEAN, description: "Nur ungeschlossene Benachrichtigungen zurückgeben (Standard: true)" }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const nurOffene = args.nurOffene !== false;
        const notifications = await prisma.agentNotification.findMany({
          where: nurOffene ? { isDismissed: false } : {},
          orderBy: { createdAt: "desc" },
          take: 20
        });
        return {
          status: "success",
          count: notifications.length,
          notifications
        };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    const notifications = await prisma.agentNotification.findMany({
      where: { isDismissed: false },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        conversation: {
          select: { id: true, title: true, status: true }
        }
      }
    });

    return [
      {
        pluginName: "Notifications",
        type: "agent_notifications",
        data: {
          notifications: notifications.map(n => ({
            id: n.id,
            title: n.title,
            message: n.message,
            reasoning: (n as any).reasoning || null,
            agentName: (n as any).agentName || (n.sourceType === "mail" ? "E-Mail-Agent" : "Autonomer Agent"),
            type: n.type,
            priority: n.priority,
            sourceType: n.sourceType,
            sourceId: n.sourceId,
            conversationId: n.conversationId,
            buttons: n.buttons,
            agentAvatar: (n as any).agentAvatar || null,
            agentColor: (n as any).agentColor || null,
            actionData: (n as any).actionData || null,
            isRead: n.isRead,
            isDismissed: n.isDismissed,
            selectedButton: n.selectedButton,
            createdAt: n.createdAt.toISOString()
          }))
        }
      }
    ];
  }
};
