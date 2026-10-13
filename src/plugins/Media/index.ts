import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import fs from "fs";
import path from "path";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMediaItem(item: any) {
  const persons = (item.persons || []).map((p: any) => {
    const primaryAlias = p.person?.aliases?.find((a: any) => a.isPrimary) || p.person?.aliases?.[0];
    return {
      id: p.person?.id || p.personId,
      name: primaryAlias?.name || p.person?.name || "Unbekannt",
      role: p.role || "Verknüpft"
    };
  });

  const projects = (item.projects || []).map((proj: any) => ({
    id: proj.project?.id || proj.projectId,
    name: proj.project?.name || "Projekt",
    tag: proj.tag || "Zugehörig"
  }));

  return {
    id: item.id,
    title: item.title,
    fileName: item.fileName,
    filePath: item.filePath,
    fileType: item.fileType,
    category: item.category,
    fileSize: item.fileSize,
    fileSizeFormatted: formatFileSize(item.fileSize || 0),
    description: item.description || null,
    hasExtractedText: !!item.extractedText,
    extractedTextSnippet: item.extractedText ? item.extractedText.slice(0, 300) : null,
    isFavorite: !!item.isFavorite,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    persons,
    projects
  };
}

export const MediaPlugin: Plugin = {
  name: "Media",
  description: "Verwaltet hochgeladene Bilder, Dokumente, PDFs und Dateien inklusive n:n Verknüpfungen zu Personen und Projekten, Beschreibungen und automatisierter Bewerbungsunterstützung.",
  tools: [
    {
      definition: {
        name: "suche_dateien",
        description: "Sucht nach hochgeladenen Dateien, Fotos, Dokumenten oder PDFs anhand von Stichworten, Kategorien ('image', 'document', 'all'), Personen- oder Projektnamen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            suchbegriff: { type: SchemaType.STRING, description: "Suchbegriff im Dateinamen, Titel, Beschreibung oder Textinhalt (z.B. 'Lebenslauf', 'Rechnung', 'Urlaub')" },
            kategorie: { type: SchemaType.STRING, description: "Kategorie der Datei: 'image' (Bilder/Fotos), 'document' (PDFs/Dokumente), 'all' (alle Dateien)" },
            personName: { type: SchemaType.STRING, description: "Name einer Person, um nur ihr zugeordnete Dateien/Fotos zu finden" },
            personId: { type: SchemaType.INTEGER, description: "ID einer Person" },
            projektName: { type: SchemaType.STRING, description: "Name eines Projekts (z.B. 'Bewerbung'), um projektbezogene Dateien zu finden" },
            projektId: { type: SchemaType.INTEGER, description: "ID eines Projekts" },
            nurFavoriten: { type: SchemaType.BOOLEAN, description: "Nur mit Stern markierte Favoriten anzeigen" }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const { suchbegriff, kategorie, personName, personId, projektName, projektId, nurFavoriten } = args;

        const where: any = { isDeleted: false };

        if (kategorie && kategorie !== "all") {
          where.category = kategorie;
        }

        if (nurFavoriten) {
          where.isFavorite = true;
        }

        if (suchbegriff && suchbegriff.trim()) {
          const q = suchbegriff.trim();
          where.OR = [
            { title: { contains: q, mode: "insensitive" } },
            { fileName: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { extractedText: { contains: q, mode: "insensitive" } }
          ];
        }

        // Personenfilter
        if (personId) {
          where.persons = { some: { personId } };
        } else if (personName && personName.trim()) {
          const pAlias = await prisma.personAlias.findFirst({
            where: { name: { contains: personName.trim(), mode: "insensitive" } }
          });
          if (pAlias) {
            where.persons = { some: { personId: pAlias.personId } };
          }
        }

        // Projektfilter
        if (projektId) {
          where.projects = { some: { projectId: Number(projektId) } };
        } else if (projektName && projektName.trim()) {
          const proj = await prisma.project.findFirst({
            where: { isDeleted: false, name: { contains: projektName.trim(), mode: "insensitive" } }
          });
          if (proj) {
            where.projects = { some: { projectId: proj.id } };
          }
        }

        const items = await prisma.mediaItem.findMany({
          where,
          include: {
            persons: {
              include: {
                person: { include: { aliases: true } }
              }
            },
            projects: {
              include: { project: true }
            }
          },
          orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }]
        });

        const formatted = items.map(formatMediaItem);
        return {
          status: "success",
          anzahl: formatted.length,
          dateien: formatted,
          message: `${formatted.length} Datei(en) gefunden.`
        };
      }
    },
    {
      definition: {
        name: "lese_datei_inhalt",
        description: "Liest den detaillierten Textinhalt oder die Beschreibung einer gespeicherten Datei (z.B. den Text eines Lebenslaufs, Anschreibens oder Notiz).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            dateiId: { type: SchemaType.INTEGER, description: "ID der Datei" },
            dateiname: { type: SchemaType.STRING, description: "Dateiname oder Titel, falls ID nicht bekannt" }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const { dateiId, dateiname } = args;

        let item = null;
        if (dateiId) {
          item = await prisma.mediaItem.findUnique({
            where: { id: dateiId },
            include: {
              persons: { include: { person: { include: { aliases: true } } } },
              projects: { include: { project: true } }
            }
          });
        } else if (dateiname && dateiname.trim()) {
          item = await prisma.mediaItem.findFirst({
            where: {
              isDeleted: false,
              OR: [
                { title: { contains: dateiname.trim(), mode: "insensitive" } },
                { fileName: { contains: dateiname.trim(), mode: "insensitive" } }
              ]
            },
            include: {
              persons: { include: { person: { include: { aliases: true } } } },
              projects: { include: { project: true } }
            }
          });
        }

        if (!item) {
          return { status: "error", message: "Datei wurde nicht gefunden." };
        }

        let textContent = item.extractedText;
        if (!textContent && (item.fileType?.includes("text") || item.fileName.endsWith(".txt") || item.fileName.endsWith(".md"))) {
          try {
            const diskPath = path.join(process.cwd(), "public", item.filePath.replace(/^\//, ""));
            if (fs.existsSync(diskPath)) {
              textContent = fs.readFileSync(diskPath, "utf-8");
              await prisma.mediaItem.update({
                where: { id: item.id },
                data: { extractedText: textContent }
              });
            }
          } catch (e) {
            console.error("Fehler beim Nachlesen des Textinhalts:", e);
          }
        }

        return {
          status: "success",
          datei: formatMediaItem(item),
          inhalt: textContent || item.description || "Kein Volltext vorhanden (Binärdatei oder Bild ohne Text)",
          beschreibung: item.description
        };
      }
    },
    {
      definition: {
        name: "verknuepfe_datei",
        description: "Verknüpft eine Datei oder ein Bild mit einer Person (z.B. 'Abgebildet') oder einem Projekt (z.B. mit Tag 'Lebenslauf', 'Anschreiben').",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            dateiId: { type: SchemaType.INTEGER, description: "ID der Datei" },
            personId: { type: SchemaType.INTEGER, description: "ID der Person (optional)" },
            personName: { type: SchemaType.STRING, description: "Name der Person (optional, falls ID unbekannt)" },
            personRolle: { type: SchemaType.STRING, description: "Rolle der Person zur Datei (z.B. 'Abgebildet', 'Betrifft', 'Autor')" },
            projektId: { type: SchemaType.INTEGER, description: "ID des Projekts (optional)" },
            projektName: { type: SchemaType.STRING, description: "Name des Projekts (optional, falls ID unbekannt)" },
            projektTag: { type: SchemaType.STRING, description: "Tag / Zweck für das Projekt (z.B. 'Lebenslauf', 'Anschreiben', 'Zeugnis', 'Design', 'Recherche')" }
          },
          required: ["dateiId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { dateiId, personId: inPersonId, personName, personRolle, projektId: inProjektId, projektName, projektTag } = args;

        const media = await prisma.mediaItem.findUnique({ where: { id: dateiId } });
        if (!media) return { status: "error", message: `Datei mit ID ${dateiId} nicht gefunden.` };

        let resolvedPersonId = inPersonId;
        if (!resolvedPersonId && personName && personName.trim()) {
          const alias = await prisma.personAlias.findFirst({
            where: { name: { contains: personName.trim(), mode: "insensitive" } }
          });
          if (alias) resolvedPersonId = alias.personId;
        }

        let resolvedProjektId = inProjektId;
        if (!resolvedProjektId && projektName && projektName.trim()) {
          const proj = await prisma.project.findFirst({
            where: { isDeleted: false, name: { contains: projektName.trim(), mode: "insensitive" } }
          });
          if (proj) resolvedProjektId = proj.id;
        }

        const updates: string[] = [];

        if (resolvedPersonId) {
          await prisma.mediaPerson.upsert({
            where: {
              mediaId_personId: { mediaId: dateiId, personId: resolvedPersonId }
            },
            create: {
              mediaId: dateiId,
              personId: resolvedPersonId,
              role: personRolle || "Zugehörig"
            },
            update: {
              role: personRolle || undefined
            }
          });
          updates.push(`Person #${resolvedPersonId} verknüpft`);
        }

        if (resolvedProjektId) {
          await prisma.mediaProject.upsert({
            where: {
              mediaId_projectId: { mediaId: dateiId, projectId: resolvedProjektId }
            },
            create: {
              mediaId: dateiId,
              projectId: resolvedProjektId,
              tag: projektTag || "Zugehörig"
            },
            update: {
              tag: projektTag || undefined
            }
          });
          updates.push(`Projekt #${resolvedProjektId} verknüpft (${projektTag || 'Zugehörig'})`);
        }

        return {
          status: "success",
          message: updates.length > 0 ? updates.join(", ") : "Keine Verknüpfungspartner angegeben."
        };
      }
    },
    {
      definition: {
        name: "aktualisiere_datei_beschreibung",
        description: "Aktualisiert die Beschreibung ('was ist auf dem Bild abgebildet' oder Zusammenfassung), den Titel, Textinhalt oder den Favoriten-Status einer Datei.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            dateiId: { type: SchemaType.INTEGER, description: "ID der Datei" },
            titel: { type: SchemaType.STRING, description: "Neuer Titel der Datei" },
            beschreibung: { type: SchemaType.STRING, description: "Beschreibung des Bildes oder Notiz zum Dokument" },
            inhalt: { type: SchemaType.STRING, description: "Neuer Textinhalt der Datei (für bearbeitbare Textdateien wie .txt, .md, .json)" },
            istFavorit: { type: SchemaType.BOOLEAN, description: "Ob die Datei favorisiert werden soll" }
          },
          required: ["dateiId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const { dateiId, titel, beschreibung, inhalt, istFavorit } = args;

        const current = await prisma.mediaItem.findUnique({ where: { id: dateiId } });
        if (!current) {
          return { status: "error", message: `Datei mit ID ${dateiId} nicht gefunden.` };
        }

        const data: any = {};
        if (titel !== undefined) data.title = titel.trim();
        if (beschreibung !== undefined) data.description = beschreibung.trim();
        if (istFavorit !== undefined) data.isFavorite = istFavorit;

        if (inhalt !== undefined && typeof inhalt === "string") {
          data.extractedText = inhalt;
          data.fileSize = Buffer.byteLength(inhalt, "utf-8");
          try {
            const diskPath = path.join(process.cwd(), "public", current.filePath.replace(/^\//, ""));
            fs.writeFileSync(diskPath, inhalt, "utf-8");
          } catch (err) {
            console.warn("Konnte Datei nicht direkt auf Festplatte schreiben:", err);
          }
        }

        const updated = await prisma.mediaItem.update({
          where: { id: dateiId },
          data
        });

        return {
          status: "success",
          datei: formatMediaItem(updated),
          message: `Datei "${updated.title}" erfolgreich aktualisiert.`
        };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    try {
      const items = await prisma.mediaItem.findMany({
        where: { isDeleted: false },
        include: {
          persons: {
            include: { person: { include: { aliases: true } } }
          },
          projects: {
            include: { project: true }
          }
        },
        orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
        take: 100
      });

      const formatted = items.map(formatMediaItem);
      const photos = formatted.filter(item => item.category === "image");
      const docs = formatted.filter(item => item.category !== "image");

      return [
        {
          pluginName: "Photos",
          type: "custom",
          data: {
            widgetType: "photos_gallery",
            items: photos
          }
        },
        {
          pluginName: "Docs",
          type: "custom",
          data: {
            widgetType: "docs_overview",
            items: docs
          }
        }
      ];
    } catch (e) {
      console.error("Fehler beim Laden der Media-Widgets:", e);
      return [];
    }
  },
  entityConfig: {
    type: "media",
    prefix: "app://media/",
    color: "rgba(249, 226, 175, 0.15)",
    borderColor: "#f9e2af",
    icon: "🖼️",
    displayName: "Datei / Foto"
  },
  resolveEntity: async (id, { prisma }) => {
    const item = await prisma.mediaItem.findUnique({
      where: { id },
      include: {
        persons: {
          include: { person: { include: { aliases: true } } }
        },
        projects: {
          include: { project: true }
        }
      }
    });
    if (!item) return null;
    return formatMediaItem(item);
  }
};
