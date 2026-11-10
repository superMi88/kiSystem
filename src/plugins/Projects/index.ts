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

function inferStateIcon(name: string, fallback = "📌"): string {
  const n = (name || "").toLowerCase();
  if (n.includes("geplant") || n.includes("planung") || n.includes("idee") || n.includes("vorschlag")) return "📋";
  if (n.includes("beworben") || n.includes("versendet") || n.includes("abgeschickt")) return "📨";
  if (n.includes("arbeit") || n.includes("offen") || n.includes("aktiv") || n.includes("läuft")) return "⏳";
  if (n.includes("gespräch") || n.includes("interview") || n.includes("einladung")) return "💬";
  if (n.includes("fertig") || n.includes("erledigt") || n.includes("zusage") || n.includes("angenommen") || n.includes("done")) return "✅";
  if (n.includes("abgelehnt") || n.includes("absage") || n.includes("storniert")) return "❌";
  return fallback;
}

export async function syncProjectStates(prisma: any, projectId: number, rawInput: any): Promise<any[]> {
  let parsed = rawInput;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed || trimmed === "null" || trimmed === "none") {
      parsed = null;
    } else {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // Kommagetrennte Liste z. B. "Geplant, Beworben, Abgelehnt"
        parsed = trimmed.split(",").map(s => s.trim()).filter(Boolean);
      }
    }
  }

  let rawItems: any[] = [];
  let explicitDefaultRawId: string | number | null = null;

  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.items)) {
      rawItems = parsed.items;
      explicitDefaultRawId = parsed.defaultId ?? null;
    } else if (Array.isArray(parsed.states)) {
      rawItems = parsed.states;
      explicitDefaultRawId = parsed.defaultId ?? null;
    } else if (Array.isArray(parsed.zustaende)) {
      rawItems = parsed.zustaende;
      explicitDefaultRawId = parsed.defaultId ?? null;
    }
  }

  const normalized: Array<{ rawId?: string | number; name: string; icon: string; color?: string | null; isDefault: boolean }> = [];
  rawItems.forEach((it: any, idx: number) => {
    if (typeof it === "string" && it.trim()) {
      const name = it.trim();
      normalized.push({
        rawId: name,
        name,
        icon: inferStateIcon(name),
        isDefault: explicitDefaultRawId ? String(explicitDefaultRawId) === name : idx === 0
      });
    } else if (it && typeof it === "object") {
      const name = String(it.name || it.titel || it.title || it.label || it.id || "").trim();
      if (!name) return;
      const rawId = it.id !== undefined && it.id !== null ? it.id : name;
      const isDef = explicitDefaultRawId !== null
        ? String(rawId) === String(explicitDefaultRawId) || name.toLowerCase() === String(explicitDefaultRawId).toLowerCase()
        : !!it.isDefault;
      normalized.push({
        rawId,
        name,
        icon: String(it.icon || "").trim() || inferStateIcon(name),
        color: it.color || null,
        isDefault: isDef
      });
    }
  });

  if (normalized.length === 0) {
    await prisma.task.updateMany({
      where: { projectId },
      data: { stateId: null }
    });
    await prisma.projectState.deleteMany({
      where: { projectId }
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { categories: null }
    });
    return [];
  }

  if (!normalized.some(n => n.isDefault)) {
    normalized[0].isDefault = true;
  } else {
    let seenDefault = false;
    for (const n of normalized) {
      if (n.isDefault) {
        if (seenDefault) n.isDefault = false;
        seenDefault = true;
      }
    }
  }

  const existingStates: any[] = await prisma.projectState.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" }
  });

  const usedExistingIds = new Set<number>();
  const finalStates: any[] = [];
  const lookupMap = new Map<string, number>();

  for (let i = 0; i < normalized.length; i++) {
    const item = normalized[i];
    let matched: any = null;

    if (item.rawId !== undefined && /^\d+$/.test(String(item.rawId))) {
      const numId = Number(item.rawId);
      matched = existingStates.find(s => s.id === numId && !usedExistingIds.has(s.id));
    }
    if (!matched) {
      matched = existingStates.find(s => s.name.toLowerCase() === item.name.toLowerCase() && !usedExistingIds.has(s.id));
    }

    let savedState: any;
    if (matched) {
      usedExistingIds.add(matched.id);
      savedState = await prisma.projectState.update({
        where: { id: matched.id },
        data: {
          name: item.name,
          icon: item.icon,
          color: item.color ?? matched.color,
          sortOrder: i,
          isDefault: item.isDefault
        }
      });
    } else {
      savedState = await prisma.projectState.create({
        data: {
          projectId,
          name: item.name,
          icon: item.icon,
          color: item.color || null,
          sortOrder: i,
          isDefault: item.isDefault
        }
      });
    }

    finalStates.push(savedState);
    lookupMap.set(String(savedState.id), savedState.id);
    lookupMap.set(savedState.name.toLowerCase(), savedState.id);
    if (item.rawId !== undefined) {
      lookupMap.set(String(item.rawId).toLowerCase(), savedState.id);
    }
  }

  const defaultState = finalStates.find(s => s.isDefault) || finalStates[0];
  const removedStateIds = existingStates.filter(s => !usedExistingIds.has(s.id)).map(s => s.id);

  if (removedStateIds.length > 0) {
    await prisma.task.updateMany({
      where: { projectId, stateId: { in: removedStateIds } },
      data: { stateId: defaultState.id }
    });
    await prisma.projectState.deleteMany({
      where: { id: { in: removedStateIds } }
    });
  }

  // Ordne alle Aufgaben des Projekts ohne gültige stateId einem ProjectState per ID zu
  const projectTasks = await prisma.task.findMany({
    where: { projectId, isDeleted: false }
  });
  for (const t of projectTasks) {
    if (!t.stateId || !finalStates.some(s => s.id === t.stateId)) {
      const byList = t.listTitle && t.listTitle.toLowerCase() !== "standard"
        ? lookupMap.get(t.listTitle.trim().toLowerCase())
        : undefined;
      const byStatus = t.status
        ? lookupMap.get(String(t.status).trim().toLowerCase())
        : undefined;
      const resolvedStateId = byList || byStatus || defaultState.id;
      await prisma.task.update({
        where: { id: t.id },
        data: {
          stateId: resolvedStateId,
          listTitle: "Standard"
        }
      });
    }
  }

  const syncedCategories = {
    items: finalStates.map(s => ({ id: s.id, name: s.name, icon: s.icon, isDefault: s.isDefault })),
    defaultId: defaultState.id
  };
  await prisma.project.update({
    where: { id: projectId },
    data: { categories: syncedCategories }
  });

  return finalStates;
}

