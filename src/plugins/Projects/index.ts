import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

async function matchPersonsForProjects(projects: any[], prisma: any): Promise<any[]> {
  try {
    const persons = await prisma.person.findMany({
      where: { isDeleted: false },
      include: { aliases: true }
    });

    return projects.map(p => {
      let text = p.name;
      p.tasks.forEach((t: any) => text += ` ${t.title} ${t.notes || ""}`);
      p.notes.forEach((n: any) => text += ` ${n.title} ${n.content}`);

      const matched: { id: number; name: string }[] = [];
      for (const pers of persons) {
        const hasMatch = pers.aliases.some((alias: any) => {
          const escaped = alias.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          return regex.test(text);
        });

        if (hasMatch) {
          const primaryAlias = pers.aliases.find((a: any) => a.isPrimary) || pers.aliases[0];
          matched.push({
            id: pers.id,
            name: primaryAlias ? primaryAlias.name : "Unbekannt"
          });
        }
      }
      return { ...p, persons: matched };
    });
  } catch (e) {
    console.error("Fehler beim Personen-Matching für Projekte:", e);
    return projects.map(p => ({ ...p, persons: [] }));
  }
}

async function matchPersonsForNotes(notes: any[], prisma: any): Promise<any[]> {
  try {
    const persons = await prisma.person.findMany({
      where: { isDeleted: false },
      include: { aliases: true }
    });

    return notes.map(n => {
      const text = `${n.title} ${n.content}`;
      const matched: { id: number; name: string }[] = [];
      for (const pers of persons) {
        const hasMatch = pers.aliases.some((alias: any) => {
          const escaped = alias.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          return regex.test(text);
        });

        if (hasMatch) {
          const primaryAlias = pers.aliases.find((a: any) => a.isPrimary) || pers.aliases[0];
          matched.push({
            id: pers.id,
            name: primaryAlias ? primaryAlias.name : "Unbekannt"
          });
        }
      }
      return { ...n, persons: matched };
    });
  } catch (e) {
    console.error("Fehler beim Personen-Matching für Notizen:", e);
    return notes.map(n => ({ ...n, persons: [] }));
  }
}

