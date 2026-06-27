import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

function getFuzzyTimeRange(date: Date, fuzzy: string): { start: Date; end: Date } {
  const start = new Date(date);
  start.setSeconds(0);
  start.setMilliseconds(0);
  const end = new Date(date);
  end.setSeconds(0);
  end.setMilliseconds(0);

  switch (fuzzy.toLowerCase()) {
    case 'morgens':
      start.setHours(8, 0);
      end.setHours(10, 0);
      break;
    case 'vormittag':
      start.setHours(10, 0);
      end.setHours(12, 0);
      break;
    case 'mittags':
      start.setHours(12, 0);
      end.setHours(14, 0);
      break;
    case 'nachmittag':
      start.setHours(15, 0);
      end.setHours(17, 0);
      break;
    case 'abends':
      start.setHours(18, 0);
      end.setHours(21, 0);
      break;
    default:
      start.setHours(12, 0);
      end.setHours(13, 0);
      break;
  }
  return { start, end };
}

async function matchPersonsForEvents(events: any[], prisma: any): Promise<any[]> {
  try {
    const persons = await prisma.person.findMany({
      where: { isDeleted: false },
      include: { aliases: true }
    });

    return events.map(event => {
      const titleAndDesc = `${event.title} ${event.description || ""}`;
      const matched: { id: number; name: string }[] = [];

      for (const p of persons) {
        const hasMatch = p.aliases.some((alias: any) => {
          const escaped = alias.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          return regex.test(titleAndDesc);
        });

        if (hasMatch) {
          const primaryAlias = p.aliases.find((a: any) => a.isPrimary) || p.aliases[0];
          matched.push({
            id: p.id,
            name: primaryAlias ? primaryAlias.name : "Unbekannt"
          });
        }
      }

      return {
        ...event,
        persons: matched
      };
    });
  } catch (err) {
    console.error("Error matching persons for events:", err);
    return events.map(e => ({ ...e, persons: [] }));
  }
}

function getOccurrences(pattern: any, startRange: Date, endRange: Date, overrides: any[]): any[] {
  const occurrences: any[] = [];
  const originalStart = new Date(pattern.originalStart);
  const originalEnd = new Date(pattern.originalEnd);
  const durationMs = originalEnd.getTime() - originalStart.getTime();
  const recurrenceType = pattern.recurrenceType; // "DAILY" | "WEEKLY" | "MONTHLY"
  const recurrenceEnd = pattern.recurrenceEnd ? new Date(pattern.recurrenceEnd) : null;

  let currentStart = new Date(originalStart);
  const limitDate = recurrenceEnd && recurrenceEnd < endRange ? recurrenceEnd : endRange;

  let loops = 0;
  while (currentStart <= limitDate && loops < 366) {
    loops++;
    const occurrenceEnd = new Date(currentStart.getTime() + durationMs);

    if (occurrenceEnd >= startRange && currentStart <= endRange) {
      const occurrenceStartMs = currentStart.getTime();
      const override = overrides.find((o: any) => 
        o.recurrenceId === pattern.id && 
        o.originalOccurrenceDate && 
        new Date(o.originalOccurrenceDate).getTime() === occurrenceStartMs
      );

      if (!override) {
        occurrences.push({
          id: `rec-${pattern.id}-${occurrenceStartMs}`,
          title: pattern.title,
          description: pattern.description,
          start: new Date(currentStart),
          end: occurrenceEnd,
          isAllDay: pattern.isAllDay,
          isRecurring: true,
          recurrenceId: pattern.id,
          originalOccurrenceDate: new Date(currentStart),
          fuzzyTime: pattern.fuzzyTime
        });
      }
    }

    if (recurrenceType === 'DAILY') {
      currentStart.setDate(currentStart.getDate() + 1);
    } else if (recurrenceType === 'WEEKLY') {
      currentStart.setDate(currentStart.getDate() + 7);
    } else if (recurrenceType === 'MONTHLY') {
      currentStart.setMonth(currentStart.getMonth() + 1);
    } else {
      break;
    }
  }

  return occurrences;
}