export async function syncProjectCategoriesCache(prisma: any, projectId: number): Promise<any[]> {
  const states = await prisma.projectState.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" }
  });
  if (states.length === 0) {
    await prisma.project.update({ where: { id: projectId }, data: { categories: null } });
    return [];
  }
  const defaultState = states.find((s: any) => s.isDefault) || states[0];
  const syncedCategories = {
    items: states.map((s: any) => ({ id: s.id, name: s.name, icon: s.icon, isDefault: s.isDefault })),
    defaultId: defaultState.id
  };
  await prisma.project.update({ where: { id: projectId }, data: { categories: syncedCategories } });
  return states;
}

export const projectsPlugin: Plugin = {
  name: "Projects",
  description: "Ermöglicht das Verwalten von Projekten, deren Projekt-Zuständen (ProjectState mit eigener ID) sowie zugehörigen Aufgaben und Notizen.",
  tools: [
    // --- PROJEKT TOOLS ---
    {
      definition: {
        name: "hole_projekte",
        description: "Ruft alle vorhandenen Projekte mitsamt ihren Projekt-Zuständen (zustaende mit id & name), Aufgaben (inkl. zustandId) und Notizen ab.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            zeigeGeloeschte: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur gelöschte Projekte zurückgegeben. Standard ist false." },
            nurMarkiert: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur mit Stern markierte Projekte zurückgegeben." }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const zeigeGeloeschte = !!args.zeigeGeloeschte;
        const nurMarkiert = !!args.nurMarkiert;
        const whereClause: any = { isDeleted: zeigeGeloeschte };
        if (nurMarkiert) {
          whereClause.isStarred = true;
        }

        const projects = await prisma.project.findMany({
          where: whereClause,
          include: {
            states: { orderBy: { sortOrder: "asc" } },
            tasks: {
              where: { isDeleted: false },
              include: { state: true }
            },
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
            zustaende: (p.states || []).map((s: any) => ({
              id: s.id,
              zustandId: s.id,
              name: s.name,
              icon: s.icon,
              sortOrder: s.sortOrder,
              isDefault: s.isDefault
            })),
            isStarred: p.isStarred,
            erstelltAm: p.createdAt.toISOString(),
            personen: p.persons,
            aufgaben: p.tasks.map((t: any) => ({
              id: String(t.id),
              titel: t.title,
              notizen: t.notes || "",
              erledigt: t.completed,
              isStarred: t.isStarred,
              zustandId: t.stateId || null,
              zustandName: t.state ? t.state.name : null,
              status: t.status || (t.completed ? "done" : (t.isPlanned ? "suggestion" : "in_progress")),
              inPlanung: t.isPlanned,
              faellig: t.due ? t.due.toISOString() : null
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
        description: "Erstellt ein neues Projekt. Optional können direkt Zustände (Spalten/Phasen) in der Datenbanktabelle ProjectState angelegt werden.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "Der Name des Projekts" },
            isStarred: { type: SchemaType.BOOLEAN, description: "Ob das Projekt mit einem Stern markiert werden soll (optional)" },
            zustaende: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  name: { type: SchemaType.STRING, description: "Name des Zustands (z. B. 'Geplant', 'Beworben', 'Abgelehnt')" },
                  icon: { type: SchemaType.STRING, description: "Emoji/Icon für den Zustand (z. B. '📋', '📨', '❌') (optional)" },
                  isDefault: { type: SchemaType.BOOLEAN, description: "Ob dies der Standard-Startzustand des Projekts ist (optional)" }
                },
                required: ["name"]
              },
              description: "Optionale Liste von Zuständen (Spalten/Phasen), die für dieses Projekt in der ProjectState-Tabelle angelegt werden sollen."
            }
          },
          required: ["name"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const project = await prisma.project.create({
          data: {
            name: args.name,
            isStarred: args.isStarred !== undefined ? !!args.isStarred : false
          }
        });
        let createdStates: any[] = [];
        if (args.zustaende && Array.isArray(args.zustaende) && args.zustaende.length > 0) {
          createdStates = await syncProjectStates(prisma, project.id, args.zustaende);
        }
        return {
          status: "success",
          message: `Projekt '${args.name}' wurde erfolgreich erstellt.${createdStates.length > 0 ? ` Angelegte Zustände: ${createdStates.map(s => `${s.name} (zustandId: ${s.id})`).join(", ")}.` : ""}`,
          project: {
            id: project.id,
            name: project.name,
            isStarred: project.isStarred,
            zustaende: createdStates.map(s => ({ id: s.id, zustandId: s.id, name: s.name, icon: s.icon, isDefault: s.isDefault })),
            erstelltAm: project.createdAt.toISOString()
          }
        };
      }
    },
    {
      definition: {
        name: "bearbeite_projekt",
        description: "Bearbeitet den Namen, Stern-Status oder die Projekt-Zustände (ProjectState) eines bestehenden Projekts.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.INTEGER, description: "Die ID des Projekts" },
            name: { type: SchemaType.STRING, description: "Der neue Name des Projekts (optional)" },
            isStarred: { type: SchemaType.BOOLEAN, description: "Ob das Projekt mit einem Stern markiert ist (optional)" },
            zustaende: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  id: { type: SchemaType.INTEGER, description: "Optionale bestehende zustandId beim Aktualisieren" },
                  name: { type: SchemaType.STRING, description: "Name des Zustands (z. B. 'Geplant', 'Beworben', 'Abgelehnt')" },
                  icon: { type: SchemaType.STRING, description: "Emoji/Icon für den Zustand (optional)" },
                  isDefault: { type: SchemaType.BOOLEAN, description: "Ob dies der Standard-Startzustand ist (optional)" }
                },
                required: ["name"]
              },
              description: "Optionale Liste der Projekt-Zustände, die in der ProjectState-Tabelle gespeichert werden sollen (leeres Array zum Entfernen aller Zustände)."
            },
            categories: { type: SchemaType.STRING, description: "Veraltet: Nutze stattdessen 'zustaende' oder das Tool 'verwalte_projekt_zustaende' (optional)" }
          },
          required: ["id"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const id = Number(args.id);
        const data: any = {};
        if (args.name !== undefined) data.name = args.name;
        if (args.isStarred !== undefined) data.isStarred = !!args.isStarred;

        let project = await prisma.project.update({
          where: { id },
          data
        });

        let states: any[] = [];
        if (args.zustaende !== undefined) {
          states = await syncProjectStates(prisma, id, args.zustaende);
        } else if (args.categories !== undefined) {
          states = await syncProjectStates(prisma, id, args.categories);
        } else {
          states = await prisma.projectState.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } });
        }

        return {
          status: "success",
          message: `Projekt mit ID ${id} wurde aktualisiert.`,
          project: {
            id: project.id,
            name: project.name,
            isStarred: project.isStarred,
            zustaende: states.map((s: any) => ({ id: s.id, zustandId: s.id, name: s.name, icon: s.icon, isDefault: s.isDefault }))
          }
        };
      }
    },
    {
      definition: {
        name: "verwalte_projekt_zustaende",
        description: "Verwaltet die Projekt-Zustände (Spalten/Phasen) eines Projekts in der eigenen Datenbanktabelle ProjectState. Jeder Zustand besitzt eine eindeutige numerische ID (zustandId). Kann alle Zustände eines Projekts setzen ('set'), einen neuen Zustand hinzufügen ('add'), einen bestehenden Zustand per zustandId bearbeiten ('update') oder löschen ('delete').",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            projectId: { type: SchemaType.INTEGER, description: "Die ID des Projekts" },
            aktion: { type: SchemaType.STRING, description: "Aktion: 'set' (alle Zustände des Projekts anhand von 'zustaende' festlegen), 'add' (einzelnen Zustand hinzufügen), 'update' (Zustand per zustandId ändern), 'delete' (Zustand per zustandId löschen) oder 'clear' (alle Zustände entfernen)." },
            zustaende: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  id: { type: SchemaType.INTEGER, description: "Optionale bestehende zustandId" },
                  name: { type: SchemaType.STRING, description: "Name des Zustands (z. B. 'Geplant', 'Beworben', 'Abgelehnt')" },
                  icon: { type: SchemaType.STRING, description: "Emoji/Icon des Zustands (z. B. '📋', '📨', '❌')" },
                  isDefault: { type: SchemaType.BOOLEAN, description: "Ob dieser Zustand der Standard-Startzustand ist" }
                },
                required: ["name"]
              },
              description: "Liste der Zustände bei aktion='set'."
            },
            zustandId: { type: SchemaType.INTEGER, description: "Die numerische ID des Zustands (Pflicht bei aktion='update' oder 'delete')" },
            name: { type: SchemaType.STRING, description: "Name des Zustands (bei aktion='add' oder 'update')" },
            icon: { type: SchemaType.STRING, description: "Emoji/Icon des Zustands (bei aktion='add' oder 'update')" },
            isDefault: { type: SchemaType.BOOLEAN, description: "Ob dieser Zustand als Standard-Startzustand gesetzt werden soll (optional)" }
          },
          required: ["projectId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          const projectId = Number(args.projectId);
          const proj = await prisma.project.findUnique({ where: { id: projectId } });
          if (!proj || proj.isDeleted) {
            return { status: "error", message: `Projekt mit ID ${projectId} nicht gefunden.` };
          }

          const aktion = (args.aktion || (Array.isArray(args.zustaende) ? "set" : "add")).toLowerCase();

          if (aktion === "set") {
            const states = await syncProjectStates(prisma, projectId, args.zustaende || []);
            return {
              status: "success",
              message: states.length > 0
                ? `Projekt-Zustände für '${proj.name}' wurden gespeichert: ${states.map(s => `${s.icon} ${s.name} (zustandId: ${s.id})`).join(", ")}.`
                : `Alle Projekt-Zustände für '${proj.name}' wurden entfernt.`,
              projectId,
              zustaende: states.map(s => ({ id: s.id, zustandId: s.id, name: s.name, icon: s.icon, sortOrder: s.sortOrder, isDefault: s.isDefault }))
            };
          } else if (aktion === "clear") {
            await syncProjectStates(prisma, projectId, null);
            return {
              status: "success",
              message: `Alle Projekt-Zustände für '${proj.name}' wurden entfernt.`,
              projectId,
              zustaende: []
            };
          } else if (aktion === "add") {
            if (!args.name || !String(args.name).trim()) {
              return { status: "error", message: "Name für den neuen Zustand fehlt." };
            }
            const name = String(args.name).trim();
            const existing = await prisma.projectState.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
            const isDef = args.isDefault !== undefined ? !!args.isDefault : existing.length === 0;
            if (isDef && existing.length > 0) {
              await prisma.projectState.updateMany({ where: { projectId }, data: { isDefault: false } });
            }
            const created = await prisma.projectState.create({
              data: {
                projectId,
                name,
                icon: args.icon ? String(args.icon).trim() : inferStateIcon(name),
                sortOrder: existing.length,
                isDefault: isDef
              }
            });
            const allStates = await syncProjectCategoriesCache(prisma, projectId);
            return {
              status: "success",
              message: `Zustand '${created.name}' (zustandId: ${created.id}) wurde zum Projekt '${proj.name}' hinzugefügt.`,
              zustand: { id: created.id, zustandId: created.id, name: created.name, icon: created.icon, isDefault: created.isDefault },
              zustaende: allStates.map((s: any) => ({ id: s.id, zustandId: s.id, name: s.name, icon: s.icon, sortOrder: s.sortOrder, isDefault: s.isDefault }))
            };
          } else if (aktion === "update") {
            const stateId = Number(args.zustandId);
            if (!stateId) return { status: "error", message: "zustandId ist für 'update' erforderlich." };
            if (args.isDefault) {
              await prisma.projectState.updateMany({ where: { projectId }, data: { isDefault: false } });
            }
            const updateData: any = {};
            if (args.name !== undefined) updateData.name = String(args.name).trim();
            if (args.icon !== undefined) updateData.icon = String(args.icon).trim();
            if (args.isDefault !== undefined) updateData.isDefault = !!args.isDefault;
            const updated = await prisma.projectState.update({
              where: { id: stateId },
              data: updateData
            });
            const allStates = await syncProjectCategoriesCache(prisma, projectId);
            return {
              status: "success",
              message: `Zustand '${updated.name}' (zustandId: ${updated.id}) wurde aktualisiert.`,
              zustand: { id: updated.id, zustandId: updated.id, name: updated.name, icon: updated.icon, isDefault: updated.isDefault },
              zustaende: allStates.map((s: any) => ({ id: s.id, zustandId: s.id, name: s.name, icon: s.icon, sortOrder: s.sortOrder, isDefault: s.isDefault }))
            };
          } else if (aktion === "delete") {
            const stateId = Number(args.zustandId);
            if (!stateId) return { status: "error", message: "zustandId ist für 'delete' erforderlich." };
            await prisma.projectState.delete({ where: { id: stateId } });
            const allStates = await syncProjectCategoriesCache(prisma, projectId);
            if (allStates.length > 0) {
              const defState = allStates.find((s: any) => s.isDefault) || allStates[0];
              await prisma.task.updateMany({
                where: { projectId, stateId: null },
                data: { stateId: defState.id }
              });
            }
            return {
              status: "success",
              message: `Zustand mit ID ${stateId} wurde gelöscht.`,
              zustaende: allStates.map((s: any) => ({ id: s.id, zustandId: s.id, name: s.name, icon: s.icon, sortOrder: s.sortOrder, isDefault: s.isDefault }))
            };
          }
          return { status: "error", message: `Unbekannte Aktion '${aktion}'.` };
        } catch (e: any) {
          return { status: "error", message: `Fehler bei verwalte_projekt_zustaende: ${e.message}` };
        }
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
        states: {
          orderBy: { sortOrder: "asc" }
        },
        tasks: {
          where: { isDeleted: false },
          include: {
            state: true,
            location: true,
            persons: { include: { person: { include: { aliases: true } } } },
            media: { include: { media: true } }
          },
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
      include: {
        location: true,
        persons: { include: { person: { include: { aliases: true } } } },
        media: { include: { media: true } }
      },
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
          projects: matchedProjects.map(p => {
            const pStates = (p.states || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              icon: s.icon,
              color: s.color,
              sortOrder: s.sortOrder,
              isDefault: s.isDefault
            }));
            const defState = pStates.find((s: any) => s.isDefault) || pStates[0] || null;
            const syncedCats = pStates.length > 0
              ? { items: pStates.map((s: any) => ({ id: s.id, name: s.name, icon: s.icon, isDefault: s.isDefault })), defaultId: defState.id }
              : null;

            return {
              id: p.id,
              name: p.name,
              states: pStates,
              categories: syncedCats,
              isStarred: p.isStarred,
              createdAt: p.createdAt.toISOString(),
              persons: p.persons,
              tasks: p.tasks.map((t: any) => ({
                id: String(t.id),
                title: t.title,
                notes: t.notes || "",
                completed: t.completed,
                isStarred: t.isStarred,
                stateId: t.stateId || null,
                stateName: t.state ? t.state.name : null,
                stateIcon: t.state ? t.state.icon : null,
                status: t.stateId ? String(t.stateId) : (t.status || (t.completed ? "done" : (t.isPlanned ? "suggestion" : "in_progress"))),
                isPlanned: t.isPlanned,
                due: t.due ? t.due.toISOString() : null,
                location: t.location ? t.location.name : null,
                locationId: t.locationId || null,
                locationObj: t.location ? { id: t.location.id, name: t.location.name, address: t.location.formattedAddress || t.location.address || t.location.name } : null,
                persons: (t.persons || []).map((tp: any) => ({
                  id: tp.person.id,
                  name: tp.person.aliases?.find((a: any) => a.isPrimary)?.name || tp.person.aliases?.[0]?.name || tp.person.name || "Person"
                })),
                media: (t.media || []).map((tm: any) => ({
                  id: tm.media.id,
                  title: tm.media.title,
                  fileName: tm.media.fileName,
                  filePath: tm.media.filePath,
                  category: tm.media.category
                }))
              })),
              notes: p.notes.map((n: any) => ({
                id: n.id,
                title: n.title,
                content: n.content,
                createdAt: n.createdAt.toISOString()
              }))
            };
          }),
          unassignedTasks: unassignedTasks.map(t => ({
            id: String(t.id),
            title: t.title,
            notes: t.notes || "",
            completed: t.completed,
            isStarred: t.isStarred,
            status: t.status || (t.completed ? "done" : (t.isPlanned ? "suggestion" : "in_progress")),
            isPlanned: t.isPlanned,
            due: t.due ? t.due.toISOString() : null,
            location: t.location ? t.location.name : null,
            locationId: t.locationId || null,
            locationObj: t.location ? { id: t.location.id, name: t.location.name, address: t.location.formattedAddress || t.location.address || t.location.name } : null,
            persons: (t.persons || []).map((tp: any) => ({
              id: tp.person.id,
              name: tp.person.aliases?.find((a: any) => a.isPrimary)?.name || tp.person.aliases?.[0]?.name || tp.person.name || "Person"
            })),
            media: (t.media || []).map((tm: any) => ({
              id: tm.media.id,
              title: tm.media.title,
              fileName: tm.media.fileName,
              filePath: tm.media.filePath,
              category: tm.media.category
            }))
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
        states: { orderBy: { sortOrder: "asc" } },
        tasks: { where: { isDeleted: false }, include: { state: true } },
        notes: { where: { isDeleted: false } }
      }
    });
  }
};