export const projectsPlugin: Plugin = {
  name: "Projects",
  description: "Ermöglicht das Verwalten von Projekten, die Aufgaben und Notizen bündeln.",
  tools: [
    // --- PROJEKT TOOLS ---
    {
      definition: {
        name: "hole_projekte",
        description: "Ruft alle vorhandenen Projekte mitsamt ihren Aufgaben und Notizen ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            zeigeGeloeschte: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur gelöschte Projekte zurückgegeben. Standard ist false." }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const zeigeGeloeschte = !!args.zeigeGeloeschte;
        const projects = await prisma.project.findMany({
          where: { isDeleted: zeigeGeloeschte },
          include: {
            tasks: { where: { isDeleted: false } },
            notes: { where: { isDeleted: false } }
          },
          orderBy: { createdAt: "desc" }
        });

        const matchedProjects = await matchPersonsForProjects(projects, prisma);

        return {
          status: "success",
          projects: matchedProjects.map(p => ({
            id: p.id,
            name: p.name,
            erstelltAm: p.createdAt.toISOString(),
            personen: p.persons,
            aufgaben: p.tasks.map((t: any) => ({
              id: String(t.id),
              titel: t.title,
              notizen: t.notes || "",
              erledigt: t.completed
            })),
            notizen: p.notes.map((n: any) => ({
              id: n.id,
              titel: n.title,
              inhalt: n.content,
              erstelltAm: n.createdAt.toISOString()
            }))
          }))
        };
      }
    },
    {
      definition: {
        name: "erstelle_projekt",
        description: "Erstellt ein neues Projekt.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "Der Name des Projekts" }
          },
          required: ["name"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const project = await prisma.project.create({
          data: { name: args.name }
        });
        return {
          status: "success",
          message: `Projekt '${args.name}' wurde erfolgreich erstellt.`,
          project: {
            id: project.id,
            name: project.name,
            erstelltAm: project.createdAt.toISOString()
          }
        };
      }
    },
    {
      definition: {
        name: "bearbeite_projekt",
        description: "Bearbeitet den Namen eines bestehenden Projekts.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID des Projekts" },
            name: { type: SchemaType.STRING, description: "Der neue Name des Projekts" }
          },
          required: ["id", "name"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        const project = await prisma.project.update({
          where: { id },
          data: { name: args.name }
        });
        return {
          status: "success",
          message: `Projekt mit ID ${id} wurde in '${args.name}' umbenannt.`,
          project: {
            id: project.id,
            name: project.name
          }
        };
      }
    },
    {
      definition: {
        name: "loesche_projekt",
        description: "Markiert ein Projekt als gelöscht.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID des Projekts" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        await prisma.project.update({
          where: { id },
          data: { isDeleted: true }
        });
        return {
          status: "success",
          message: `Projekt mit ID ${id} wurde als gelöscht markiert.`
        };
      }
    },
    {
      definition: {
        name: "wiederherstellen_projekt",
        description: "Stellt ein gelöschtes Projekt wieder her.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID des Projekts" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        await prisma.project.update({
          where: { id },
          data: { isDeleted: false }
        });
        return {
          status: "success",
          message: `Projekt mit ID ${id} wurde erfolgreich wiederhergestellt.`
        };
      }
    },

    // --- NOTES/NOTIZEN TOOLS (integriert in Projekte) ---
    {
      definition: {
        name: "hole_notizen",
        description: "Ruft alle vorhandenen persönlichen Notizen ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            zeigeGeloeschte: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur gelöschte Notizen zurückgegeben. Standard ist false." }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const zeigeGeloeschte = !!args.zeigeGeloeschte;
        const notes = await prisma.note.findMany({
          where: { isDeleted: zeigeGeloeschte },
          orderBy: { createdAt: "desc" }
        });
        const matchedNotes = await matchPersonsForNotes(notes, prisma);
        return {
          status: "success",
          notes: matchedNotes.map(n => ({
            id: n.id,
            titel: n.title,
            inhalt: n.content,
            projectId: n.projectId,
            personen: n.persons,
            erstelltAm: n.createdAt.toISOString()
          }))
        };
      }
    },
    {
      definition: {
        name: "erstelle_notiz",
        description: "Erstellt eine neue persönliche Notiz, optional in einem Projekt.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Der Titel der Notiz" },
            inhalt: { type: SchemaType.STRING, description: "Der Inhalt der Notiz" },
            projectId: { type: SchemaType.INTEGER, description: "Die ID des zugehörigen Projekts (optional)" }
          },
          required: ["titel", "inhalt"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const projectId = args.projectId ? Number(args.projectId) : null;
        const note = await prisma.note.create({
          data: {
            title: args.titel,
            content: args.inhalt,
            projectId: projectId
          }
        });
        return {
          status: "success",
          message: `Notiz '${args.titel}' wurde erfolgreich erstellt.`,
          note: {
            id: note.id,
            titel: note.title,
            inhalt: note.content,
            projectId: note.projectId,
            erstelltAm: note.createdAt.toISOString()
          }
        };
      }
    },
    {
      definition: {
        name: "bearbeite_notiz",
        description: "Bearbeitet eine bestehende persönliche Notiz.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID der Notiz" },
            titel: { type: SchemaType.STRING, description: "Der neue Titel der Notiz (optional)" },
            inhalt: { type: SchemaType.STRING, description: "Der neue Inhalt der Notiz (optional)" },
            projectId: { type: SchemaType.INTEGER, description: "Die ID des zugehörigen Projekts (optional, 'null' zum Entfernen)" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        const data: any = {};
        if (args.titel !== undefined) data.title = args.titel;
        if (args.inhalt !== undefined) data.content = args.inhalt;
        if (args.projectId !== undefined) {
          data.projectId = args.projectId === "null" || args.projectId === null ? null : Number(args.projectId);
        }

        const updatedNote = await prisma.note.update({
          where: { id },
          data
        });

        return {
          status: "success",
          message: `Notiz mit ID ${id} wurde aktualisiert.`,
          note: {
            id: updatedNote.id,
            titel: updatedNote.title,
            inhalt: updatedNote.content,
            projectId: updatedNote.projectId,
            erstelltAm: updatedNote.createdAt.toISOString()
          }
        };
      }
    },
    {
      definition: {
        name: "loesche_notiz",
        description: "Löscht eine persönliche Notiz (markiert als gelöscht).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID der Notiz" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        await prisma.note.update({
          where: { id },
          data: { isDeleted: true }
        });
        return {
          status: "success",
          message: `Notiz mit ID ${id} wurde gelöscht.`
        };
      }
    },
    {
      definition: {
        name: "wiederherstellen_notiz",
        description: "Stellt eine gelöschte persönliche Notiz wieder her.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID der Notiz" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        await prisma.note.update({
          where: { id },
          data: { isDeleted: false }
        });
        return {
          status: "success",
          message: `Notiz mit ID ${id} wurde erfolgreich wiederhergestellt.`
        };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    const projects = await prisma.project.findMany({
      where: { isDeleted: false },
      include: {
        tasks: {
          where: { isDeleted: false },
          orderBy: [
            { completed: "asc" },
            { createdAt: "asc" }
          ]
        },
        notes: {
          where: { isDeleted: false }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const unassignedTasks = await prisma.task.findMany({
      where: { projectId: null, due: null, isDeleted: false },
      orderBy: [
        { completed: "asc" },
        { createdAt: "asc" }
      ]
    });

    const unassignedNotes = await prisma.note.findMany({
      where: { projectId: null, isDeleted: false },
      orderBy: { createdAt: "desc" }
    });

    const matchedProjects = await matchPersonsForProjects(projects, prisma);
    const matchedUnassignedNotes = await matchPersonsForNotes(unassignedNotes, prisma);

    return [
      {
        pluginName: "Projects",
        type: "custom",
        data: {
          widgetType: "projects_list",
          projects: matchedProjects.map(p => ({
            id: p.id,
            name: p.name,
            createdAt: p.createdAt.toISOString(),
            persons: p.persons,
            tasks: p.tasks.map((t: any) => ({
              id: String(t.id),
              title: t.title,
              notes: t.notes || "",
              completed: t.completed
            })),
            notes: p.notes.map((n: any) => ({
              id: n.id,
              title: n.title,
              content: n.content,
              createdAt: n.createdAt.toISOString()
            }))
          })),
          unassignedTasks: unassignedTasks.map(t => ({
            id: String(t.id),
            title: t.title,
            notes: t.notes || "",
            completed: t.completed
          })),
          unassignedNotes: matchedUnassignedNotes.map(n => ({
            id: n.id,
            title: n.title,
            content: n.content,
            createdAt: n.createdAt.toISOString(),
            persons: n.persons
          }))
        }
      } as any
    ];
  },
  entityConfig: {
    type: "project",
    prefix: "app://project/",
    color: "rgba(249, 226, 175, 0.15)",
    borderColor: "#f9e2af",
    icon: "📁",
    displayName: "Projekt"
  },
  resolveEntity: async (id, { prisma }) => {
    return prisma.project.findUnique({
      where: { id },
      include: {
        tasks: { where: { isDeleted: false } },
        notes: { where: { isDeleted: false } }
      }
    });
  }
};
