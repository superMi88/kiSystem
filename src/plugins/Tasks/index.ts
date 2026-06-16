import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

export const tasksPlugin: Plugin = {
  name: "Tasks",
  description: "Ermöglicht das Verwalten und Erstellen von Aufgaben in der lokalen Datenbank.",
  tools: [
    {
      definition: {
        name: "hole_aufgaben",
        description: "Ruft alle unvollständigen Aufgaben aus der lokalen Datenbank ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}
        } as any
      },
      handler: async (_, { prisma }) => {
        const tasks = await prisma.task.findMany({
          where: { completed: false },
          orderBy: { createdAt: "desc" }
        });
        return {
          status: "success",
          tasks: tasks.map(t => ({
            id: String(t.id),
            titel: t.title,
            notizen: t.notes || "",
            faellig: t.due ? t.due.toISOString() : null,
            aufgabenlisteId: t.listTitle,
            aufgabenlisteTitel: t.listTitle
          }))
        };
      }
    },
    {
      definition: {
        name: "erstelle_aufgabe",
        description: "Erstellt eine neue Aufgabe in der lokalen Datenbank.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Der Titel der Aufgabe" },
            notizen: { type: SchemaType.STRING, description: "Zusätzliche Notizen oder Beschreibung der Aufgabe (optional)" },
            datum: { type: SchemaType.STRING, description: "Fälligkeitsdatum im Format YYYY-MM-DD (optional)" },
            aufgabenlisteTitel: { type: SchemaType.STRING, description: "Die Aufgabenliste/Kategorie. Standardwert ist 'Standard' (optional)" }
          },
          required: ["titel"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const due = args.datum ? new Date(args.datum) : undefined;
        try {
          const task = await prisma.task.create({
            data: {
              title: args.titel,
              notes: args.notizen || null,
              due: due || null,
              listTitle: args.aufgabenlisteTitel || "Standard"
            }
          });
          return {
            status: "success",
            message: `Aufgabe '${args.titel}' wurde erstellt.`,
            aufgabe: {
              id: String(task.id),
              titel: task.title,
              notizen: task.notes || "",
              faellig: task.due ? task.due.toISOString() : null,
              aufgabenlisteTitel: task.listTitle
            }
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Erstellen: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "erledige_aufgabe",
        description: "Markiert eine Aufgabe als erledigt.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            taskId: { type: SchemaType.STRING, description: "Die ID der Aufgabe" }
          },
          required: ["taskId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          await prisma.task.update({
            where: { id: Number(args.taskId) },
            data: { completed: true }
          });
          return {
            status: "success",
            message: "Aufgabe erfolgreich als erledigt markiert."
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler: ${e.message}` };
        }
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    let tasks: any[] = [];
    try {
      tasks = await prisma.task.findMany({
        where: { completed: false },
        orderBy: { createdAt: "asc" }
      });
    } catch (e) {
      console.warn("Fehler beim Laden der lokalen Aufgaben:", e);
    }

    return [
      {
        pluginName: "Tasks",
        type: "custom",
        data: {
          widgetType: "tasks_overview",
          tasks: tasks.map(t => ({
            id: String(t.id),
            tasklistId: t.listTitle,
            title: t.title,
            due: t.due ? t.due.toISOString() : null,
            listTitle: t.listTitle
          }))
        }
      } as any
    ];
  }
};
