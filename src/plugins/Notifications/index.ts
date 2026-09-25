import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

export const notificationsPlugin: Plugin = {
  name: "Notifications",
  description: "Verwaltet Benachrichtigungen, Fragen und Handlungsbedarf von autonomen Agent Runs für den Arbeitstisch.",
  tools: [
    {
      definition: {
        name: "erstelle_benachrichtigung",
        description: "Erstellt eine Benachrichtigung oder Frage mit interaktiven Buttons für den Benutzer auf dem Arbeitstisch.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: {
              type: SchemaType.STRING,
              description: "Prägnanter Betreff oder Titel der Benachrichtigung (z. B. 'Veranstaltung: Keramik bemalen' oder 'Nina auf Parship')"
            },
            nachricht: {
              type: SchemaType.STRING,
              description: "Der Text der Benachrichtigung oder die Frage an den Benutzer (z. B. 'In der E-Mail steht, dass am 18.09. ein Event stattfindet. Soll ich das als Termin in deinen Kalender eintragen?')"
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

        const notif = await prisma.agentNotification.create({
          data: {
            title: args.titel,
            message: args.nachricht,
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
            type: n.type,
            priority: n.priority,
            sourceType: n.sourceType,
            sourceId: n.sourceId,
            conversationId: n.conversationId,
            buttons: n.buttons,
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
