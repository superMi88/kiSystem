import { Plugin } from "../types.js";
import { SchemaType, GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { getEventsForRange } from "../Calendar/index.js";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });

export function parseLocalDate(dateStr?: string): Date {
  if (!dateStr || dateStr.trim() === "") {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(`${dateStr.trim()}T12:00:00.000Z`);
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(12, 0, 0, 0);
    return parsed;
  }
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export async function getDaySummaryData(targetDate: Date, prisma: any) {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const day = targetDate.getDate();

  const localStart = new Date(year, month, day, 0, 0, 0, 0);
  const localEnd = new Date(year, month, day, 23, 59, 59, 999);

  const utcStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const utcEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  const startOfDay = localStart < utcStart ? localStart : utcStart;
  const endOfDay = localEnd > utcEnd ? localEnd : utcEnd;

  // 1. Handgeschriebene Tagebucheinträge für diesen Tag
  const diaryEntries = await prisma.diaryEntry.findMany({
    where: {
      isDeleted: false,
      date: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // 2. Kalendertermine an diesem Tag
  const events = await getEventsForRange(startOfDay, endOfDay, prisma);

  // 3. An diesem Tag erledigte Aufgaben (basierend auf completedAt)
  const completedTasks = await prisma.task.findMany({
    where: {
      isDeleted: false,
      completed: true,
      completedAt: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    orderBy: { completedAt: 'asc' }
  });

  return {
    date: targetDate.toISOString().split('T')[0],
    diaryEntries: diaryEntries.map((e: any) => ({
      id: e.id,
      title: e.title || "Tagebucheintrag",
      content: e.content,
      createdAt: e.createdAt
    })),
    events: events.filter((ev: any) => !ev.isTask).map((ev: any) => ({
      id: ev.id,
      title: ev.title,
      description: ev.description || "",
      start: ev.start || ev.time,
      end: ev.end || ev.endTime,
      isAllDay: !!ev.isAllDay,
      isBirthday: !!ev.isBirthday
    })),
    completedTasks: completedTasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      completedAt: t.completedAt,
      listTitle: t.listTitle
    }))
  };
}

export const journalPlugin: Plugin = {
  name: "Journal",
  description: "Verwaltet das Tagebuch mit täglichen Einträgen, Aktivitäten, Kalenderereignissen, erledigten Aufgaben und semantischer Vektorsuche.",
  tools: [
    {
      definition: {
        name: "eintrag_ins_tagebuch",
        description: "Erstellt oder ergänzt einen Tagebucheintrag für einen bestimmten Tag (Standard: heute). Erstellt automatisch eine semantische Vektoreinbettung.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            inhalt: { type: SchemaType.STRING, description: "Der Inhalt des Tagebucheintrags (Gedanken, Erlebnisse, Notizen)." },
            titel: { type: SchemaType.STRING, description: "Optionaler Titel für den Eintrag." },
            datum: { type: SchemaType.STRING, description: "Optionales Datum im Format YYYY-MM-DD. Standard ist heute." }
          },
          required: ["inhalt"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { inhalt, titel, datum } = args;
        const targetDate = parseLocalDate(datum);

        let embedding: number[] | null = null;
        try {
          const result = await embeddingModel.embedContent(inhalt);
          embedding = result.embedding.values;
        } catch (e) {
          console.error("Fehler beim Erstellen der Vektoreinbettung für Tagebuch:", e);
        }

        let saved = false;
        if (embedding && embedding.length > 0) {
          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "DiaryEntry" (date, title, content, embedding, "createdAt", "updatedAt", "isDeleted")
               VALUES ($1, $2, $3, $4::vector, NOW(), NOW(), false)`,
              targetDate,
              titel || null,
              inhalt,
              `[${embedding.join(",")}]`
            );
            saved = true;
          } catch (rawErr) {
            console.warn("Vektoreinbettung konnte nicht direkt als vector gespeichert werden, Fallback auf Standard-Insert:", rawErr);
          }
        }
        
        if (!saved) {
          await prisma.diaryEntry.create({
            data: {
              date: targetDate,
              title: titel || null,
              content: inhalt
            }
          });
        }

        const formattedDate = targetDate.toISOString().split('T')[0];
        return {
          status: "success",
          message: `Tagebucheintrag für den ${formattedDate} wurde erfolgreich gespeichert.`
        };
      }
    },
    {
      definition: {
        name: "lies_tagebuch",
        description: "Liest das Tagebuch und die Tagesübersicht (Einträge, Termine, erledigte Aufgaben) für einen bestimmten Tag oder Zeitraum.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            datum: { type: SchemaType.STRING, description: "Das Datum im Format YYYY-MM-DD. Standard ist heute." },
            startDatum: { type: SchemaType.STRING, description: "Optional: Startdatum für einen Zeitraum (YYYY-MM-DD)." },
            endDatum: { type: SchemaType.STRING, description: "Optional: Enddatum für einen Zeitraum (YYYY-MM-DD)." }
          },
          required: []
        } as any
      },
      handler: async (args, { prisma }) => {
        const { datum, startDatum, endDatum } = args;

        if (startDatum && endDatum) {
          const start = parseLocalDate(startDatum);
          const end = parseLocalDate(endDatum);
          start.setUTCHours(0, 0, 0, 0);
          end.setUTCHours(23, 59, 59, 999);

          const entries = await prisma.diaryEntry.findMany({
            where: {
              isDeleted: false,
              date: { gte: start, lte: end }
            },
            orderBy: { date: 'asc' }
          });

          return {
            zeitraum: `${startDatum} bis ${endDatum}`,
            eintraege: entries.map((e: any) => ({
              id: e.id,
              datum: e.date.toISOString().split('T')[0],
              titel: e.title || "Tagebucheintrag",
              inhalt: e.content
            }))
          };
        }

        const targetDate = parseLocalDate(datum);
        const summary = await getDaySummaryData(targetDate, prisma);
        return summary;
      }
    },
    {
      definition: {
        name: "suche_im_tagebuch",
        description: "Sucht semantisch (Vektorsuche) im Tagebuch nach vergangenen Erlebnissen, Notizen und Einträgen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            suchbegriff: { type: SchemaType.STRING, description: "Die Frage oder der Begriff, nach dem im Tagebuch gesucht werden soll." },
            limit: { type: SchemaType.INTEGER, description: "Maximale Anzahl an Ergebnissen (Standard: 5)." }
          },
          required: ["suchbegriff"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { suchbegriff, limit: inputLimit } = args;
        const limit = inputLimit ? Number(inputLimit) : 5;

        let matches: any[] = [];
        try {
          const result = await embeddingModel.embedContent(suchbegriff);
          const embedding = result.embedding.values;

          matches = await prisma.$queryRawUnsafe(
            `SELECT id, date, title, content, "createdAt"
             FROM "DiaryEntry"
             WHERE "isDeleted" = false AND embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector LIMIT $2`,
            `[${embedding.join(",")}]`,
            limit
          );
        } catch (searchErr) {
          console.warn("Vektorsuche fehlgeschlagen oder nicht verfügbar, Fallback auf Textsuche:", searchErr);
          const fallbackEntries = await prisma.diaryEntry.findMany({
            where: {
              isDeleted: false,
              OR: [
                { content: { contains: suchbegriff, mode: 'insensitive' } },
                { title: { contains: suchbegriff, mode: 'insensitive' } }
              ]
            },
            take: limit,
            orderBy: { date: 'desc' }
          });
          matches = fallbackEntries;
        }

        if (matches.length === 0) {
          return { message: "Keine passenden Tagebucheinträge gefunden." };
        }

        return {
          suchbegriff,
          ergebnisse: matches.map(m => ({
            id: m.id,
            datum: new Date(m.date).toISOString().split('T')[0],
            titel: m.title || "Tagebucheintrag",
            inhalt: m.content,
            erstelltAm: m.createdAt
          }))
        };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    try {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const summary = await getDaySummaryData(today, prisma);

      return [
        {
          pluginName: "Journal",
          type: "custom",
          data: {
            widgetType: "journal_widget",
            todaySummary: summary
          }
        }
      ];
    } catch (e) {
      console.error("Fehler beim Laden des Journal-Widgets:", e);
      return [];
    }
  },
  entityConfig: {
    type: "journal",
    prefix: "app://journal/",
    color: "rgba(250, 179, 135, 0.15)",
    borderColor: "#fab387",
    icon: "📖",
    displayName: "Tagebuch"
  },
  resolveEntity: async (id, { prisma }) => {
    return prisma.diaryEntry.findUnique({
      where: { id: Number(id) }
    });
  }
};
