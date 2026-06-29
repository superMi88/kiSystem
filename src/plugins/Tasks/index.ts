import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

export function calculateNextDueDate(currentDue: Date, recurrence: string): Date {
  const next = new Date(currentDue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let stepped = false;
  while (!stepped || next <= today) {
    stepped = true;
    switch (recurrence.toLowerCase()) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        return next;
    }
  }
  return next;
}

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
          properties: {
            zeigeGeloeschte: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur gelöschte Aufgaben zurückgegeben. Standard ist false." }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const zeigeGeloeschte = !!args.zeigeGeloeschte;
        const tasks = await prisma.task.findMany({
          where: { completed: false, isDeleted: zeigeGeloeschte },
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
            aufgabenlisteTitel: t.listTitle,
            wiederholung: t.recurrence || null
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
            aufgabenlisteTitel: { type: SchemaType.STRING, description: "Die Aufgabenliste/Kategorie. Standardwert ist 'Standard' (optional)" },
            recurrence: { type: SchemaType.STRING, description: "Wiederholungsintervall: 'daily', 'weekly', 'monthly', 'yearly' oder 'none' (optional)" }
          },
          required: ["titel"]
        } as any
      },
      handler: async (args, { prisma }) => {
        let due = args.datum ? new Date(args.datum) : undefined;
        const recurrence = args.recurrence && args.recurrence !== "none" ? args.recurrence.toLowerCase() : null;
        
        // If recurrence is set but no due date is provided, default to today
        if (recurrence && !due) {
          due = new Date();
          due.setHours(0, 0, 0, 0);
        }

        try {
          const task = await prisma.task.create({
            data: {
              title: args.titel,
              notes: args.notizen || null,
              due: due || null,
              listTitle: args.aufgabenlisteTitel || "Standard",
              recurrence: recurrence
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
              aufgabenlisteTitel: task.listTitle,
              recurrence: task.recurrence
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
          const task = await prisma.task.findUnique({ where: { id: Number(args.taskId) } });
          if (task && task.recurrence && task.due) {
            const nextDue = calculateNextDueDate(task.due, task.recurrence);
            await prisma.task.update({
              where: { id: Number(args.taskId) },
              data: {
                due: nextDue,
                completed: false
              }
            });
            return {
              status: "success",
              message: `Wiederkehrende Aufgabe auf das nächste Datum (${nextDue.toISOString().split('T')[0]}) verschoben.`,
              nextDue: nextDue.toISOString()
            };
          } else {
            await prisma.task.update({
              where: { id: Number(args.taskId) },
              data: { completed: true }
            });
            return {
              status: "success",
              message: "Aufgabe erfolgreich als erledigt markiert."
            };
          }
        } catch (e: any) {
          return { status: "error", message: `Fehler: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "loesche_aufgabe",
        description: "Löscht eine Aufgabe aus der lokalen Datenbank (markiert als gelöscht).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            taskId: { type: SchemaType.STRING, description: "Die ID der zu löschenden Aufgabe" }
          },
          required: ["taskId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          await prisma.task.update({
            where: { id: Number(args.taskId) },
            data: { isDeleted: true }
          });
          return {
            status: "success",
            message: "Aufgabe erfolgreich gelöscht."
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Löschen: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "wiederherstellen_aufgabe",
        description: "Stellt eine gelöschte Aufgabe wieder her.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            taskId: { type: SchemaType.STRING, description: "Die ID der wiederherzustellenden Aufgabe" }
          },
          required: ["taskId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          await prisma.task.update({
            where: { id: Number(args.taskId) },
            data: { isDeleted: false }
          });
          return {
            status: "success",
            message: "Aufgabe erfolgreich wiederhergestellt."
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Wiederherstellen: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "aktualisiere_aufgabe",
        description: "Aktualisiert eine bestehende Aufgabe in der lokalen Datenbank.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            taskId: { type: SchemaType.STRING, description: "Die ID der zu aktualisierenden Aufgabe" },
            titel: { type: SchemaType.STRING, description: "Der neue Titel der Aufgabe (optional)" },
            notizen: { type: SchemaType.STRING, description: "Zusätzliche Notizen oder Beschreibung der Aufgabe (optional)" },
            datum: { type: SchemaType.STRING, description: "Fälligkeitsdatum im Format YYYY-MM-DD (optional, 'null' zum Entfernen)" },
            aufgabenlisteTitel: { type: SchemaType.STRING, description: "Die Aufgabenliste/Kategorie (optional)" },
            recurrence: { type: SchemaType.STRING, description: "Neues Wiederholungsintervall: 'daily', 'weekly', 'monthly', 'yearly' oder 'none' (optional)" }
          },
          required: ["taskId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          const updateData: any = {};
          if (args.titel !== undefined) updateData.title = args.titel;
          if (args.notizen !== undefined) updateData.notes = args.notizen || null;
          if (args.datum !== undefined) {
            updateData.due = args.datum && args.datum !== "null" ? new Date(args.datum) : null;
          }
          if (args.aufgabenlisteTitel !== undefined) updateData.listTitle = args.aufgabenlisteTitel || "Standard";
          if (args.recurrence !== undefined) {
            updateData.recurrence = args.recurrence === "none" ? null : args.recurrence.toLowerCase();
            // If recurrence is set but there's no due date, default to today
            if (updateData.recurrence && args.datum === undefined) {
              const existing = await prisma.task.findUnique({ where: { id: Number(args.taskId) } });
              if (existing && !existing.due) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                updateData.due = today;
              }
            }
          }

          await prisma.task.update({
            where: { id: Number(args.taskId) },
            data: updateData
          });
          return {
            status: "success",
            message: "Aufgabe erfolgreich aktualisiert."
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Aktualisieren: ${e.message}` };
        }
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    let tasks: any[] = [];
    try {
      tasks = await prisma.task.findMany({
        where: { completed: false, isDeleted: false },
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
            notes: t.notes || "",
            due: t.due ? t.due.toISOString() : null,
            listTitle: t.listTitle,
            recurrence: t.recurrence
          }))
        }
      } as any
    ];
  },
  entityConfig: {
    type: "task",
    prefix: "app://task/",
    color: "rgba(166, 227, 161, 0.15)",
    borderColor: "#a6e3a1",
    icon: "✅",
    displayName: "Aufgabe"
  },
  resolveEntity: async (id, { prisma }) => {
    return prisma.task.findUnique({ where: { id } });
  }
};
