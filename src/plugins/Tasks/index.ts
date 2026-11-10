import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import { queryProjectStates, ensureProjectStateSchema } from "../Projects/index.js";

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

async function resolveProjectStateForTask(
  prisma: any,
  projectId: number | null,
  zustandIdArg?: any,
  zustandNameArg?: any,
  statusArg?: any,
  listTitleArg?: any,
  allowDefaultFallback = false
): Promise<{ id: number; name: string; icon: string } | null> {
  if (!projectId) return null;
  const states: any[] = await queryProjectStates(prisma, Number(projectId));
  if (states.length === 0) return null;

  if (zustandIdArg !== undefined && zustandIdArg !== null && zustandIdArg !== "" && zustandIdArg !== "null") {
    const numId = Number(zustandIdArg);
    if (!isNaN(numId)) {
      const byId = states.find(s => Number(s.id) === numId);
      if (byId) return byId;
    }
  }

  const candidates = [
    zustandNameArg,
    statusArg,
    (listTitleArg && String(listTitleArg).trim().toLowerCase() !== "standard") ? listTitleArg : null
  ].filter(Boolean).map(v => String(v).trim());

  for (const cand of candidates) {
    if (/^\d+$/.test(cand)) {
      const byNum = states.find(s => Number(s.id) === Number(cand));
      if (byNum) return byNum;
    }
    const lower = cand.toLowerCase();
    const byExactName = states.find(s => s.name.toLowerCase() === lower);
    if (byExactName) return byExactName;
    const byPartial = states.find(s => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()));
    if (byPartial) return byPartial;
  }

  if (allowDefaultFallback) {
    return states.find(s => s.isDefault) || states[0] || null;
  }
  return null;
}

