import { Plugin } from "../types.js";
import { SchemaType, GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });

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
            personId: { type: SchemaType.INTEGER, description: "Optional: ID der Person, auf die sich das bezieht." },
            personName: { type: SchemaType.STRING, description: "Optional: Name/Spitzname der Person, falls die ID nicht bekannt ist." },
            kontext: { type: SchemaType.STRING, description: "Zusätzlicher Kontext (z.B. 'Gespräch über Urlaub')." }
          },
          required: ["text"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { text, personId: inputPersonId, personName, kontext } = args;
        const result = await embeddingModel.embedContent(text);
        const embedding = result.embedding.values;

        let personId: number | undefined = inputPersonId ? Number(inputPersonId) : undefined;
        if (!personId && personName) {
          const alias = await prisma.personAlias.findUnique({
            where: { name: personName }
          });
          if (alias) {
            personId = alias.personId;
          } else {
            const person = await prisma.person.create({
              data: {
                biography: "",
                aliases: {
                  create: {
                    name: personName,
                    isPrimary: true
                  }
                }
              }
            });
            personId = person.id;
          }
        }

        await prisma.$executeRawUnsafe(
          `INSERT INTO "SemanticMemory" (content, embedding, metadata, "personId", "createdAt") 
           VALUES ($1, $2::vector, $3::jsonb, $4, NOW())`,
          text,
          `[${embedding.join(",")}]`,
          JSON.stringify({ kontext, source: "chat" }),
          personId || null
        );

        return { status: "success", personId, message: "Ich werde mich daran erinnern." };
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
            personId: { type: SchemaType.INTEGER, description: "Optional: Nur nach Erinnerungen zu dieser Person (ID) suchen." },
            personName: { type: SchemaType.STRING, description: "Optional: Nur nach Erinnerungen zu dieser Person (Name) suchen." }
          },
          required: ["frage"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { frage, personId: inputPersonId, personName } = args;
        const result = await embeddingModel.embedContent(frage);
        const embedding = result.embedding.values;

        let personId: number | undefined = inputPersonId ? Number(inputPersonId) : undefined;
        if (!personId && personName) {
          const alias = await prisma.personAlias.findUnique({
            where: { name: personName }
          });
          if (alias) personId = alias.personId;
        }

        let memories: any[];
        if (personId) {
          memories = await prisma.$queryRawUnsafe(
            `SELECT sm.content, sm.metadata, sm."createdAt" 
             FROM "SemanticMemory" sm
             JOIN "Person" p ON sm."personId" = p.id
             WHERE sm."personId" = $1 AND p."isDeleted" = false
             ORDER BY sm.embedding <=> $2::vector LIMIT 5`,
            personId,
            `[${embedding.join(",")}]`
          );
        } else {
          memories = await prisma.$queryRawUnsafe(
            `SELECT sm.content, sm.metadata, sm."createdAt" 
             FROM "SemanticMemory" sm
             LEFT JOIN "Person" p ON sm."personId" = p.id
             WHERE sm."personId" IS NULL OR p."isDeleted" = false
             ORDER BY sm.embedding <=> $1::vector LIMIT 5`,
            `[${embedding.join(",")}]`
          );
        }

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
        description: "Ruft alle strukturierten (Biografie, Fakten, Aliase) und unstrukturierten Informationen über eine Person ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            personId: { type: SchemaType.INTEGER, description: "Die ID der Person (bevorzugt verwenden)" },
            name: { type: SchemaType.STRING, description: "Alternativ: Name oder Spitzname der Person" },
            zeigeGeloeschte: { type: SchemaType.BOOLEAN, description: "Wenn true, werden auch gelöschte Fakten und Personen zurückgegeben (für Wiederherstellung). Standard ist false." }
          },
          required: []
        } as any
      },
      handler: async (args, { prisma }) => {
        const { personId, name } = args;
        const zeigeGeloeschte = !!args.zeigeGeloeschte;
        
        let person: any = null;
        if (personId) {
          person = await prisma.person.findUnique({
            where: { id: Number(personId) },
            include: { 
              aliases: true, 
              facts: {
                where: { isDeleted: zeigeGeloeschte }
              } 
            }
          });
        } else if (name) {
          const alias = await prisma.personAlias.findUnique({
            where: { name },
            include: { 
              person: { 
                include: { 
                  aliases: true, 
                  facts: {
                    where: { isDeleted: zeigeGeloeschte }
                  } 
                } 
              } 
            }
          });
          if (alias) {
            person = alias.person;
          }
        }
        
        if (!person || (person.isDeleted && !zeigeGeloeschte)) {
          return { status: "not_found", message: `Person wurde im System nicht gefunden.` };
        }
        
        const memories = await prisma.semanticMemory.findMany({
          where: { personId: person.id },
          orderBy: { createdAt: 'desc' },
          take: 10
        });

        const primaryAlias = person.aliases.find((a: any) => a.isPrimary) || person.aliases[0];
        const primaryName = primaryAlias ? primaryAlias.name : "Unbekannt";
        const allAliases = person.aliases.map((a: any) => a.name);

        return {
          id: person.id,
          name: primaryName,
          aliases: allAliases,
          biografie: person.biography || "",
          facts: person.facts.map((f: any) => ({ id: f.id, content: f.content, category: f.category })),
          langzeit_erinnerungen: memories.map(m => ({ text: m.content, datum: m.createdAt }))
        };
      }
    },
    {
      definition: {
        name: "aktualisiere_person_biografie",
        description: "Aktualisiert die Biografie / allgemeine Notizen einer Person.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            personId: { type: SchemaType.INTEGER, description: "Die ID der Person" },
            name: { type: SchemaType.STRING, description: "Alternativ: Name der Person, falls ID unbekannt" },
            biografie: { type: SchemaType.STRING, description: "Die neue vollständige Biografie / allgemeine Informationen der Person." }
          },
          required: ["biografie"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { personId: inputPersonId, name, biografie } = args;
        
        let personId = inputPersonId ? Number(inputPersonId) : undefined;
        if (!personId && name) {
          const alias = await prisma.personAlias.findUnique({
            where: { name }
          });
          if (alias) personId = alias.personId;
        }

        if (personId) {
          await prisma.person.update({
            where: { id: personId },
            data: { biography: biografie }
          });
          return { status: "success", personId, message: `Biografie wurde aktualisiert.` };
        } else if (name) {
          const person = await prisma.person.create({
            data: {
              biography: biografie,
              aliases: {
                create: { name, isPrimary: true }
              }
            }
          });
          return { status: "success", personId: person.id, message: `Neue Person '${name}' erstellt und Biografie aktualisiert.` };
        } else {
          throw new Error("Entweder 'personId' oder 'name' muss angegeben werden.");
        }
      }
    },
    {
      definition: {
        name: "fuege_person_fakt_hinzu",
        description: "Fügt einen strukturierten Fakt (Fact) für eine Person hinzu.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            personId: { type: SchemaType.INTEGER, description: "Die ID der Person" },
            name: { type: SchemaType.STRING, description: "Alternativ: Name der Person" },
            inhalt: { type: SchemaType.STRING, description: "Der Fakt (z.B. 'Spielt gerne Volleyball')" },
            kategorie: { type: SchemaType.STRING, description: "Optional: Kategorie (z.B. 'hobby', 'geburtstag')" }
          },
          required: ["inhalt"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { personId: inputPersonId, name, inhalt, kategorie } = args;
        
        let personId = inputPersonId ? Number(inputPersonId) : undefined;
        if (!personId && name) {
          const alias = await prisma.personAlias.findUnique({
            where: { name }
          });
          if (alias) personId = alias.personId;
        }

        if (!personId) {
          if (name) {
            const person = await prisma.person.create({
              data: {
                biography: "",
                aliases: {
                  create: { name, isPrimary: true }
                }
              }
            });
            personId = person.id;
          } else {
            throw new Error("Entweder 'personId' oder 'name' muss angegeben werden.");
          }
        }

        const fact = await prisma.fact.create({
          data: {
            content: inhalt,
            category: kategorie || null,
            personId: personId
          }
        });
        return { status: "success", personId, faktId: fact.id, message: `Fakt wurde hinzugefügt.` };
      }
    },
    {
      definition: {
        name: "loesche_person_fakt",
        description: "Löscht einen strukturierten Fakt einer Person anhand seiner ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            faktId: { type: SchemaType.INTEGER, description: "Die ID des Fakts" }
          },
          required: ["faktId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { faktId } = args;
        const fact = await prisma.fact.findUnique({
          where: { id: Number(faktId) }
        });
        if (!fact) {
          return { status: "error", message: `Fakt mit ID ${faktId} wurde nicht gefunden.` };
        }
        await prisma.fact.update({
          where: { id: Number(faktId) },
          data: { isDeleted: true }
        });
        return { status: "success", message: `Fakt mit ID ${faktId} wurde gelöscht.` };
      }
    },
    {
      definition: {
        name: "wiederherstellen_person_fakt",
        description: "Stellt einen gelöschten Fakt einer Person anhand seiner ID wieder her.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            faktId: { type: SchemaType.INTEGER, description: "Die ID des Fakts" }
          },
          required: ["faktId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { faktId } = args;
        await prisma.fact.update({
          where: { id: Number(faktId) },
          data: { isDeleted: false }
        });
        return { status: "success", message: `Fakt mit ID ${faktId} wurde wiederhergestellt.` };
      }
    },
    {
      definition: {
        name: "loesche_person",
        description: "Löscht (archiviert) das Profil einer Person.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            personId: { type: SchemaType.INTEGER, description: "Die ID der zu löschenden Person" }
          },
          required: ["personId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const personId = Number(args.personId);
        await prisma.person.update({
          where: { id: personId },
          data: { isDeleted: true }
        });
        return { status: "success", message: `Personenprofil mit ID ${personId} wurde gelöscht (als gelöscht markiert).` };
      }
    },
    {
      definition: {
        name: "wiederherstellen_person",
        description: "Stellt ein gelöschtes Personenprofil wieder her.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            personId: { type: SchemaType.INTEGER, description: "Die ID der wiederherzustellenden Person" }
          },
          required: ["personId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const personId = Number(args.personId);
        await prisma.person.update({
          where: { id: personId },
          data: { isDeleted: false }
        });
        return { status: "success", message: `Personenprofil mit ID ${personId} wurde erfolgreich wiederhergestellt.` };
      }
    },
    {
      definition: {
        name: "verwalte_person_alias",
        description: "Fügt einen neuen Spitznamen hinzu, löscht einen vorhandenen Alias oder setzt einen Alias als Primärnamen einer Person.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            personId: { type: SchemaType.INTEGER, description: "ID der Person" },
            aktion: { type: SchemaType.STRING, description: "Aktion: 'add', 'delete' oder 'set_primary'" },
            aliasName: { type: SchemaType.STRING, description: "Name des Spitznamens/Alias" }
          },
          required: ["personId", "aktion", "aliasName"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const personId = Number(args.personId);
        const { aktion, aliasName } = args;

        if (aktion === "add") {
          const existing = await prisma.personAlias.findUnique({
            where: { name: aliasName }
          });
          if (existing) {
            return { status: "error", message: `Der Spitzname '${aliasName}' wird bereits von einer anderen Person verwendet.` };
          }
          await prisma.personAlias.create({
            data: {
              personId,
              name: aliasName,
              isPrimary: false
            }
          });
          return { status: "success", message: `Spitzname '${aliasName}' hinzugefügt.` };
        } else if (aktion === "delete") {
          const alias = await prisma.personAlias.findFirst({
            where: { personId, name: aliasName }
          });
          if (!alias) {
            return { status: "error", message: `Spitzname '${aliasName}' existiert nicht für diese Person.` };
          }
          if (alias.isPrimary) {
            return { status: "error", message: `Der primäre Name '${aliasName}' kann nicht gelöscht werden. Setze zuerst einen anderen Namen als primär.` };
          }
          await prisma.personAlias.delete({
            where: { id: alias.id }
          });
          return { status: "success", message: `Spitzname '${aliasName}' gelöscht.` };
        } else if (aktion === "set_primary") {
          const existing = await prisma.personAlias.findUnique({
            where: { name: aliasName }
          });

          if (existing) {
            if (existing.personId === personId) {
              await prisma.$transaction([
                prisma.personAlias.updateMany({
                  where: { personId },
                  data: { isPrimary: false }
                }),
                prisma.personAlias.update({
                  where: { id: existing.id },
                  data: { isPrimary: true }
                })
              ]);
              return { status: "success", message: `Der Name '${aliasName}' wurde als primärer Name festgelegt.` };
            } else {
              return { status: "error", message: `Der Name '${aliasName}' wird bereits von einer anderen Person verwendet.` };
            }
          } else {
            await prisma.$transaction([
              prisma.personAlias.updateMany({
                where: { personId },
                data: { isPrimary: false }
              }),
              prisma.personAlias.create({
                data: {
                  personId,
                  name: aliasName,
                  isPrimary: true
                }
              })
            ]);
            return { status: "success", message: `Der Name '${aliasName}' wurde erstellt und als primärer Name festgelegt.` };
          }
        } else {
          return { status: "error", message: "Ungültige Aktion. Nur 'add', 'delete' und 'set_primary' sind erlaubt." };
        }
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    try {
      const people = await prisma.person.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          biography: true,
          aliases: {
            select: {
              name: true,
              isPrimary: true
            }
          }
        }
      });
      const formattedPeople = people.map(p => {
        const primaryAlias = p.aliases.find(a => a.isPrimary) || p.aliases[0];
        return {
          id: p.id,
          name: primaryAlias ? primaryAlias.name : "Unbekannt",
          notes: p.biography || "Keine Biografie vorhanden."
        };
      });
      formattedPeople.sort((a, b) => a.name.localeCompare(b.name));
      return [
        {
          pluginName: "Memory",
          type: "custom",
          data: {
            widgetType: "memory_people_list",
            people: formattedPeople
          }
        }
      ];
    } catch (e) {
      console.error("Fehler beim Laden des Memory-Widgets:", e);
      return [];
    }
  },
  entityConfig: {
    type: "person",
    prefix: "app://person/",
    color: "rgba(203, 166, 247, 0.15)",
    borderColor: "#cba6f7",
    icon: "👤",
    displayName: "Person"
  },
  resolveEntity: async (id, { prisma }) => {
    return prisma.person.findUnique({
      where: { id },
      include: { aliases: true, facts: true }
    });
  }
};
