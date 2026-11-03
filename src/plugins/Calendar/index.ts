import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import { RouteService, TravelMode, parseFlexibleDate, formatGermanDate, formatGermanTime } from "../../services/routeService.js";

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
          fuzzyTime: pattern.fuzzyTime,
          location: pattern.location || null
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

async function matchPersonsForEvents(events: any[], prisma: any): Promise<any[]> {
  try {
    const persons = await prisma.person.findMany({
      where: { isDeleted: false },
      include: { aliases: true }
    });

    return events.map(event => {
      if (event.persons && event.persons.length > 0) {
        return event;
      }
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

async function getBirthdaysForRange(start: Date, end: Date, prisma: any): Promise<any[]> {
  try {
    const peopleWithBirthdays = await prisma.person.findMany({
      where: {
        isDeleted: false,
        birthday: { not: null }
      },
      select: {
        id: true,
        birthday: true,
        aliases: {
          select: {
            name: true,
            isPrimary: true
          }
        }
      }
    });

    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const birthdayEvents: any[] = [];

    for (const p of peopleWithBirthdays) {
      if (!p.birthday) continue;
      const bday = new Date(p.birthday);
      const bdayMonth = bday.getUTCMonth();
      const bdayDate = bday.getUTCDate();

      const primaryAlias = p.aliases.find((a: any) => a.isPrimary) || p.aliases[0];
      const personName = primaryAlias ? primaryAlias.name : "Unbekannt";

      for (let y = startYear; y <= endYear; y++) {
        const occurrence = new Date(Date.UTC(y, bdayMonth, bdayDate, 12, 0, 0, 0));
        
        if (occurrence >= start && occurrence <= end) {
          const birthYear = bday.getUTCFullYear();
          let ageText = "";
          if (birthYear > 1900) {
            const age = y - birthYear;
            ageText = ` (${age}.)`;
          }

          birthdayEvents.push({
            id: `birthday-${p.id}-${y}`,
            title: `🎂 Geburtstag von ${personName}${ageText}`,
            description: `Geburtstag von ${personName}`,
            start: occurrence,
            end: occurrence,
            time: occurrence.toISOString(),
            endTime: occurrence.toISOString(),
            isAllDay: true,
            isBirthday: true,
            recurring: true,
            occurrenceDate: occurrence.toISOString().split('T')[0],
            isCancelled: false,
            cancellationReason: null,
            originalStart: null,
            originalEnd: null,
            fuzzyTime: null,
            persons: [{ id: p.id, name: personName }]
          });
        }
      }
    }
    return birthdayEvents;
  } catch (err) {
    console.error("Error fetching birthdays for range:", err);
    return [];
  }
}

export async function getEventsForRange(start: Date, end: Date, prisma: any): Promise<any[]> {
  let occurrences: any[] = [];
  let dbEvents: any[] = [];
  let dbTasks: any[] = [];
  try {
    dbEvents = await prisma.event.findMany({
      where: {
        isDeleted: false,
        start: { lte: end },
        end: { gte: start }
      },
      include: {
        locationRef: true,
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

    // Abrufen von Aufgaben, die im Datumsbereich fällig sind
    dbTasks = await prisma.task.findMany({
      where: {
        isDeleted: false,
        due: {
          gte: start,
          lte: end
        }
      },
      include: {
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
  } catch (e) {
    console.warn("Fehler beim Abrufen der lokalen Kalender- und Aufgabendaten:", e);
  }

  const birthdayEvents = await getBirthdaysForRange(start, end, prisma);

  const allEvents = [
    ...dbEvents.map((e: any) => ({
      id: String(e.id),
      title: e.title,
      description: e.description || "",
      time: e.start.toISOString(),
      endTime: e.end.toISOString(),
      startzeitLocal: formatGermanTime(new Date(e.start)),
      endzeitLocal: formatGermanTime(new Date(e.end)),
      uhrzeit: e.isAllDay ? "Ganztägig" : `${formatGermanTime(new Date(e.start))} - ${formatGermanTime(new Date(e.end))} Uhr (deutsche Lokalzeit)`,
      isAllDay: e.isAllDay,
      recurring: e.recurrenceId !== null,
      occurrenceDate: e.originalOccurrenceDate ? e.originalOccurrenceDate.toISOString().split('T')[0] : null,
      isCancelled: e.isCancelled,
      cancellationReason: e.cancellationReason || null,
      originalStart: e.originalStart ? e.originalStart.toISOString() : null,
      originalEnd: e.originalEnd ? e.originalEnd.toISOString() : null,
      fuzzyTime: e.fuzzyTime,
      isPlanned: e.isPlanned,
      location: e.location || (e.locationRef ? e.locationRef.name : null),
      locationId: e.locationId || null,
      locationObj: e.locationRef ? {
        id: e.locationRef.id,
        name: e.locationRef.name,
        address: e.locationRef.formattedAddress || e.locationRef.address || e.locationRef.name
      } : null,
      persons: (e.persons || []).map((ep: any) => ({
        id: ep.person.id,
        name: ep.person.aliases?.find((a: any) => a.isPrimary)?.name || ep.person.aliases?.[0]?.name || ep.person.name || "Person"
      })),
      media: (e.media || []).map((em: any) => ({
        id: em.media.id,
        title: em.media.title,
        fileName: em.media.fileName,
        filePath: em.media.filePath,
        category: em.media.category,
        fileType: em.media.fileType
      })),
      travelMode: e.travelMode || null,
      travelDurationMinutes: e.travelDurationMinutes || null,
      travelDistanceText: e.travelDistanceText || null,
      travelOriginLocation: e.travelOriginLocation || null,
      travelAiSuggestion: e.travelAiSuggestion || null,
      travelTransitDetails: e.travelTransitDetails || null
    })),
    ...occurrences.map((o: any) => ({
      id: o.id,
      title: o.title,
      description: o.description || "",
      time: o.start.toISOString(),
      endTime: o.end.toISOString(),
      startzeitLocal: formatGermanTime(new Date(o.start)),
      endzeitLocal: formatGermanTime(new Date(o.end)),
      uhrzeit: o.isAllDay ? "Ganztägig" : `${formatGermanTime(new Date(o.start))} - ${formatGermanTime(new Date(o.end))} Uhr (deutsche Lokalzeit)`,
      isAllDay: o.isAllDay,
      recurring: true,
      occurrenceDate: o.originalOccurrenceDate.toISOString().split('T')[0],
      isCancelled: false,
      cancellationReason: null,
      originalStart: null,
      originalEnd: null,
      fuzzyTime: o.fuzzyTime,
      location: o.location || null,
      travelMode: null,
      travelDurationMinutes: null,
      travelDistanceText: null,
      travelOriginLocation: null,
      travelAiSuggestion: null,
      travelTransitDetails: null
    })),
    ...dbTasks.map((t: any) => {
      const d = t.due ? new Date(t.due) : null;
      const isAllDayTask = !d || (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getHours() === 0 && d.getMinutes() === 0);
      return {
        id: `task-${t.id}`,
        title: t.title,
        description: t.notes || "",
        time: t.due ? t.due.toISOString() : null,
        endTime: t.due ? t.due.toISOString() : null,
        faelligkeitLocal: d ? `${formatGermanDate(d)} um ${formatGermanTime(d)} Uhr (deutsche Zeit)` : undefined,
        isAllDay: isAllDayTask,
        isTask: true,
        completed: t.completed,
        recurring: t.recurrence !== null && t.recurrence !== "none",
        recurrence: t.recurrence,
        listTitle: t.listTitle,
        isPlanned: t.isPlanned,
        location: t.location ? t.location.name : null,
        locationId: t.locationId || null,
        locationObj: t.location ? {
          id: t.location.id,
          name: t.location.name,
          address: t.location.formattedAddress || t.location.address || t.location.name
        } : null,
        persons: (t.persons || []).map((tp: any) => ({
          id: tp.person.id,
          name: tp.person.aliases?.find((a: any) => a.isPrimary)?.name || tp.person.aliases?.[0]?.name || tp.person.name || "Person"
        })),
        media: (t.media || []).map((tm: any) => ({
          id: tm.media.id,
          title: tm.media.title,
          fileName: tm.media.fileName,
          filePath: tm.media.filePath,
          category: tm.media.category,
          fileType: tm.media.fileType
        })),
        isStarred: t.isStarred,
        status: t.status
      };
    }),
    ...birthdayEvents
  ];

  allEvents.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return matchPersonsForEvents(allEvents, prisma);
}

export async function getTimelineRangeData(startDate: Date, endDate: Date, prisma: any) {
  const sYear = startDate.getFullYear();
  const sMonth = startDate.getMonth();
  const sDay = startDate.getDate();

  const eYear = endDate.getFullYear();
  const eMonth = endDate.getMonth();
  const eDay = endDate.getDate();

  const localStart = new Date(sYear, sMonth, sDay, 0, 0, 0, 0);
  const localEnd = new Date(eYear, eMonth, eDay, 23, 59, 59, 999);

  const utcStart = new Date(Date.UTC(sYear, sMonth, sDay, 0, 0, 0, 0));
  const utcEnd = new Date(Date.UTC(eYear, eMonth, eDay, 23, 59, 59, 999));

  const startOfRange = localStart < utcStart ? localStart : utcStart;
  const endOfRange = localEnd > utcEnd ? localEnd : utcEnd;

  // 1. All calendar events & occurrences
  const matchedEvents = await getEventsForRange(startOfRange, endOfRange, prisma);

  // 2. All diary entries
  let diaryEntries: any[] = [];
  try {
    diaryEntries = await prisma.diaryEntry.findMany({
      where: {
        isDeleted: false,
        date: {
          gte: startOfRange,
          lte: endOfRange
        }
      },
      orderBy: { createdAt: "asc" }
    });
  } catch (e) {
    console.warn("Fehler beim Laden von Tagebucheinträgen für Timeline:", e);
  }

  // 3. All completed tasks
  let completedTasks: any[] = [];
  try {
    completedTasks = await prisma.task.findMany({
      where: {
        isDeleted: false,
        completed: true,
        completedAt: {
          gte: startOfRange,
          lte: endOfRange
        }
      },
      include: {
        location: true,
        persons: { include: { person: { include: { aliases: true } } } },
        media: { include: { media: true } }
      },
      orderBy: { completedAt: "asc" }
    });
  } catch (e) {
    console.warn("Fehler beim Laden erledigter Aufgaben für Timeline:", e);
  }

  // 4. Overdue tasks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  let uncompletedOverdueTasks: any[] = [];
  try {
    uncompletedOverdueTasks = await prisma.task.findMany({
      where: {
        completed: false,
        isDeleted: false,
        due: {
          lt: today
        }
      },
      include: {
        location: true,
        persons: { include: { person: { include: { aliases: true } } } },
        media: { include: { media: true } }
      },
      orderBy: { due: "asc" }
    });
  } catch (e) {
    console.warn("Fehler beim Laden überfälliger Aufgaben für Timeline:", e);
  }

  let completedOverdueTasksToday: any[] = [];
  try {
    completedOverdueTasksToday = await prisma.task.findMany({
      where: {
        completed: true,
        isDeleted: false,
        due: {
          lt: today
        },
        completedAt: {
          gte: today,
          lte: endOfToday
        }
      },
      include: {
        location: true,
        persons: { include: { person: { include: { aliases: true } } } },
        media: { include: { media: true } }
      },
      orderBy: { completedAt: "asc" }
    });
  } catch (e) {
    console.warn("Fehler beim Laden heute erledigter überfälliger Aufgaben:", e);
  }

  // Days map (ascending chronological order: past at top, future at bottom)
  const daysMap: { [key: string]: { date: string; displayDate: string; events: any[]; diaryEntries: any[]; completedTasks: any[] } } = {};

  let curr = new Date(startDate);
  curr.setHours(12, 0, 0, 0);
  const maxDate = new Date(endDate);
  maxDate.setHours(12, 0, 0, 0);

  while (curr <= maxDate) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    const weekday = curr.toLocaleDateString('de-DE', { weekday: 'short' }).replace(/\.$/, '');
    const dayAndMonth = curr.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    daysMap[key] = {
      date: key,
      displayDate: `${weekday}. ${dayAndMonth}`,
      events: [],
      diaryEntries: [],
      completedTasks: []
    };
    curr.setDate(curr.getDate() + 1);
  }

  // Populate events
  matchedEvents.forEach((ev: any) => {
    const eventTime = ev.start || ev.time;
    if (!eventTime) return;
    const d = new Date(eventTime);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    if (daysMap[key]) {
      daysMap[key].events.push(ev);
    } else {
      // Check if event spans into one of the requested days
      const evStart = new Date(eventTime);
      const evEnd = ev.endTime ? new Date(ev.endTime) : evStart;
      for (const dKey of Object.keys(daysMap)) {
        const parts = dKey.split('-').map(Number);
        const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
        const dayEnd = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
        if (evStart <= dayEnd && evEnd >= dayStart) {
          if (!daysMap[dKey].events.some((existing: any) => existing.id === ev.id)) {
            daysMap[dKey].events.push(ev);
          }
        }
      }
    }
  });

  // Populate diary entries
  diaryEntries.forEach((e: any) => {
    const d = new Date(e.date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    if (!daysMap[key]) return;
    daysMap[key].diaryEntries.push({
      id: e.id,
      title: e.title || "Tagebucheintrag",
      content: e.content,
      createdAt: e.createdAt
    });
  });

  // Populate completed tasks
  completedTasks.forEach((t: any) => {
    if (!t.completedAt) return;
    const d = new Date(t.completedAt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    if (!daysMap[key]) return;
    daysMap[key].completedTasks.push({
      id: t.id,
      title: t.title,
      notes: t.notes,
      completedAt: t.completedAt,
      listTitle: t.listTitle,
      due: t.due ? (t.due instanceof Date ? t.due.toISOString() : t.due) : null,
      recurrence: t.recurrence,
      status: t.status,
      completed: true
    });
  });

  const allOverdueToday = [
    ...uncompletedOverdueTasks.map((t: any) => ({ ...t, completed: false, completedAt: null })),
    ...completedOverdueTasksToday.map((t: any) => ({ ...t, completed: true }))
  ];

  const overdueMapped = allOverdueToday.map((t: any) => ({
    id: String(t.id),
    title: t.title,
    notes: t.notes || "",
    due: t.due ? (t.due instanceof Date ? t.due.toISOString() : t.due) : null,
    listTitle: t.listTitle,
    recurrence: t.recurrence,
    isTask: true,
    isOverdue: true,
    completed: !!t.completed,
    completedAt: t.completedAt ? (t.completedAt instanceof Date ? t.completedAt.toISOString() : t.completedAt) : null,
    projectId: t.projectId,
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
  }));

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (daysMap[todayKey]) {
    (daysMap[todayKey] as any).overdueTasks = overdueMapped;
  }

  const sortedKeys = Object.keys(daysMap).sort();
  return {
    days: sortedKeys.map(k => daysMap[k]),
    overdueTasks: overdueMapped
  };
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
        const baseD = parseFlexibleDate(args.datum) || new Date();
        const startOfDay = new Date(baseD);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(baseD);
        endOfDay.setHours(23, 59, 59, 999);

        const events = await getEventsForRange(startOfDay, endOfDay, prisma);

        return {
          type: "calendar_widget",
          date: args.datum,
          events: events.map(e => ({
            ...e,
            type: e.isBirthday ? "birthday" : "local"
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
            datum: { type: SchemaType.STRING, description: "Datum/Startzeit in deutscher Zeit (Europe/Berlin, z.B. 'YYYY-MM-DD', '16:00' oder 'YYYY-MM-DDTHH:mm:ss'). Niemals in UTC umrechnen und kein 'Z' anhängen." },
            enddatum: { type: SchemaType.STRING, description: "Enddatum/-uhrzeit in deutscher Zeit (Europe/Berlin, z.B. 'YYYY-MM-DD', '17:00' oder 'YYYY-MM-DDTHH:mm:ss') (optional). Niemals in UTC umrechnen und kein 'Z' anhängen." },
            beschreibung: { type: SchemaType.STRING, description: "Beschreibung (optional)" },
            ganztaegig: { type: SchemaType.BOOLEAN, description: "Ob der Termin ganztägig ist (optional)" },
            wiederkehrend: { type: SchemaType.BOOLEAN, description: "Ob der Termin sich wiederholt (optional)" },
            wiederholungsTyp: { type: SchemaType.STRING, description: "Typ der Wiederholung: 'DAILY', 'WEEKLY' oder 'MONTHLY' (optional)" },
            wiederholungsEnde: { type: SchemaType.STRING, description: "Enddatum der Wiederholung YYYY-MM-DD (optional)" },
            tageszeit: { type: SchemaType.STRING, description: "Uhrzeit-Abschnitt, falls nicht minutengenau: 'morgens', 'vormittag', 'mittags', 'nachmittag' oder 'abends' (optional)" },
            inPlanung: { type: SchemaType.BOOLEAN, description: "Ob der Termin noch in Planung ist (noch nicht fest terminiert, optional)" },
            standort: { type: SchemaType.STRING, description: "Standort/Adresse des Termins (z.B. 'Alexanderplatz 1, Berlin' oder 'Büro') für Routenplanung und Google Maps (optional)" },
            verkehrsmittel: { type: SchemaType.STRING, description: "Verkehrsmittel: 'transit' (Bahn), 'driving' (Auto), 'bicycling' (Fahrrad), 'walking' (Zu Fuß). Wenn angegeben, wird der Termin als vollwertige Wegzeit angelegt (optional)." },
            startort: { type: SchemaType.STRING, description: "Startort/Startadresse der Reise (optional, falls Wegzeit)" },
            ist_wegzeit: { type: SchemaType.BOOLEAN, description: "Ob dieser Termin eine eigenständige Wegzeit/Fahrtzeit ist (optional)" },
            locationId: { type: SchemaType.INTEGER, description: "Optionale ID des zugeordneten Ortes aus dem Locations-Plugin" },
            personIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Personen" },
            mediaIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Medien/Dokumente" }
          },
          required: ["titel", "datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        let start = parseFlexibleDate(args.datum) || new Date();
        let end = args.enddatum ? (parseFlexibleDate(args.enddatum) || new Date(start.getTime() + 60 * 60 * 1000)) : new Date(start.getTime() + 60 * 60 * 1000);

        const isRecurring = !!args.wiederkehrend;
        const recurrenceType = args.wiederholungsTyp || "WEEKLY";
        const recurrenceEnd = args.wiederholungsEnde ? new Date(args.wiederholungsEnde) : null;
        const isAllDay = !!args.ganztaegig;
        const fuzzyTime = args.tageszeit || null;
        const location = args.standort || args.ort || null;

        if (fuzzyTime) {
          const range = getFuzzyTimeRange(start, fuzzyTime);
          start = range.start;
          end = range.end;
        }

        let travelMode = args.verkehrsmittel || (args.ist_wegzeit ? "transit" : null);
        let travelDurationMinutes: number | null = null;
        let travelDistanceText: string | null = null;
        let travelOriginLocation = args.startort || null;
        let travelTransitDetails: any = null;

        // Automatische Erkennung von Wegzeiten / Fahrtzeiten anhand des Titels
        if (!travelMode && (
          args.ist_wegzeit ||
          /^(fahrt|wegzeit|anreise|abreise|hinfahrt|rückfahrt|rueckfahrt|reise|zugfahrt|heimweg)\b/i.test((args.titel || '').trim()) ||
          /[🚗🚆🚲🚶✈️🗺️]/.test(args.titel || '')
        )) {
          const t = (args.titel || '').toLowerCase();
          if (t.includes('auto') || t.includes('pkw') || t.includes('🚗')) {
            travelMode = 'driving';
          } else if (t.includes('rad') || t.includes('fahrrad') || t.includes('bike') || t.includes('🚲')) {
            travelMode = 'bicycling';
          } else if (t.includes('fuß') || t.includes('fuss') || t.includes('walk') || t.includes('🚶')) {
            travelMode = 'walking';
          } else {
            travelMode = 'transit'; // Standard: Bahn / ÖPNV
          }
        }

        if (travelMode && (location || travelOriginLocation)) {
          let orig = travelOriginLocation;
          let dest = location;

          if (!orig) {
            const prevEv = await prisma.event.findFirst({
              where: {
                isDeleted: false,
                isCancelled: false,
                end: { lte: start }
              },
              orderBy: { end: 'desc' }
            });
            if (prevEv && prevEv.location) {
              orig = prevEv.location;
              travelOriginLocation = orig;
            } else {
              const owner = await prisma.person.findFirst({
                where: { isOwner: true, isDeleted: false },
                include: {
                  locations: {
                    where: { location: { isDeleted: false } },
                    include: { location: true },
                    orderBy: { isPrimary: "desc" }
                  }
                }
              });
              if (owner && owner.locations.length > 0) {
                orig = owner.locations[0].location.formattedAddress || "Zuhause";
                travelOriginLocation = orig;
              }
            }
          }

          if (!dest && orig) {
            // Falls Zieladresse fehlt, aber Startadresse bekannt ist, prüfe ob es z. B. Heimweg ist
            const owner = await prisma.person.findFirst({
              where: { isOwner: true, isDeleted: false },
              include: {
                locations: {
                  where: { location: { isDeleted: false } },
                  include: { location: true },
                  orderBy: { isPrimary: "desc" }
                }
              }
            });
            if (owner && owner.locations.length > 0) {
              dest = owner.locations[0].location.formattedAddress || "Zuhause";
            }
          }

          if (orig && dest) {
            try {
              const isArrivalBound = /^(anreise|hinfahrt)\b/i.test((args.titel || '').trim());
              const initialStart = new Date(start);
              const route = await RouteService.calculateRoute(orig, dest, travelMode as TravelMode, prisma, {
                departureTime: isArrivalBound ? undefined : start,
                arrivalTime: isArrivalBound ? (args.enddatum ? end : start) : (args.enddatum ? end : undefined)
              });
              travelDurationMinutes = route.durationMinutes;
              travelDistanceText = route.distanceText;
              if (route.transitDetails?.departureDateTime) {
                start = new Date(route.journeyStartDateTime || route.transitDetails.journeyStartDateTime || route.transitDetails.departureDateTime);
              }
              if (route.transitDetails?.arrivalDateTime) {
                end = new Date(route.journeyEndDateTime || route.transitDetails.journeyEndDateTime || route.transitDetails.arrivalDateTime);
              } else if (travelDurationMinutes && !args.enddatum) {
                end = new Date(start.getTime() + travelDurationMinutes * 60000);
              }
              travelTransitDetails = {
                ...(route.transitDetails || {}),
                earliestDepartureTime: initialStart.toISOString(),
                requestedDepartureTime: initialStart.toISOString(),
                bufferBeforeMinutes: Math.round((start.getTime() - initialStart.getTime()) / 60000)
              };
            } catch (rErr) {
              console.warn("Konnte Route für Wegzeit-Termin nicht berechnen:", rErr);
            }
          }
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
                fuzzyTime,
                location
              }
            });
          } else {
            const createdEv = await prisma.event.create({
              data: {
                title: args.titel,
                description: args.beschreibung || null,
                start,
                end,
                isAllDay,
                fuzzyTime,
                isPlanned: !!args.inPlanung,
                location,
                locationId: args.locationId ? Number(args.locationId) : null,
                travelMode,
                travelDurationMinutes,
                travelDistanceText,
                travelOriginLocation,
                travelTransitDetails
              }
            });

            if (args.personIds) {
              const pIds = Array.isArray(args.personIds) ? args.personIds : String(args.personIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
              for (const pid of pIds) {
                await prisma.eventPerson.create({ data: { eventId: createdEv.id, personId: Number(pid) } }).catch(() => {});
              }
            }

            if (args.mediaIds) {
              const mIds = Array.isArray(args.mediaIds) ? args.mediaIds : String(args.mediaIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
              for (const mid of mIds) {
                await prisma.mediaEvent.create({ data: { eventId: createdEv.id, mediaId: Number(mid) } }).catch(() => {});
              }
            }
          }

          const startOfDay = new Date(start);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(start);
          endOfDay.setHours(23, 59, 59, 999);

          const events = await getEventsForRange(startOfDay, endOfDay, prisma);

          return { 
            type: "calendar_widget",
            date: args.datum.split('T')[0],
            message: `Termin '${args.titel}' wurde erstellt.`,
            events: events.map(e => ({
              ...e,
              type: e.isBirthday ? "birthday" : "local"
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
            terminId: { type: SchemaType.STRING, description: "Alternative Bezeichnung für eventId (optional)" },
            datum: { type: SchemaType.STRING, description: "Das Datum des Termins (YYYY-MM-DD) (optional)" },
            nurDiesesVorkommen: { type: SchemaType.BOOLEAN, description: "Wenn true, wird nur dieses eine Vorkommen storniert/gelöscht." }
          }
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          const rawId = String(args.eventId || args.terminId || "").trim();
          if (!rawId) {
            return { status: "error", message: "Termin-ID fehlt." };
          }
          let cleanId = rawId;
          if (cleanId.startsWith('app://event/')) cleanId = cleanId.replace('app://event/', '');
          if (cleanId.startsWith('event-')) cleanId = cleanId.replace('event-', '');

          let id: number | null = null;
          let recurrenceId: number | null = null;
          let originalOccurrenceDate: Date | null = null;

          if (cleanId.startsWith('rec-')) {
            const parts = cleanId.split('-');
            recurrenceId = Number(parts[1]);
            originalOccurrenceDate = new Date(Number(parts[2]));
          } else if (/^\d+$/.test(cleanId)) {
            id = Number(cleanId);
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
              await prisma.event.updateMany({
                where: { id },
                data: { isDeleted: true }
              });
            }
          } else {
            // Delete entire series or the one-off event
            if (recurrenceId) {
              await prisma.recurrencePattern.updateMany({
                where: { id: recurrenceId },
                data: { isDeleted: true }
              });
            } else if (id) {
              await prisma.event.updateMany({
                where: { id },
                data: { isDeleted: true }
              });
            }
          }

          const dateStr = args.datum || (originalOccurrenceDate ? originalOccurrenceDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
          const startOfDay = new Date(dateStr);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(dateStr);
          endOfDay.setHours(23, 59, 59, 999);

          const events = await getEventsForRange(startOfDay, endOfDay, prisma);

          return { 
            type: "calendar_widget",
            date: dateStr,
            message: `Termin wurde gelöscht.`,
            events: events.map(e => ({
              ...e,
              type: e.isBirthday ? "birthday" : "local"
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
        description: "Bearbeitet einen Termin oder eine Wegzeit. Kann Verschiebungen (auch für einzelne Vorkommen), Ausfälle (ausgefallen=true mit Grund), Verkehrsmittelwechsel oder Löschungen steuern.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            eventId: { type: SchemaType.STRING, description: "Die ID des Termins" },
            terminId: { type: SchemaType.STRING, description: "Alternative Bezeichnung für eventId (optional)" },
            datum: { type: SchemaType.STRING, description: "Das Datum des Termins (YYYY-MM-DD) (optional)" },
            nurDiesesVorkommen: { type: SchemaType.BOOLEAN, description: "Wenn true, wird nur dieses eine Vorkommen geändert." },
            neuer_titel: { type: SchemaType.STRING, description: "Neuer Titel (optional)" },
            neues_datum: { type: SchemaType.STRING, description: "Neues Startdatum/Uhrzeit in deutscher Zeit (Europe/Berlin, z.B. '16:00' oder 'YYYY-MM-DDTHH:mm:ss') (optional). Niemals in UTC umrechnen und kein 'Z' anhängen." },
            neues_enddatum: { type: SchemaType.STRING, description: "Neues Enddatum/Uhrzeit in deutscher Zeit (Europe/Berlin, z.B. '17:00' oder 'YYYY-MM-DDTHH:mm:ss') (optional). Niemals in UTC umrechnen und kein 'Z' anhängen." },
            neue_beschreibung: { type: SchemaType.STRING, description: "Neue Beschreibung (optional)" },
            ganztaegig: { type: SchemaType.BOOLEAN, description: "Ob der Termin ganztägig ist (optional)" },
            ausgefallen: { type: SchemaType.BOOLEAN, description: "Ob das Event ausfällt (optional)" },
            ausfallGrund: { type: SchemaType.STRING, description: "Grund für den Ausfall (optional)" },
            geloescht: { type: SchemaType.BOOLEAN, description: "Ob der Termin an diesem Tag gelöscht werden soll (optional)" },
            tageszeit: { type: SchemaType.STRING, description: "Uhrzeit-Abschnitt, falls nicht minutengenau: 'morgens', 'vormittag', 'mittags', 'nachmittag' oder 'abends' (optional)" },
            inPlanung: { type: SchemaType.BOOLEAN, description: "Ob der Termin noch in Planung ist (optional)" },
            standort: { type: SchemaType.STRING, description: "Neuer Standort/Ort des Termins (optional)" },
            verkehrsmittel: { type: SchemaType.STRING, description: "Neues Verkehrsmittel: 'driving', 'transit', 'bicycling', 'walking' (optional)" },
            startort: { type: SchemaType.STRING, description: "Startort/Startadresse der Reise (optional)" },
            locationId: { type: SchemaType.INTEGER, description: "Optionale ID des zugeordneten Ortes aus dem Locations-Plugin" },
            personIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Personen" },
            mediaIds: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER }, description: "Optionale IDs zugeordneter Medien/Dokumente" }
          },
          required: ["eventId"]
        } as any
      },
      handler: async (args, { prisma }) => {
        try {
          const rawId = String(args.eventId || args.terminId || "");
          if (!rawId) {
            return { status: "error", message: "Termin-ID fehlt." };
          }
          let id: number | null = null;
          let recurrenceId: number | null = null;
          let originalOccurrenceDate: Date | null = null;

          if (rawId.startsWith('rec-')) {
            const parts = rawId.split('-');
            recurrenceId = Number(parts[1]);
            originalOccurrenceDate = new Date(Number(parts[2]));
          } else {
            id = Number(rawId);
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
              if (args.inPlanung !== undefined) data.isPlanned = !!args.inPlanung;
              if (args.standort !== undefined) {
                data.location = args.standort === "" ? null : args.standort;
              }
              if (args.locationId !== undefined) {
                data.locationId = (args.locationId === "null" || args.locationId === null || args.locationId === "") ? null : Number(args.locationId);
              }

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? (parseFlexibleDate(args.neues_datum) || (existingOverride ? existingOverride.start : originalOccurrenceDate)) : (existingOverride ? existingOverride.start : originalOccurrenceDate);
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.start = range.start;
                  data.end = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                const parsedNewDate = parseFlexibleDate(args.neues_datum);
                if (parsedNewDate) {
                  data.start = parsedNewDate;
                  const parsedNewEnd = parseFlexibleDate(args.neues_enddatum);
                  const duration = parsedNewEnd ? (parsedNewEnd.getTime() - data.start.getTime()) : (60 * 60 * 1000);
                  data.end = new Date(data.start.getTime() + duration);
                  
                  data.originalStart = originalOccurrenceDate;
                  if (pattern) {
                    const patternDuration = pattern.originalEnd.getTime() - pattern.originalStart.getTime();
                    data.originalEnd = new Date(originalOccurrenceDate.getTime() + patternDuration);
                  }
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
              if (args.inPlanung !== undefined) data.isPlanned = !!args.inPlanung;
              if (args.standort !== undefined) {
                data.location = args.standort === "" ? null : args.standort;
              }

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? (parseFlexibleDate(args.neues_datum) || (currentEvent ? currentEvent.start : new Date())) : (currentEvent ? currentEvent.start : new Date());
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.start = range.start;
                  data.end = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                const parsedNewDate = parseFlexibleDate(args.neues_datum);
                if (parsedNewDate) {
                  if (currentEvent) {
                    data.originalStart = currentEvent.start;
                    data.originalEnd = currentEvent.end;
                  }
                  data.start = parsedNewDate;
                  const parsedNewEnd = parseFlexibleDate(args.neues_enddatum);
                  const duration = parsedNewEnd ? (parsedNewEnd.getTime() - data.start.getTime()) : (60 * 60 * 1000);
                  data.end = new Date(data.start.getTime() + duration);
                }
              }

              await prisma.event.update({
                where: { id },
                data
              });

              if (args.personIds !== undefined) {
                await (prisma as any).eventPerson.deleteMany({ where: { eventId: id } });
                if (args.personIds && args.personIds !== "null") {
                  const pIds = Array.isArray(args.personIds) ? args.personIds : String(args.personIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
                  for (const pid of pIds) {
                    await (prisma as any).eventPerson.create({ data: { eventId: id, personId: Number(pid) } }).catch(() => {});
                  }
                }
              }

              if (args.mediaIds !== undefined) {
                await (prisma as any).mediaEvent.deleteMany({ where: { eventId: id } });
                if (args.mediaIds && args.mediaIds !== "null") {
                  const mIds = Array.isArray(args.mediaIds) ? args.mediaIds : String(args.mediaIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
                  for (const mid of mIds) {
                    await (prisma as any).mediaEvent.create({ data: { eventId: id, mediaId: Number(mid) } }).catch(() => {});
                  }
                }
              }
            }
          } else {
            // Edit entire series or one-off
            if (recurrenceId) {
              const data: any = {};
              if (args.neuer_titel !== undefined) data.title = args.neuer_titel;
              if (args.neue_beschreibung !== undefined) data.description = args.neue_beschreibung;
              if (args.ganztaegig !== undefined) data.isAllDay = !!args.ganztaegig;
              if (args.standort !== undefined) {
                data.location = args.standort === "" ? null : args.standort;
              }

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? (parseFlexibleDate(args.neues_datum) || (pattern ? pattern.originalStart : new Date())) : (pattern ? pattern.originalStart : new Date());
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.originalStart = range.start;
                  data.originalEnd = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                const parsedNewDate = parseFlexibleDate(args.neues_datum);
                if (parsedNewDate) {
                  data.originalStart = parsedNewDate;
                  const parsedNewEnd = parseFlexibleDate(args.neues_enddatum);
                  const duration = parsedNewEnd ? (parsedNewEnd.getTime() - data.originalStart.getTime()) : (60 * 60 * 1000);
                  data.originalEnd = new Date(data.originalStart.getTime() + duration);
                }
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
              if (args.inPlanung !== undefined) data.isPlanned = !!args.inPlanung;
              if (args.standort !== undefined) {
                data.location = args.standort === "" ? null : args.standort;
              }

              if (args.tageszeit !== undefined) {
                const fuzzyVal = args.tageszeit === "" ? null : args.tageszeit;
                data.fuzzyTime = fuzzyVal;
                if (fuzzyVal) {
                  const baseDate = args.neues_datum ? (parseFlexibleDate(args.neues_datum) || (currentEvent ? currentEvent.start : new Date())) : (currentEvent ? currentEvent.start : new Date());
                  const range = getFuzzyTimeRange(baseDate, fuzzyVal);
                  data.start = range.start;
                  data.end = range.end;
                } else {
                  data.fuzzyTime = null;
                }
              } else if (args.neues_datum) {
                const parsedNewDate = parseFlexibleDate(args.neues_datum);
                if (parsedNewDate) {
                  if (currentEvent) {
                    data.originalStart = currentEvent.start;
                    data.originalEnd = currentEvent.end;
                  }
                  data.start = parsedNewDate;
                  const parsedNewEnd = parseFlexibleDate(args.neues_enddatum);
                  const duration = parsedNewEnd ? (parsedNewEnd.getTime() - data.start.getTime()) : (60 * 60 * 1000);
                  data.end = new Date(data.start.getTime() + duration);
                }
              }

              if (args.verkehrsmittel !== undefined) {
                data.travelMode = args.verkehrsmittel === "" ? null : args.verkehrsmittel;
              }
              if (args.startort !== undefined) {
                data.travelOriginLocation = args.startort === "" ? null : args.startort;
              }

              const effMode = (data.travelMode !== undefined ? data.travelMode : currentEvent?.travelMode) as TravelMode | null;
              const effDest = data.location !== undefined ? data.location : currentEvent?.location;
              const effOrig = data.travelOriginLocation !== undefined ? data.travelOriginLocation : currentEvent?.travelOriginLocation;

              if (effMode && effDest && effOrig && (args.verkehrsmittel !== undefined || args.standort !== undefined || args.startort !== undefined)) {
                try {
                  const existingDet = (currentEvent?.travelTransitDetails as any) || {};
                  const baseEarly = data.start ? data.start : (existingDet.earliestDepartureTime ? new Date(existingDet.earliestDepartureTime) : currentEvent?.start);
                  const route = await RouteService.calculateRoute(effOrig, effDest, effMode, prisma, {
                    departureTime: baseEarly || currentEvent?.start,
                    arrivalTime: data.end || currentEvent?.end
                  });
                  data.travelDurationMinutes = route.durationMinutes;
                  data.travelDistanceText = route.distanceText;
                  const transitDep = route.journeyStartDateTime || route.transitDetails?.journeyStartDateTime || route.transitDetails?.departureDateTime;
                  const transitArr = route.journeyEndDateTime || route.transitDetails?.journeyEndDateTime || route.transitDetails?.arrivalDateTime;
                  if (effMode === "transit" && transitDep) {
                    data.start = new Date(transitDep);
                  } else if (baseEarly) {
                    data.start = baseEarly;
                  }
                  if (effMode === "transit" && transitArr) {
                    data.end = new Date(transitArr);
                  } else if (route.durationMinutes && data.start && !args.neues_enddatum) {
                    data.end = new Date(data.start.getTime() + route.durationMinutes * 60000);
                  }
                  data.travelTransitDetails = {
                    ...(route.transitDetails || {}),
                    earliestDepartureTime: baseEarly ? baseEarly.toISOString() : undefined,
                    requestedDepartureTime: existingDet.requestedDepartureTime || (baseEarly ? baseEarly.toISOString() : undefined),
                    bufferBeforeMinutes: (baseEarly && data.start && data.start.getTime() > baseEarly.getTime())
                      ? Math.round((data.start.getTime() - baseEarly.getTime()) / 60000)
                      : 0
                  };
                } catch (rErr) {
                  console.warn("Konnte Route bei bearbeite_termin nicht neu berechnen:", rErr);
                }
              }

              await prisma.event.update({
                where: { id },
                data
              });
            }
          }

          const targetDate = args.neues_datum || args.datum || (originalOccurrenceDate ? originalOccurrenceDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
          const startOfDay = new Date(targetDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(targetDate);
          endOfDay.setHours(23, 59, 59, 999);

          const events = await getEventsForRange(startOfDay, endOfDay, prisma);

          return { 
            type: "calendar_widget",
            date: targetDate.split('T')[0],
            message: `Termin wurde aktualisiert.`,
            events: events.map(e => ({
              ...e,
              type: e.isBirthday ? "birthday" : "local"
            }))
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Bearbeiten: ${e.message}` };
        }
      }
    }
  ],
  getTopWidgets: async ({ prisma }: { prisma: any }) => {
    try {
      const today = new Date();
      today.setHours(12, 0, 0, 0);

      const pastDays = new Date(today);
      pastDays.setDate(today.getDate() - 5);
      pastDays.setHours(0, 0, 0, 0);

      const futureDays = new Date(today);
      futureDays.setDate(today.getDate() + 14);
      futureDays.setHours(23, 59, 59, 999);

      const timelineData = await getTimelineRangeData(pastDays, futureDays, prisma);

      return [
        {
          pluginName: "Calendar",
          type: "calendar_overview",
          data: {
            timeline: timelineData.days,
            overdueTasks: timelineData.overdueTasks,
            initialPastDate: pastDays.toISOString().split('T')[0],
            initialFutureDate: futureDays.toISOString().split('T')[0]
          }
        }
      ];
    } catch (e) {
      console.error("Fehler beim Laden des Kalender-Widgets:", e);
      return [];
    }
  },
  entityConfig: {
    type: "event",
    prefix: "app://event/",
    color: "rgba(137, 180, 250, 0.15)",
    borderColor: "#89b4fa",
    icon: "📅",
    displayName: "Termin"
  },
  resolveEntity: async (id: number | string, { prisma }) => {
    const rawId = String(id || '');
    if (rawId.startsWith('rec-')) {
      const parts = rawId.split('-');
      const patternId = Number(parts[1]);
      const occTimestamp = Number(parts[2]);
      const occDate = new Date(occTimestamp);
      const pattern = await prisma.recurrencePattern.findUnique({ where: { id: patternId } });
      if (pattern) {
        const dur = new Date(pattern.originalEnd).getTime() - new Date(pattern.originalStart).getTime();
        return {
          id: rawId,
          title: pattern.title,
          description: pattern.description,
          start: occDate,
          end: new Date(occTimestamp + dur),
          isAllDay: pattern.isAllDay,
          location: pattern.location,
          isRecurring: true
        };
      }
    }
    const cleanId = rawId.replace(/^event-/, '').replace(/^app:\/\/event\//, '');
    const numId = Number(cleanId);
    if (!isNaN(numId)) {
      return prisma.event.findUnique({
        where: { id: numId },
        include: {
          locationRef: true,
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
    }
    return null;
  }
};
