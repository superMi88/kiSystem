import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

export const timerPlugin: Plugin = {
  name: "Timer",
  description: "Verwaltet Timer und Wecker mit Echtzeit-Countdowns.",
  tools: [
    {
      definition: {
        name: "erstelle_timer",
        description: "Erstellt einen neuen Timer oder Wecker für eine bestimmte Uhrzeit oder Dauer.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Der Name oder Grund des Timers (z. B. 'Nudeln', 'Meeting')" },
            sekunden: { type: SchemaType.INTEGER, description: "Dauer des Timers in Sekunden. Verwende dies bevorzugt bei relativen Angaben wie 'in 15 Minuten' oder 'für 10 Sekunden'." },
            expiresAt: { type: SchemaType.STRING, description: "Die genaue Ziel-Uhrzeit/Ablaufzeitpunkt im ISO-Format mit lokalem Offset (z. B. YYYY-MM-DDTHH:mm:ss+02:00). Nur erforderlich, wenn keine Sekunden angegeben sind." }
          },
          required: []
        } as any
      },
      handler: async (args, { prisma }) => {
        const title = args.titel || "Timer";
        let expiresAt: Date;
        
        if (args.sekunden) {
          expiresAt = new Date(Date.now() + Number(args.sekunden) * 1000);
        } else if (args.expiresAt) {
          expiresAt = new Date(args.expiresAt);
        } else {
          throw new Error("Entweder 'sekunden' oder 'expiresAt' muss angegeben werden.");
        }

        const timer = await prisma.timer.create({
          data: {
            title,
            expiresAt,
          }
        });
        return {
          status: "success",
          message: `Timer '${title}' erstellt für ${expiresAt.toLocaleString('de-DE')}.`,
          timer: {
            id: timer.id,
            title: timer.title,
            createdAt: timer.createdAt.toISOString(),
            expiresAt: timer.expiresAt.toISOString(),
          }
        };
      }
    },
    {
      definition: {
        name: "loesche_timer",
        description: "Löscht oder bricht einen Timer ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID des zu löschenden Timers" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        await prisma.timer.delete({
          where: { id }
        });
        return { status: "success", message: "Timer gelöscht." };
      }
    },
    {
      definition: {
        name: "quittiere_timer",
        description: "Markiert einen abgelaufenen Timer als erledigt/bestätigt.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID des zu quittierenden Timers" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        await prisma.timer.update({
          where: { id },
          data: { completed: true }
        });
        return { status: "success", message: "Timer quittiert." };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    // Hole alle aktiven (nicht quittierten) Timer
    const timers = await prisma.timer.findMany({
      where: { completed: false },
      orderBy: { expiresAt: "asc" }
    });

    return [
      {
        pluginName: "Timer",
        type: "timer_list",
        data: {
          timers: timers.map(t => ({
            id: t.id,
            title: t.title,
            createdAt: t.createdAt.toISOString(),
            expiresAt: t.expiresAt.toISOString()
          }))
        }
      }
    ];
  }
};
