import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

export const notesPlugin: Plugin = {
  name: "Notes",
  description: "Ermöglicht das Erstellen, Lesen, Bearbeiten und Löschen von persönlichen Notizen.",
  tools: [
    {
      definition: {
        name: "hole_notizen",
        description: "Ruft alle vorhandenen persönlichen Notizen ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}
        } as any
      },
      handler: async (_, { prisma }) => {
        const notes = await prisma.note.findMany({
          orderBy: { createdAt: "desc" }
        });
        return {
          status: "success",
          notes: notes.map(n => ({
            id: n.id,
            titel: n.title,
            inhalt: n.content,
            erstelltAm: n.createdAt.toISOString()
          }))
        };
      }
    },
    {
      definition: {
        name: "erstelle_notiz",
        description: "Erstellt eine neue persönliche Notiz.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Der Titel der Notiz" },
            inhalt: { type: SchemaType.STRING, description: "Der Inhalt der Notiz" }
          },
          required: ["titel", "inhalt"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const note = await prisma.note.create({
          data: {
            title: args.titel,
            content: args.inhalt
          }
        });
        return {
          status: "success",
          message: `Notiz '${args.titel}' wurde erfolgreich erstellt.`,
          note: {
            id: note.id,
            titel: note.title,
            inhalt: note.content,
            erstelltAm: note.createdAt.toISOString()
          }
        };
      }
    },
    {
      definition: {
        name: "bearbeite_notiz",
        description: "Bearbeitet eine bestehende persönliche Notiz anhand ihrer ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID der zu bearbeitenden Notiz" },
            titel: { type: SchemaType.STRING, description: "Der neue Titel der Notiz (optional)" },
            inhalt: { type: SchemaType.STRING, description: "Der neue Inhalt der Notiz (optional)" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        const data: any = {};
        if (args.titel !== undefined) data.title = args.titel;
        if (args.inhalt !== undefined) data.content = args.inhalt;

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
            erstelltAm: updatedNote.createdAt.toISOString()
          }
        };
      }
    },
    {
      definition: {
        name: "loesche_notiz",
        description: "Löscht eine persönliche Notiz anhand ihrer ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID der zu löschenden Notiz" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        await prisma.note.delete({
          where: { id }
        });
        return {
          status: "success",
          message: `Notiz mit ID ${id} wurde gelöscht.`
        };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    const notes = await prisma.note.findMany({
      orderBy: { createdAt: "desc" }
    });

    return [
      {
        pluginName: "Notes",
        type: "custom", // standard fallback pattern
        data: {
          widgetType: "notes_list",
          notes: notes.map(n => ({
            id: n.id,
            title: n.title,
            content: n.content,
            createdAt: n.createdAt.toISOString()
          }))
        }
      } as any
    ];
  },
  entityConfig: {
    type: "note",
    prefix: "app://note/",
    color: "rgba(249, 226, 175, 0.15)",
    borderColor: "#f9e2af",
    icon: "📝",
    displayName: "Notiz"
  },
  resolveEntity: async (id, { prisma }) => {
    return prisma.note.findUnique({ where: { id } });
  }
};