export const tasksPlugin: Plugin = {
  name: "Tasks",
  description: "Ermöglicht das Verwalten und Erstellen von Aufgaben in der lokalen Datenbank (inklusive Zuordnung zu Projekten per projectId und Projekt-Zuständen per zustandId).",
  tools: [
    {
      definition: {
        name: "hole_aufgaben",
        description: "Ruft alle unvollständigen Aufgaben aus der lokalen Datenbank ab (inklusive Projekt-Zuordnung projectId und Projekt-Zustand zustandId / zustandName).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            zeigeGeloeschte: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur gelöschte Aufgaben zurückgegeben. Standard ist false." },
            nurInPlanung: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur Aufgaben zurückgegeben, die 'In Planung' / Vorschläge sind." },
            nurMarkiert: { type: SchemaType.BOOLEAN, description: "Wenn true, werden nur mit Stern markierte Aufgaben zurückgegeben." },
            projectId: { type: SchemaType.INTEGER, description: "Optional: Filtert Aufgaben nach einer bestimmten Projekt-ID." }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        const zeigeGeloeschte = !!args.zeigeGeloeschte;
        const nurInPlanung = !!args.nurInPlanung;
        const nurMarkiert = !!args.nurMarkiert;
        const whereClause: any = zeigeGeloeschte
          ? { isDeleted: true }
          : { completed: false, isDeleted: false };
        if (nurInPlanung && !zeigeGeloeschte) {
          whereClause.OR = [
            { isPlanned: true },
            { status: "suggestion" }
          ];
        }
        if (nurMarkiert) {
          whereClause.isStarred = true;
        }
        if (args.projectId !== undefined && args.projectId !== null) {
          whereClause.projectId = Number(args.projectId);
        }

        const tasks = await prisma.task.findMany({
          where: whereClause,
          include: {
            project: true,
            location: true,
            persons: {
              include: {
                person: {
                  include: { aliases: true }
                }
              }
            },
            media: {
              include: {
                media: true
              }
            }
          },
          orderBy: { updatedAt: "desc" }
        });

        await ensureProjectStateSchema(prisma);
        const allStates = await queryProjectStates(prisma);
        const stateById = new Map<number, any>();
        for (const s of allStates) stateById.set(Number(s.id), s);
        const taskStateRows: any[] = await (prisma as any).$queryRawUnsafe(
          `SELECT "id", "stateId" FROM "Task" WHERE "isDeleted" = false`
        ).catch(() => []);
        const taskStateMap = new Map<number, number | null>();
        for (const r of taskStateRows) {
          taskStateMap.set(Number(r.id), r.stateId !== null && r.stateId !== undefined ? Number(r.stateId) : null);
        }

        return {
          status: "success",
          tasks: tasks.map(t => {
            const stId = taskStateMap.get(Number(t.id)) ?? ((t as any).stateId ? Number((t as any).stateId) : null);
            const stObj = stId ? (stateById.get(stId) || null) : null;
            return {
              id: String(t.id),
              titel: t.title,
              notizen: t.notes || "",
              faellig: t.due ? t.due.toISOString() : null,
              projectId: t.projectId || null,
              projektName: t.project ? t.project.name : null,
              zustandId: stId || null,
              zustandName: stObj ? stObj.name : null,
              aufgabenlisteId: t.listTitle,
              aufgabenlisteTitel: t.listTitle,
              wiederholung: t.recurrence || null,
              erledigt: t.completed,
              geloescht: t.isDeleted,
              inPlanung: t.isPlanned,
              isStarred: t.isStarred,
              status: t.status || (t.completed ? "done" : (t.isPlanned ? "suggestion" : "in_progress")),
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
            };
          })
        };
      }
    },
    {
      definition: {
        name: "erstelle_aufgabe",
        description: "Erstellt eine neue Aufgabe in der lokalen Datenbank. Wenn die Aufgabe zu einem Projekt gehört, gib 'projectId' und für den Projekt-Zustand 'zustandId' (aus der Tabelle ProjectState) an.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Der Titel der Aufgabe" },
            notizen: { type: SchemaType.STRING, description: "Zusätzliche Notizen oder Beschreibung der Aufgabe (optional)" },
            datum: { type: SchemaType.STRING, description: "Fälligkeitsdatum im Format YYYY-MM-DD (optional)" },
            projectId: { type: SchemaType.INTEGER, description: "Die ID des Projekts, dem die Aufgabe zugeordnet ist (optional)" },
            zustandId: { type: SchemaType.INTEGER, description: "Die numerische ID des Projekt-Zustands (aus der ProjectState-Tabelle, z. B. aus hole_projekte oder verwalte_projekt_zustaende), dem die Aufgabe im Projekt zugeordnet wird (optional)" },
            zustandName: { type: SchemaType.STRING, description: "Alternativ zu zustandId: Name des Projekt-Zustands im Projekt (wird automatisch in die passende zustandId aufgelöst) (optional)" },
            recurrence: { type: SchemaType.STRING, description: "Wiederholungsintervall: 'daily', 'weekly', 'monthly', 'yearly' oder 'none' (optional)" },
            inPlanung: { type: SchemaType.BOOLEAN, description: "Ob die Aufgabe noch 'In Planung' / Vorschlag ist (optional)" },
            isStarred: { type: SchemaType.BOOLEAN, description: "Ob die Aufgabe mit einem Stern versehen und angepinnt werden soll (optional)" },
            status: { type: SchemaType.STRING, description: "Allgemeiner Status für Aufgaben ohne eigene Projekt-Zustände: 'suggestion' (Vorschlag), 'in_progress' (In Arbeit) oder 'done' (Fertig). Standard ist 'in_progress'." },
            aufgabenlisteTitel: { type: SchemaType.STRING, description: "Nur für allgemeine Aufgaben ohne Projekt (Standard: 'Standard'). NIEMALS für Projekt-Zustände verwenden (nutze dafür zustandId)!" },
            locationId: { type: SchemaType.INTEGER, description: "Optionale ID des zugeordneten Ortes aus dem Locations-Plugin" },
            personIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Personen" },
            mediaIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Medien/Dokumente" }
          },
          required: ["titel"]
        } as any
      },
      handler: async (args, { prisma }) => {
        let due = args.datum ? new Date(args.datum) : undefined;
        const recurrence = args.recurrence && args.recurrence !== "none" ? args.recurrence.toLowerCase() : null;
        const projectId = args.projectId ? Number(args.projectId) : null;
        const isPlanned = args.inPlanung !== undefined ? !!args.inPlanung : (args.status === "suggestion");
        const isStarred = args.isStarred !== undefined ? !!args.isStarred : false;

        const resolvedState = await resolveProjectStateForTask(
          prisma,
          projectId,
          args.zustandId ?? args.stateId,
          args.zustandName,
          args.status,
          args.aufgabenlisteTitel,
          true
        );

        const taskStatus = (args.status === "suggestion" || args.status === "in_progress" || args.status === "done")
          ? args.status
          : (isPlanned ? "suggestion" : "in_progress");
        const completed = taskStatus === "done";

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
              listTitle: projectId ? "Standard" : (args.aufgabenlisteTitel || "Standard"),
              recurrence: recurrence,
              projectId: projectId,
              locationId: args.locationId ? Number(args.locationId) : null,
              isPlanned: isPlanned,
              isStarred: isStarred,
              status: taskStatus,
              completed: completed,
              completedAt: completed ? new Date() : null
            }
          });

          if (resolvedState) {
            await ensureProjectStateSchema(prisma);
            await prisma.$executeRawUnsafe(
              `UPDATE "Task" SET "stateId" = $1 WHERE "id" = $2`,
              Number(resolvedState.id),
              Number(task.id)
            ).catch(() => {});
          }

          if (args.personIds) {
            const pIds = Array.isArray(args.personIds) ? args.personIds : String(args.personIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
            for (const pid of pIds) {
              await prisma.taskPerson.create({ data: { taskId: task.id, personId: Number(pid) } }).catch(() => { });
            }
          }

          if (args.mediaIds) {
            const mIds = Array.isArray(args.mediaIds) ? args.mediaIds : String(args.mediaIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
            for (const mid of mIds) {
              await prisma.mediaTask.create({ data: { taskId: task.id, mediaId: Number(mid) } }).catch(() => { });
            }
          }
          return {
            status: "success",
            message: `Aufgabe '${args.titel}' wurde erstellt.${resolvedState ? ` Zugeordneter Projekt-Zustand: '${resolvedState.name}' (zustandId: ${resolvedState.id}).` : ""}`,
            aufgabe: {
              id: String(task.id),
              titel: task.title,
              notizen: task.notes || "",
              faellig: task.due ? task.due.toISOString() : null,
              projectId: task.projectId,
              zustandId: resolvedState ? Number(resolvedState.id) : null,
              zustandName: resolvedState ? resolvedState.name : null,
              recurrence: task.recurrence,
              inPlanung: task.isPlanned,
              isStarred: task.isStarred,
              status: task.status
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
          const now = new Date();
          if (task && task.recurrence && task.due) {
            const nextDue = calculateNextDueDate(task.due, task.recurrence);
            // Erstelle einen erledigten Eintrag für das Tagebuch dieses Tages
            await prisma.task.create({
              data: {
                title: task.title,
                notes: task.notes,
                due: task.due,
                completed: true,
                completedAt: now,
                listTitle: task.listTitle,
                recurrence: null,
                projectId: task.projectId
              }
            });
            // Verschiebe die wiederkehrende Hauptaufgabe auf das nächste Fälligkeitsdatum
            await prisma.task.update({
              where: { id: Number(args.taskId) },
              data: {
                due: nextDue,
                completed: false
              }
            });
            return {
              status: "success",
              message: `Wiederkehrende Aufgabe erledigt und auf das nächste Datum (${nextDue.toISOString().split('T')[0]}) verschoben. Erledigung im Tagebuch verzeichnet.`,
              nextDue: nextDue.toISOString()
            };
          } else {
            await prisma.task.update({
              where: { id: Number(args.taskId) },
              data: { completed: true, completedAt: now }
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
        name: "wiedereroeffnen_aufgabe",
        description: "Markiert eine erledigte Aufgabe wieder als unerledigt / offen.",
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
            data: { completed: false, completedAt: null }
          });
          return {
            status: "success",
            message: "Aufgabe erfolgreich wiedereröffnet (als offen markiert)."
          };
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
        description: "Aktualisiert eine bestehende Aufgabe in der lokalen Datenbank (inklusive Projekt-Zuordnung projectId und Projekt-Zustand zustandId).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            taskId: { type: SchemaType.STRING, description: "Die ID der zu aktualisierenden Aufgabe" },
            titel: { type: SchemaType.STRING, description: "Der neue Titel der Aufgabe (optional)" },
            notizen: { type: SchemaType.STRING, description: "Zusätzliche Notizen oder Beschreibung der Aufgabe (optional)" },
            datum: { type: SchemaType.STRING, description: "Fälligkeitsdatum im Format YYYY-MM-DD (optional, 'null' zum Entfernen)" },
            projectId: { type: SchemaType.INTEGER, description: "Die neue ID des Projekts oder 'null' zum Entfernen (optional)" },
            zustandId: { type: SchemaType.INTEGER, description: "Die numerische ID des Projekt-Zustands aus der ProjectState-Tabelle (z. B. aus hole_projekte oder verwalte_projekt_zustaende), in den die Aufgabe verschoben werden soll (optional)" },
            zustandName: { type: SchemaType.STRING, description: "Alternativ zu zustandId: Name des Projekt-Zustands im Projekt (wird automatisch in die passende zustandId aufgelöst) (optional)" },
            recurrence: { type: SchemaType.STRING, description: "Neues Wiederholungsintervall: 'daily', 'weekly', 'monthly', 'yearly' oder 'none' (optional)" },
            inPlanung: { type: SchemaType.BOOLEAN, description: "Ob die Aufgabe noch 'In Planung' / Vorschlag ist (optional)" },
            isStarred: { type: SchemaType.BOOLEAN, description: "Ob die Aufgabe mit einem Stern versehen und angepinnt werden soll (optional)" },
            status: { type: SchemaType.STRING, description: "Allgemeiner Status für Aufgaben ohne eigene Projekt-Zustände: 'suggestion' (Vorschlag), 'in_progress' (In Arbeit) oder 'done' (Fertig) (optional)" },
            aufgabenlisteTitel: { type: SchemaType.STRING, description: "Nur für allgemeine Aufgaben ohne Projekt. NIEMALS für Projekt-Zustände verwenden (nutze dafür zustandId)!" },
            locationId: { type: SchemaType.INTEGER, description: "Optionale ID des zugeordneten Ortes aus dem Locations-Plugin" },
            personIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Personen" },
            mediaIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Medien/Dokumente" }
          },
          required: ["taskId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          const existingTask = await prisma.task.findUnique({ where: { id: Number(args.taskId) } });
          if (!existingTask) {
            return { status: "error", message: `Aufgabe mit ID ${args.taskId} nicht gefunden.` };
          }

          const updateData: any = {};
          if (args.titel !== undefined) updateData.title = args.titel;
          if (args.notizen !== undefined) updateData.notes = args.notizen || null;
          if (args.datum !== undefined) {
            updateData.due = args.datum && args.datum !== "null" ? new Date(args.datum) : null;
          }
          if (args.inPlanung !== undefined) updateData.isPlanned = !!args.inPlanung;
          if (args.isStarred !== undefined) updateData.isStarred = !!args.isStarred;

          const effectiveProjectId = args.projectId !== undefined
            ? (args.projectId === "null" || args.projectId === null ? null : Number(args.projectId))
            : existingTask.projectId;

          let targetStateIdToSet: number | null | undefined = undefined;
          let targetStateObj: { id: number; name: string; icon: string } | null = null;

          if (args.projectId !== undefined) {
            updateData.projectId = effectiveProjectId;
            if (!effectiveProjectId) {
              targetStateIdToSet = null;
            }
          }

          if (effectiveProjectId) {
            const wantsStateUpdate =
              args.zustandId !== undefined ||
              (args as any).stateId !== undefined ||
              args.zustandName !== undefined ||
              args.status !== undefined ||
              (args.aufgabenlisteTitel !== undefined && String(args.aufgabenlisteTitel).toLowerCase() !== "standard") ||
              (args.projectId !== undefined && existingTask.projectId !== effectiveProjectId);

            if (wantsStateUpdate) {
              const resolvedState = await resolveProjectStateForTask(
                prisma,
                effectiveProjectId,
                args.zustandId ?? (args as any).stateId,
                args.zustandName,
                args.status,
                args.aufgabenlisteTitel,
                args.projectId !== undefined && existingTask.projectId !== effectiveProjectId
              );
              if (resolvedState) {
                targetStateIdToSet = Number(resolvedState.id);
                targetStateObj = resolvedState;
                updateData.listTitle = "Standard";
              }
            }
          } else if (args.aufgabenlisteTitel !== undefined) {
            updateData.listTitle = args.aufgabenlisteTitel || "Standard";
          }

          if (args.status !== undefined) {
            if (args.status === "done") {
              updateData.status = "done";
              updateData.completed = true;
              updateData.completedAt = new Date();
              updateData.isPlanned = false;
            } else if (args.status === "suggestion") {
              updateData.status = "suggestion";
              updateData.completed = false;
              updateData.completedAt = null;
              updateData.isPlanned = true;
            } else if (args.status === "in_progress") {
              updateData.status = "in_progress";
              updateData.completed = false;
              updateData.completedAt = null;
              updateData.isPlanned = false;
            }
          }
          if (args.recurrence !== undefined) {
            updateData.recurrence = args.recurrence === "none" ? null : args.recurrence.toLowerCase();
            if (updateData.recurrence && args.datum === undefined && !existingTask.due) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              updateData.due = today;
            }
          }
          if (args.locationId !== undefined) {
            updateData.locationId = args.locationId === "null" || args.locationId === null ? null : Number(args.locationId);
          }

          const updatedTask = await prisma.task.update({
            where: { id: Number(args.taskId) },
            data: updateData,
            include: { project: true }
          });

          await ensureProjectStateSchema(prisma);
          if (targetStateIdToSet !== undefined) {
            await prisma.$executeRawUnsafe(
              `UPDATE "Task" SET "stateId" = $1 WHERE "id" = $2`,
              targetStateIdToSet,
              Number(updatedTask.id)
            ).catch(() => {});
          }

          let finalStateId: number | null = targetStateIdToSet !== undefined ? targetStateIdToSet : null;
          if (targetStateIdToSet === undefined) {
            const stRows: any[] = await (prisma as any).$queryRawUnsafe(
              `SELECT "stateId" FROM "Task" WHERE "id" = $1`,
              Number(updatedTask.id)
            ).catch(() => []);
            if (stRows[0] && stRows[0].stateId !== null && stRows[0].stateId !== undefined) {
              finalStateId = Number(stRows[0].stateId);
            }
          }
          if (!targetStateObj && finalStateId && updatedTask.projectId) {
            const projStates = await queryProjectStates(prisma, Number(updatedTask.projectId));
            targetStateObj = projStates.find(s => Number(s.id) === finalStateId) || null;
          }

          if (args.personIds !== undefined) {
            await prisma.taskPerson.deleteMany({ where: { taskId: updatedTask.id } });
            if (args.personIds && args.personIds !== "null") {
              const pIds = Array.isArray(args.personIds) ? args.personIds : String(args.personIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
              for (const pid of pIds) {
                await prisma.taskPerson.create({ data: { taskId: updatedTask.id, personId: Number(pid) } }).catch(() => { });
              }
            }
          }

          if (args.mediaIds !== undefined) {
            await prisma.mediaTask.deleteMany({ where: { taskId: updatedTask.id } });
            if (args.mediaIds && args.mediaIds !== "null") {
              const mIds = Array.isArray(args.mediaIds) ? args.mediaIds : String(args.mediaIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
              for (const mid of mIds) {
                await prisma.mediaTask.create({ data: { taskId: updatedTask.id, mediaId: Number(mid) } }).catch(() => { });
              }
            }
          }
          return {
            status: "success",
            message: `Aufgabe erfolgreich aktualisiert.${targetStateObj ? ` Aktueller Projekt-Zustand: '${targetStateObj.name}' (zustandId: ${finalStateId}).` : ""}`,
            aufgabe: {
              id: String(updatedTask.id),
              titel: updatedTask.title,
              notizen: updatedTask.notes || "",
              faellig: updatedTask.due ? updatedTask.due.toISOString() : null,
              projectId: updatedTask.projectId || null,
              zustandId: finalStateId || null,
              zustandName: targetStateObj ? targetStateObj.name : null,
              inPlanung: updatedTask.isPlanned,
              isStarred: updatedTask.isStarred,
              status: updatedTask.status,
              erledigt: updatedTask.completed
            }
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Aktualisieren: ${e.message}` };
        }
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    return [];
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
    const task: any = await prisma.task.findUnique({
      where: { id: Number(id) },
      include: {
        project: true,
        location: true,
        persons: {
          include: {
            person: {
              include: { aliases: true }
            }
          }
        },
        media: {
          include: {
            media: true
          }
        }
      }
    });
    if (!task) return null;
    await ensureProjectStateSchema(prisma);
    if (task.project) {
      const states = await queryProjectStates(prisma, Number(task.project.id));
      task.project.states = states;
      const stRows: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT "stateId" FROM "Task" WHERE "id" = $1`,
        Number(task.id)
      ).catch(() => []);
      const stId = stRows[0]?.stateId !== null && stRows[0]?.stateId !== undefined ? Number(stRows[0].stateId) : null;
      task.stateId = stId;
      task.state = stId ? (states.find(s => Number(s.id) === stId) || null) : null;
    }
    return task;
  }
};