export async function getEventsForRange(start: Date, end: Date, prisma: any): Promise<any[]> {
  let occurrences: any[] = [];
  let dbEvents: any[] = [];
  try {
    dbEvents = await prisma.event.findMany({
      where: {
        isDeleted: false,
        start: { lte: end },
        end: { gte: start }
      }
    });

    const dbPatterns = await prisma.recurrencePattern.findMany({
      where: {
        isDeleted: false,
        originalStart: { lte: end },
        OR: [
          { recurrenceEnd: null },
          { recurrenceEnd: { gte: start } }
        ]
      }
    });

    const patternIds = dbPatterns.map((p: any) => p.id);
    const overrides = patternIds.length > 0 ? await prisma.event.findMany({
      where: { recurrenceId: { in: patternIds } }
    }) : [];

    for (const pattern of dbPatterns) {
      occurrences.push(...getOccurrences(pattern, start, end, overrides));
    }
  } catch (e) {
    console.warn("Fehler beim Abrufen der lokalen Kalender-Daten:", e);
  }

  const allEvents = [
    ...dbEvents.map((e: any) => ({
      id: String(e.id),
      title: e.title,
      description: e.description || "",
      time: e.start.toISOString(),
      endTime: e.end.toISOString(),
      isAllDay: e.isAllDay,
      recurring: e.recurrenceId !== null,
      occurrenceDate: e.originalOccurrenceDate ? e.originalOccurrenceDate.toISOString().split('T')[0] : null,
      isCancelled: e.isCancelled,
      cancellationReason: e.cancellationReason || null,
      originalStart: e.originalStart ? e.originalStart.toISOString() : null,
      originalEnd: e.originalEnd ? e.originalEnd.toISOString() : null,
      fuzzyTime: e.fuzzyTime
    })),
    ...occurrences.map((o: any) => ({
      id: o.id,
      title: o.title,
      description: o.description || "",
      time: o.start.toISOString(),
      endTime: o.end.toISOString(),
      isAllDay: o.isAllDay,
      recurring: true,
      occurrenceDate: o.originalOccurrenceDate.toISOString().split('T')[0],
      isCancelled: false,
      cancellationReason: null,
      originalStart: null,
      originalEnd: null,
      fuzzyTime: o.fuzzyTime
    }))
  ];

  allEvents.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return matchPersonsForEvents(allEvents, prisma);
}

