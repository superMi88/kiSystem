import { Plugin } from "../types.js";
import { SchemaType, GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

export const memoryPlugin: Plugin = {
  name: "Memory",
  description: "Speichert Informationen über Personen und Fakten mittels Vektordatenbank für semantische Suche.",
  tools: [
    {
      definition: {
        name: "erinnere_dich",
        description: "Speichert eine Information im Langzeitgedächtnis (semantisch). Gut für unstrukturierte Erlebnisse.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            text: { type: SchemaType.STRING, description: "Die Information, die gemerkt werden soll." },
            personName: { type: SchemaType.STRING, description: "Optionaler Name der Person, auf die sich das bezieht." },
            kontext: { type: SchemaType.STRING, description: "Zusätzlicher Kontext (z.B. 'Gespräch über Urlaub')." }
          },
          required: ["text"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { text, personName, kontext } = args;
        const result = await embeddingModel.embedContent(text);
        const embedding = result.embedding.values;

        let personId: number | undefined;
        if (personName) {
          const person = await prisma.person.upsert({
            where: { name: personName },
            update: {},
            create: { name: personName }
          });
          personId = person.id;
        }

        await prisma.$executeRawUnsafe(
          `INSERT INTO "SemanticMemory" (content, embedding, metadata, "personId", "createdAt") 
           VALUES ($1, $2::vector, $3, $4, NOW())`,
          text,
          `[${embedding.join(",")}]`,
          JSON.stringify({ kontext, source: "chat" }),
          personId || null
        );

        return { status: "success", message: "Ich werde mich daran erinnern." };
      }
    },
    {
      definition: {
        name: "suche_im_gedaechtnis",
        description: "Sucht semantisch im Langzeitgedächtnis nach relevanten Informationen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            frage: { type: SchemaType.STRING, description: "Die Frage oder der Suchbegriff." },
            personName: { type: SchemaType.STRING, description: "Optional: Nur nach Informationen zu dieser Person suchen." }
          },
          required: ["frage"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { frage } = args;
        const result = await embeddingModel.embedContent(frage);
        const embedding = result.embedding.values;

        const memories: any[] = await prisma.$queryRawUnsafe(
          `SELECT content, metadata, "createdAt" FROM "SemanticMemory" ORDER BY embedding <=> $1::vector LIMIT 5`,
          `[${embedding.join(",")}]`
        );

        if (memories.length === 0) return { message: "Keine relevanten Erinnerungen gefunden." };

        return {
          erinnerungen: memories.map(m => ({
            text: m.content,
            datum: m.createdAt,
            metadaten: m.metadata
          }))
        };
      }
    },
    {
      definition: {
        name: "hole_person_info",
        description: "Ruft alle strukturierten und unstrukturierten Informationen über eine Person ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "Name der Person" }
          },
          required: ["name"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { name } = args;
        const person = await prisma.person.findUnique({
          where: { name },
          include: { facts: true }
        }) as any;
        
        if (!person) return { status: "error", message: `Person ${name} nicht gefunden.` };
        
        const memories = await prisma.semanticMemory.findMany({
          where: { personId: person.id },
          orderBy: { createdAt: 'desc' },
          take: 10
        });

        return {
          name: person.name,
          facts: person.facts.map((f: any) => ({ content: f.content, category: f.category })),
          langzeit_erinnerungen: memories.map(m => ({ text: m.content, datum: m.createdAt }))
        };
      }
    }
  ]
};