export const calendarPlugin: Plugin = {
  name: "Calendar",
  description: "Verwaltet Termine und wiederkehrende Muster in der lokalen Datenbank.",
  tools: [
    {
      definition: {
        name: "was_steht_an",
        description: "Zeigt alle Termine für einen bestimmten Tag an.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            datum: { type: SchemaType.STRING, description: "Das Datum im Format YYYY-MM-DD" }
          },
          required: ["datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const startOfDay = new Date(args.datum);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(args.datum);
        endOfDay.setHours(23, 59, 59, 999);

        // 1. Fetch normal events and override events that overlap the day and are not completely hidden/deleted
        const dbEvents = await prisma.event.findMany({
          where: {
            isDeleted: false,
            start: { lte: endOfDay },
            end: { gte: startOfDay }
          }
        });

        // 2. Fetch all recurrence patterns that could occur on this day
        const dbPatterns = await prisma.recurrencePattern.findMany({
          where: {
            isDeleted: false,
            originalStart: { lte: endOfDay },
            OR: [
              { recurrenceEnd: null },
              { recurrenceEnd: { gte: startOfDay } }
            ]
          }
        });

        // 3. Fetch overrides for check
        const patternIds = dbPatterns.map(p => p.id);
        const overrides = patternIds.length > 0 ? await prisma.event.findMany({
          where: { recurrenceId: { in: patternIds } }
        }) : [];

        // 4. Expand recurring events
        const occurrences: any[] = [];
        for (const pattern of dbPatterns) {
          occurrences.push(...getOccurrences(pattern, startOfDay, endOfDay, overrides));
        }

        // 5. Combine and project properties
        const allEvents = [
          ...dbEvents.map(e => ({
            id: String(e.id),
            title: e.title,
            description: e.description || "",
            start: e.start,
            end: e.end,
            isAllDay: e.isAllDay,
            isRecurring: e.recurrenceId !== null,
            recurrenceId: e.recurrenceId,
            originalOccurrenceDate: e.originalOccurrenceDate,
            isCancelled: e.isCancelled,
            cancellationReason: e.cancellationReason || null,
            originalStart: e.originalStart,
            originalEnd: e.originalEnd,
            fuzzyTime: e.fuzzyTime
          })),
          ...occurrences.map(o => ({
            id: o.id,
            title: o.title,
            description: o.description || "",
            start: o.start,
            end: o.end,
            isAllDay: o.isAllDay,
            isRecurring: true,
            recurrenceId: o.recurrenceId,
            originalOccurrenceDate: o.originalOccurrenceDate,
            isCancelled: false,
            cancellationReason: null,
            originalStart: null,
            originalEnd: null,
            fuzzyTime: o.fuzzyTime
          }))
        ];

        allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

        const matchedEvents = await matchPersonsForEvents(allEvents, prisma);

        return {
          type: "calendar_widget",
          date: args.datum,
          events: matchedEvents.map(e => ({
            id: e.id,
            title: e.title,
            time: e.start.toISOString(),
            endTime: e.end.toISOString(),
            type: "local",
            description: e.description,
            isAllDay: e.isAllDay,
            isRecurring: e.isRecurring,
            recurrenceId: e.recurrenceId,
            originalOccurrenceDate: e.originalOccurrenceDate ? e.originalOccurrenceDate.toISOString() : null,
            isCancelled: e.isCancelled,
            cancellationReason: e.cancellationReason,
            originalStart: e.originalStart ? e.originalStart.toISOString() : null,
            originalEnd: e.originalEnd ? e.originalEnd.toISOString() : null,
            fuzzyTime: e.fuzzyTime,
            persons: e.persons
          }))
        };
      }
    },
    {
      definition: {
        name: "fuege_termin_hinzu",
        description: "Fügt einen neuen Termin zum Kalender hinzu. Kann optional wiederkehrend oder ganztägig sein.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Titel des Termins" },
            datum: { type: SchemaType.STRING, description: "Datum/Startzeit (YYYY-MM-DD oder ISO-String)" },
            enddatum: { type: SchemaType.STRING, description: "Enddatum/-uhrzeit (YYYY-MM-DD oder ISO-String) (optional)" },
            beschreibung: { type: SchemaType.STRING, description: "Beschreibung (optional)" },
            ganztaegig: { type: SchemaType.BOOLEAN, description: "Ob der Termin ganztägig ist (optional)" },
            wiederkehrend: { type: SchemaType.BOOLEAN, description: "Ob der Termin sich wiederholt (optional)" },
            wiederholungsTyp: { type: SchemaType.STRING, description: "Typ der Wiederholung: 'DAILY', 'WEEKLY' oder 'MONTHLY' (optional)" },
            wiederholungsEnde: { type: SchemaType.STRING, description: "Enddatum der Wiederholung YYYY-MM-DD (optional)" },
            tageszeit: { type: SchemaType.STRING, description: "Uhrzeit-Abschnitt, falls nicht minutengenau: 'morgens', 'vormittag', 'mittags', 'nachmittag' oder 'abends' (optional)" }
          },
          required: ["titel", "datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        let start = new Date(args.datum);
        let end = args.enddatum ? new Date(args.enddatum) : new Date(start.getTime() + 60 * 60 * 1000);

        const isRecurring = !!args.wiederkehrend;
        const recurrenceType = args.wiederholungsTyp || "WEEKLY";
        const recurrenceEnd = args.wiederholungsEnde ? new Date(args.wiederholungsEnde) : null;
        const isAllDay = !!args.ganztaegig;
        const fuzzyTime = args.tageszeit || null;

        if (fuzzyTime) {
          const range = getFuzzyTimeRange(start, fuzzyTime);
          start = range.start;
          end = range.end;
        }

        try {
          if (isRecurring) {
            await prisma.recurrencePattern.create({
              data: {
                title: args.titel,
                description: args.beschreibung || null,
                originalStart: start,
                originalEnd: end,
                isAllDay,
                recurrenceType,
                recurrenceEnd,
                fuzzyTime
              }
            });
          } else {
            await prisma.event.create({
              data: {
                title: args.titel,
                description: args.beschreibung || null,
                start,
                end,
                isAllDay,
                fuzzyTime
              }
            });
          }

          const startOfDay = new Date(start);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(start);
          endOfDay.setHours(23, 59, 59, 999);

          // Return updated widget list
          const dbEvents = await prisma.event.findMany({
            where: {
              isDeleted: false,
              start: { lte: endOfDay },
              end: { gte: startOfDay }
            }
          });

          const dbPatterns = await prisma.recurrencePattern.findMany({
            where: {
              isDeleted: false,
              originalStart: { lte: endOfDay },
              OR: [
                { recurrenceEnd: null },
                { recurrenceEnd: { gte: startOfDay } }
              ]
            }
          });

          const patternIds = dbPatterns.map(p => p.id);
          const overrides = patternIds.length > 0 ? await prisma.event.findMany({
            where: { recurrenceId: { in: patternIds } }
          }) : [];

          const occurrences: any[] = [];
          for (const pattern of dbPatterns) {
            occurrences.push(...getOccurrences(pattern, startOfDay, endOfDay, overrides));
          }

          const allEvents = [
            ...dbEvents.map(e => ({
              id: String(e.id),
              title: e.title,
              description: e.description || "",
              start: e.start,
              end: e.end,
              isAllDay: e.isAllDay,
              isRecurring: e.recurrenceId !== null,
              recurrenceId: e.recurrenceId,
              originalOccurrenceDate: e.originalOccurrenceDate,
              isCancelled: e.isCancelled,
              cancellationReason: e.cancellationReason || null,
              originalStart: e.originalStart,
              originalEnd: e.originalEnd,
              fuzzyTime: e.fuzzyTime
            })),
            ...occurrences.map(o => ({
              id: o.id,
              title: o.title,
              description: o.description || "",
              start: o.start,
              end: o.end,
              isAllDay: o.isAllDay,
              isRecurring: true,
              recurrenceId: o.recurrenceId,
              originalOccurrenceDate: o.originalOccurrenceDate,
              isCancelled: false,
              cancellationReason: null,
              originalStart: null,
              originalEnd: null,
              fuzzyTime: o.fuzzyTime
            }))
          ];

          allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

          const matchedEvents = await matchPersonsForEvents(allEvents, prisma);

          return { 
            type: "calendar_widget",
            date: args.datum.split('T')[0],
            message: `Termin '${args.titel}' wurde erstellt.`,
            events: matchedEvents.map(e => ({ 
              id: e.id, 
              title: e.title, 
              time: e.start.toISOString(), 
              endTime: e.end.toISOString(),
              type: "local",
              description: e.description,
              isAllDay: e.isAllDay,
              isRecurring: e.isRecurring,
              recurrenceId: e.recurrenceId,
              originalOccurrenceDate: e.originalOccurrenceDate ? e.originalOccurrenceDate.toISOString() : null,
              isCancelled: e.isCancelled,
              cancellationReason: e.cancellationReason,
              originalStart: e.originalStart ? e.originalStart.toISOString() : null,
              originalEnd: e.originalEnd ? e.originalEnd.toISOString() : null,
              fuzzyTime: e.fuzzyTime,
              persons: e.persons
            }))
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "loesche_termin",
        description: "Löscht einen Termin. Kann eine einzelne Wiederholung (nurDiesesVorkommen=true) stornieren/löschen oder die gesamte Serie löschen.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            eventId: { type: SchemaType.STRING, description: "Die ID des Termins (kann numerisch oder synthetisch sein)" },
            datum: { type: SchemaType.STRING, description: "Das Datum des Termins (YYYY-MM-DD)" },
            nurDiesesVorkommen: { type: SchemaType.BOOLEAN, description: "Wenn true, wird nur dieses eine Vorkommen storniert/gelöscht." }
          },
          required: ["eventId", "datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          let id: number | null = null;
          let recurrenceId: number | null = null;
          let originalOccurrenceDate: Date | null = null;

          if (args.eventId.startsWith('rec-')) {
            const parts = args.eventId.split('-');
            recurrenceId = Number(parts[1]);
            originalOccurrenceDate = new Date(Number(parts[2]));
          } else {
            id = Number(args.eventId);
            const ev = await prisma.event.findUnique({ where: { id } });
            if (ev && ev.recurrenceId) {
              recurrenceId = ev.recurrenceId;
              originalOccurrenceDate = ev.originalOccurrenceDate;
            }
          }

          if (args.nurDiesesVorkommen) {
            if (recurrenceId && originalOccurrenceDate) {
              const existingOverride = await prisma.event.findFirst({
                where: { recurrenceId, originalOccurrenceDate }
              });

              if (existingOverride) {
                await prisma.event.update({
                  where: { id: existingOverride.id },
                  data: { isDeleted: true }
                });
              } else {
                const pattern = await prisma.recurrencePattern.findUnique({ where: { id: recurrenceId } });
                if (!pattern) throw new Error("Wiederholungsmuster nicht gefunden.");
                
                await prisma.event.create({
                  data: {
                    title: pattern.title,
                    description: pattern.description,
                    start: originalOccurrenceDate,
                    end: new Date(originalOccurrenceDate.getTime() + (pattern.originalEnd.getTime() - pattern.originalStart.getTime())),
                    isAllDay: pattern.isAllDay,
                    recurrenceId,
                    originalOccurrenceDate,
                    isDeleted: true
                  }
                });
              }
            } else if (id) {
              // Soft delete one-off event
              await prisma.event.update({
                where: { id },
                data: { isDeleted: true }
              });
            }
          } else {
            // Delete entire series or the one-off event
            if (recurrenceId) {
              await prisma.recurrencePattern.update({
                where: { id: recurrenceId },
                data: { isDeleted: true }
              });
            } else if (id) {
              await prisma.event.update({
                where: { id },
                data: { isDeleted: true }
              });
            }
          }

          const startOfDay = new Date(args.datum);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(args.datum);
          endOfDay.setHours(23, 59, 59, 999);

          const dbEvents = await prisma.event.findMany({
            where: {
              isDeleted: false,
              start: { lte: endOfDay },
              end: { gte: startOfDay }
            }
          });

          const dbPatterns = await prisma.recurrencePattern.findMany({
            where: {
              isDeleted: false,
              originalStart: { lte: endOfDay },
              OR: [
                { recurrenceEnd: null },
                { recurrenceEnd: { gte: startOfDay } }
              ]
            }
          });

          const patternIds = dbPatterns.map(p => p.id);
          const overrides = patternIds.length > 0 ? await prisma.event.findMany({
            where: { recurrenceId: { in: patternIds } }
          }) : [];

          const occurrences: any[] = [];
          for (const pattern of dbPatterns) {
            occurrences.push(...getOccurrences(pattern, startOfDay, endOfDay, overrides));
          }

          const allEvents = [
            ...dbEvents.map(e => ({
              id: String(e.id),
              title: e.title,
              description: e.description || "",
              start: e.start,
              end: e.end,
              isAllDay: e.isAllDay,
              isRecurring: e.recurrenceId !== null,
              recurrenceId: e.recurrenceId,
              originalOccurrenceDate: e.originalOccurrenceDate,
              isCancelled: e.isCancelled,
              cancellationReason: e.cancellationReason || null,
              originalStart: e.originalStart,
              originalEnd: e.originalEnd,
              fuzzyTime: e.fuzzyTime
            })),
            ...occurrences.map(o => ({
              id: o.id,
              title: o.title,
              description: o.description || "",
              start: o.start,
              end: o.end,
              isAllDay: o.isAllDay,
              isRecurring: true,
              recurrenceId: o.recurrenceId,
              originalOccurrenceDate: o.originalOccurrenceDate,
              isCancelled: false,
              cancellationReason: null,
              originalStart: null,
              originalEnd: null,
              fuzzyTime: o.fuzzyTime
            }))
          ];

          allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

          const matchedEvents = await matchPersonsForEvents(allEvents, prisma);

          return { 
            type: "calendar_widget",
            date: args.datum,
            message: `Termin wurde gelöscht.`,
            events: matchedEvents.map(e => ({ 
              id: e.id, 
              title: e.title, 
              time: e.start.toISOString(), 
              endTime: e.end.toISOString(),
              type: "local",
              description: e.description,
              isAllDay: e.isAllDay,
              isRecurring: e.isRecurring,
              recurrenceId: e.recurrenceId,
              originalOccurrenceDate: e.originalOccurrenceDate ? e.originalOccurrenceDate.toISOString() : null,
              isCancelled: e.isCancelled,
              cancellationReason: e.cancellationReason,
              originalStart: e.originalStart ? e.originalStart.toISOString() : null,
              originalEnd: e.originalEnd ? e.originalEnd.toISOString() : null,
              fuzzyTime: e.fuzzyTime,
              persons: e.persons
            }))
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Löschen: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "wiederherstellen_termin",
        description: "Stellt einen gelöschten Termin, eine gelöschte Wiederholungsserie oder ein gelöschtes Vorkommen wieder her.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            eventId: { type: SchemaType.STRING, description: "Die ID des Termins (z. B. 'rec-ID-Timestamp' oder eine einfache numerische ID)" }
          },
          required: ["eventId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          let id: number | null = null;
          let recurrenceId: number | null = null;
          let originalOccurrenceDate: Date | null = null;

          if (args.eventId.startsWith('rec-')) {
            const parts = args.eventId.split('-');
            recurrenceId = Number(parts[1]);
            originalOccurrenceDate = new Date(Number(parts[2]));
          } else {
            id = Number(args.eventId);
            const ev = await prisma.event.findUnique({ where: { id } });
            if (ev && ev.recurrenceId) {
              recurrenceId = ev.recurrenceId;
              originalOccurrenceDate = ev.originalOccurrenceDate;
            }
          }

          if (recurrenceId && originalOccurrenceDate) {
            const existingOverride = await prisma.event.findFirst({
              where: { recurrenceId, originalOccurrenceDate }
            });

            if (existingOverride) {
              const pattern = await prisma.recurrencePattern.findUnique({ where: { id: recurrenceId } });
              if (existingOverride.title === pattern?.title && existingOverride.isDeleted) {
                // If it was created purely to mark it deleted, delete the override record to restore original behavior
                await prisma.event.delete({ where: { id: existingOverride.id } });
              } else {
                await prisma.event.update({
                  where: { id: existingOverride.id },
                  data: { isDeleted: false }
                });
              }
            }
          } else if (recurrenceId) {
            // Restore recurrence pattern
            await prisma.recurrencePattern.update({
              where: { id: recurrenceId },
              data: { isDeleted: false }
            });
          } else if (id) {
            // Restore one-off event
            await prisma.event.update({
              where: { id },
              data: { isDeleted: false }
            });
          }

          return { status: "success", message: "Termin erfolgreich wiederhergestellt." };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Wiederherstellen: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "bearbeite_termin",
        description: "Bearbeitet einen Termin. Kann Verschiebungen (auch für einzelne Vorkommen), Ausfälle (ausgefallen=true mit Grund) oder Löschungen steuern.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            eventId: { type: SchemaType.STRING, description: "Die ID des Termins" },
            datum: { type: SchemaType.STRING, description: "Das Datum des Termins (YYYY-MM-DD)" },
            nurDiesesVorkommen: { type: SchemaType.BOOLEAN, description: "Wenn true, wird nur dieses eine Vorkommen geändert." },
            neuer_titel: { type: SchemaType.STRING, description: "Neuer Titel (optional)" },
            neues_datum: { type: SchemaType.STRING, description: "Neues Startdatum/Uhrzeit im ISO-Format (optional)" },
            neues_enddatum: { type: SchemaType.STRING, description: "Neues Enddatum/Uhrzeit im ISO-Format (optional)" },
            neue_beschreibung: { type: SchemaType.STRING, description: "Neue Beschreibung (optional)" },
            ganztaegig: { type: SchemaType.BOOLEAN, description: "Ob der Termin ganztägig ist (optional)" },
            ausgefallen: { type: SchemaType.BOOLEAN, description: "Ob das Event ausfällt (optional)" },
            ausfallGrund: { type: SchemaType.STRING, description: "Grund für den Ausfall (optional)" },
            geloescht: { type: SchemaType.BOOLEAN, description: "Ob der Termin an diesem Tag gelöscht werden soll (optional)" },
            tageszeit: { type: SchemaType.STRING, description: "Uhrzeit-Abschnitt, falls nicht minutengenau: 'morgens', 'vormittag', 'mittags', 'nachmittag' oder 'abends' (optional)" }
          },
          required: ["eventId", "datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          let id: number | null = null;
          let recurrenceId: number | null = null;
          let originalOccurrenceDate: Date | null = null;

          if (args.eventId.startsWith('rec-')) {
            const parts = args.eventId.split('-');
            recurrenceId = Number(parts[1]);
            originalOccurrenceDate = new Date(Number(parts[2]));
          } else {
            id = Number(args.eventId);
            const ev = await prisma.event.findUnique({ where: { id } });
            if (ev && ev.recurrenceId) {
              recurrenceId = ev.recurrenceId;
              originalOccurrenceDate = ev.originalOccurrenceDate;
            }
          }

          let pattern: any = null;
          if (recurrenceId) {
            pattern = await prisma.recurrencePattern.findUnique({ where: { id: recurrenceId } });
          }

          if (args.nurDiesesVorkommen) {
            if (recurrenceId && originalOccurrenceDate) {
              const existingOverride = await prisma.event.findFirst({
                where: { recurrenceId, originalOccurrenceDate }
              });

              const data: any = {};
              if (args.neuer_titel !== undefined) data.title = args.neuer_titel;
              if (args.neue_beschreibung !== undefined) data.description = args.neue_beschreibung;
              if (args.ganztaegig !== undefined) data.isAllDay = !!args.ganztaegig;
              if (args.ausgefallen !== undefined) data.isCancelled = !!args.ausgefallen;
              if (args.ausfallGrund !== undefined) data.cancellationReason = args.ausfallGrund;
              if (args.geloescht !== undefined) data.isDeleted = !!args.geloescht;

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? new Date(args.neues_datum) : (existingOverride ? existingOverride.start : originalOccurrenceDate);
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.start = range.start;
                  data.end = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                data.start = new Date(args.neues_datum);
                const duration = args.neues_enddatum ? (new Date(args.neues_enddatum).getTime() - data.start.getTime()) : (60 * 60 * 1000);
                data.end = new Date(data.start.getTime() + duration);
                
                data.originalStart = originalOccurrenceDate;
                if (pattern) {
                  const patternDuration = pattern.originalEnd.getTime() - pattern.originalStart.getTime();
                  data.originalEnd = new Date(originalOccurrenceDate.getTime() + patternDuration);
                }
              }

              if (existingOverride) {
                await prisma.event.update({
                  where: { id: existingOverride.id },
                  data
                });
              } else {
                if (!pattern) throw new Error("Wiederholungsmuster nicht gefunden.");
                
                await prisma.event.create({
                  data: {
                    title: pattern.title,
                    description: pattern.description,
                    start: originalOccurrenceDate,
                    end: new Date(originalOccurrenceDate.getTime() + (pattern.originalEnd.getTime() - pattern.originalStart.getTime())),
                    isAllDay: pattern.isAllDay,
                    recurrenceId,
                    originalOccurrenceDate,
                    ...data
                  }
                });
              }
            } else if (id) {
              // Reschedule a one-off event as a single occurrence change
              const currentEvent = await prisma.event.findUnique({ where: { id } });
              const data: any = {};
              if (args.neuer_titel !== undefined) data.title = args.neuer_titel;
              if (args.neue_beschreibung !== undefined) data.description = args.neue_beschreibung;
              if (args.ganztaegig !== undefined) data.isAllDay = !!args.ganztaegig;
              if (args.ausgefallen !== undefined) data.isCancelled = !!args.ausgefallen;
              if (args.ausfallGrund !== undefined) data.cancellationReason = args.ausfallGrund;
              if (args.geloescht !== undefined) data.isDeleted = !!args.geloescht;

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? new Date(args.neues_datum) : (currentEvent ? currentEvent.start : new Date());
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.start = range.start;
                  data.end = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                if (currentEvent) {
                  data.originalStart = currentEvent.start;
                  data.originalEnd = currentEvent.end;
                }
                data.start = new Date(args.neues_datum);
                const duration = args.neues_enddatum ? (new Date(args.neues_enddatum).getTime() - data.start.getTime()) : (60 * 60 * 1000);
                data.end = new Date(data.start.getTime() + duration);
              }

              await prisma.event.update({
                where: { id },
                data
              });
            }
          } else {
            // Edit entire series or one-off
            if (recurrenceId) {
              const data: any = {};
              if (args.neuer_titel !== undefined) data.title = args.neuer_titel;
              if (args.neue_beschreibung !== undefined) data.description = args.neue_beschreibung;
              if (args.ganztaegig !== undefined) data.isAllDay = !!args.ganztaegig;

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? new Date(args.neues_datum) : (pattern ? pattern.originalStart : new Date());
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.originalStart = range.start;
                  data.originalEnd = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                data.originalStart = new Date(args.neues_datum);
                const duration = args.neues_enddatum ? (new Date(args.neues_enddatum).getTime() - data.originalStart.getTime()) : (60 * 60 * 1000);
                data.originalEnd = new Date(data.originalStart.getTime() + duration);
              }

              await prisma.recurrencePattern.update({
                where: { id: recurrenceId },
                data
              });
            } else if (id) {
              const currentEvent = await prisma.event.findUnique({ where: { id } });
              const data: any = {};
              if (args.neuer_titel !== undefined) data.title = args.neuer_titel;
              if (args.neue_beschreibung !== undefined) data.description = args.neue_beschreibung;
              if (args.ganztaegig !== undefined) data.isAllDay = !!args.ganztaegig;
              if (args.ausgefallen !== undefined) data.isCancelled = !!args.ausgefallen;
              if (args.ausfallGrund !== undefined) data.cancellationReason = args.ausfallGrund;

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? new Date(args.neues_datum) : (currentEvent ? currentEvent.start : new Date());
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.start = range.start;
                  data.end = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                if (currentEvent) {
                  data.originalStart = currentEvent.start;
                  data.originalEnd = currentEvent.end;
                }
                data.start = new Date(args.neues_datum);
                const duration = args.neues_enddatum ? (new Date(args.neues_enddatum).getTime() - data.start.getTime()) : (60 * 60 * 1000);
                data.end = new Date(data.start.getTime() + duration);
              }

              await prisma.event.update({
                where: { id },
                data
              });
            }
          }

          const targetDate = args.neues_datum || args.datum;
          const startOfDay = new Date(targetDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(targetDate);
          endOfDay.setHours(23, 59, 59, 999);

          const dbEvents = await prisma.event.findMany({
            where: {
              isDeleted: false,
              start: { lte: endOfDay },
              end: { gte: startOfDay }
            }
          });

          const dbPatterns = await prisma.recurrencePattern.findMany({
            where: {
              isDeleted: false,
              originalStart: { lte: endOfDay },
              OR: [
                { recurrenceEnd: null },
                { recurrenceEnd: { gte: startOfDay } }
              ]
            }
          });

          const patternIds = dbPatterns.map(p => p.id);
          const overrides = patternIds.length > 0 ? await prisma.event.findMany({
            where: { recurrenceId: { in: patternIds } }
          }) : [];

          const occurrences: any[] = [];
          for (const pattern of dbPatterns) {
            occurrences.push(...getOccurrences(pattern, startOfDay, endOfDay, overrides));
          }

          const allEvents = [
            ...dbEvents.map(e => ({
              id: String(e.id),
              title: e.title,
              description: e.description || "",
              start: e.start,
              end: e.end,
              isAllDay: e.isAllDay,
              isRecurring: e.recurrenceId !== null,
              recurrenceId: e.recurrenceId,
              originalOccurrenceDate: e.originalOccurrenceDate,
              isCancelled: e.isCancelled,
              cancellationReason: e.cancellationReason || null,
              originalStart: e.originalStart,
              originalEnd: e.originalEnd,
              fuzzyTime: e.fuzzyTime
            })),
            ...occurrences.map(o => ({
              id: o.id,
              title: o.title,
              description: o.description || "",
              start: o.start,
              end: o.end,
              isAllDay: o.isAllDay,
              isRecurring: true,
              recurrenceId: o.recurrenceId,
              originalOccurrenceDate: o.originalOccurrenceDate,
              isCancelled: false,
              cancellationReason: null,
              originalStart: null,
              originalEnd: null,
              fuzzyTime: o.fuzzyTime
            }))
          ];

          allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

          const matchedEvents = await matchPersonsForEvents(allEvents, prisma);

          return { 
            type: "calendar_widget",
            date: targetDate.split('T')[0],
            message: `Termin wurde aktualisiert.`,
            events: matchedEvents.map(e => ({ 
              id: e.id, 
              title: e.title, 
              time: e.start.toISOString(), 
              endTime: e.end.toISOString(),
              type: "local",
              description: e.description,
              isAllDay: e.isAllDay,
              isRecurring: e.isRecurring,
              recurrenceId: e.recurrenceId,
              originalOccurrenceDate: e.originalOccurrenceDate ? e.originalOccurrenceDate.toISOString() : null,
              isCancelled: e.isCancelled,
              cancellationReason: e.cancellationReason,
              originalStart: e.originalStart ? e.originalStart.toISOString() : null,
              originalEnd: e.originalEnd ? e.originalEnd.toISOString() : null,
              fuzzyTime: e.fuzzyTime,
              persons: e.persons
            }))
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Bearbeiten: ${e.message}` };
        }
      }
    }
  ],
  getTopWidgets: async ({ prisma, calendarDays }: { prisma: any, calendarDays?: number }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const days = calendarDays || 7;
    const inDays = new Date();
    inDays.setDate(today.getDate() + days);
    inDays.setHours(23, 59, 59, 999);

    const matchedEvents = await getEventsForRange(today, inDays, prisma);

    return [
      {
        pluginName: "Calendar",
        type: "calendar_overview",
        data: {
          events: matchedEvents
        }
      }
    ];
  },
  entityConfig: {
    type: "event",
    prefix: "app://event/",
    color: "rgba(137, 180, 250, 0.15)",
    borderColor: "#89b4fa",
    icon: "📅",
    displayName: "Termin"
  },
  resolveEntity: async (id, { prisma }) => {
    return prisma.event.findUnique({ where: { id } });
  }
};
