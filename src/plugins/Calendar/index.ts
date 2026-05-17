import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import { GoogleCalendarService } from "./googleService.js";

export const calendarPlugin: Plugin = {
  name: "Calendar",
  description: "Verwaltet lokale Termine und synchronisiert mit Google Calendar.",
  tools: [
    {
      definition: {
        name: "verbinde_google_kalender",
        description: "Generiert einen Link, um das System mit deinem Google Kalender zu verbinden.",
      },
      handler: async (_, { prisma }) => {
        const service = new GoogleCalendarService(prisma);
        const url = service.getAuthUrl();
        return { 
          status: "auth_required", 
          message: "Klicke auf den Link, um deinen Google Kalender zu verbinden.",
          url 
        };
      }
    },
    {
      definition: {
        name: "was_steht_an",
        description: "Zeigt alle Termine für einen bestimmten Tag an (Lokale & Google Termine).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            datum: { type: SchemaType.STRING, description: "Das Datum im Format YYYY-MM-DD" }
          },
          required: ["datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        // Nur noch Google Termine abfragen
        const service = new GoogleCalendarService(prisma);
        let googleEvents: any[] = [];
        try {
          googleEvents = await service.getEvents(new Date(args.datum)) || [];
        } catch (e) {
          console.error("Google Calendar Fehler:", e);
        }

        // Rückgabe als spezielles "Widget" Format
        return {
          type: "calendar_widget",
          date: args.datum,
          events: [
            ...googleEvents.map(e => ({ 
              id: e.id, // ID für die KI mitsenden
              title: e.summary, 
              time: e.start?.dateTime || e.start?.date, 
              type: "google" 
            }))
          ]
        };
      }
    },
    {
      definition: {
        name: "fuege_termin_hinzu",
        description: "Fügt einen neuen Termin hinzu und synchronisiert ihn mit Google Calendar.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            titel: { type: SchemaType.STRING, description: "Titel des Termins" },
            datum: { type: SchemaType.STRING, description: "Datum (YYYY-MM-DD) oder ISO-String" },
            beschreibung: { type: SchemaType.STRING, description: "Beschreibung (optional, kann Uhrzeit enthalten)" }
          },
          required: ["titel", "datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const date = new Date(args.datum);
        const service = new GoogleCalendarService(prisma);

        try {
          await service.createEvent(args.titel, date, args.beschreibung);
          // Hole sofort die aktualisierte Liste für das Widget
          const updatedEvents = await service.getEvents(date) || [];
          return { 
            type: "calendar_widget",
            date: args.datum.split('T')[0],
            message: `Termin '${args.titel}' wurde erstellt.`,
            events: updatedEvents.map(e => ({ id: e.id, title: e.summary, time: e.start?.dateTime || e.start?.date, type: "google" }))
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "loesche_termin",
        description: "Löscht einen Termin aus dem Google Kalender.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            eventId: { type: SchemaType.STRING, description: "Die eindeutige ID des Google-Termins" },
            datum: { type: SchemaType.STRING, description: "Das Datum des Termins (YYYY-MM-DD), um die Liste zu aktualisieren" }
          },
          required: ["eventId", "datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const service = new GoogleCalendarService(prisma);
        try {
          await service.deleteEvent(args.eventId);
          // Kurz warten, damit Google Zeit zum Löschen hat
          await new Promise(resolve => setTimeout(resolve, 500));
          const updatedEvents = await service.getEvents(new Date(args.datum)) || [];
          return { 
            type: "calendar_widget",
            date: args.datum,
            message: `Termin wurde gelöscht.`,
            events: updatedEvents.map(e => ({ id: e.id, title: e.summary, time: e.start?.dateTime || e.start?.date, type: "google" }))
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Löschen: ${e.message}` };
        }
      }
    },
    {
      definition: {
        name: "bearbeite_termin",
        description: "Bearbeitet einen bestehenden Termin im Google Kalender.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            eventId: { type: SchemaType.STRING, description: "Die ID des zu bearbeitenden Termins" },
            datum: { type: SchemaType.STRING, description: "Das aktuelle Datum des Termins (YYYY-MM-DD)" },
            neuer_titel: { type: SchemaType.STRING, description: "Neuer Titel (optional)" },
            neues_datum: { type: SchemaType.STRING, description: "Neues Datum/Uhrzeit im ISO-Format (optional)" },
            neue_beschreibung: { type: SchemaType.STRING, description: "Neue Beschreibung (optional)" }
          },
          required: ["eventId", "datum"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const service = new GoogleCalendarService(prisma);
        try {
          const updates: any = {};
          if (args.neuer_titel) updates.title = args.neuer_titel;
          if (args.neue_beschreibung) updates.description = args.neue_beschreibung;
          if (args.neues_datum) updates.date = new Date(args.neues_datum);

          await service.updateEvent(args.eventId, updates);
          // Kurz warten für Google
          await new Promise(resolve => setTimeout(resolve, 500));
          const updatedEvents = await service.getEvents(new Date(args.neues_datum || args.datum)) || [];
          return { 
            type: "calendar_widget",
            date: (args.neues_datum || args.datum).split('T')[0],
            message: `Termin wurde aktualisiert.`,
            events: updatedEvents.map(e => ({ id: e.id, title: e.summary, time: e.start?.dateTime || e.start?.date, type: "google" }))
          };
        } catch (e: any) {
          return { status: "error", message: `Fehler beim Bearbeiten: ${e.message}` };
        }
      }
    }
  ],
  getAlerts: async ({ prisma }) => {
    const auth = await prisma.googleAuth.findUnique({ where: { id: 1 } });
    if (!auth) {
      const service = new GoogleCalendarService(prisma);
      return [{
        id: "google-calendar-auth",
        type: "auth",
        message: "Google Kalender ist nicht verbunden.",
        actionLabel: "Verbinden",
        actionUrl: service.getAuthUrl()
      }];
    }
    return [];
  },
  getTopWidgets: async ({ prisma }) => {
    const auth = await prisma.googleAuth.findUnique({ where: { id: 1 } });
    if (!auth) return [];

    const service = new GoogleCalendarService(prisma);
    const today = new Date();
    const inThreeDays = new Date();
    inThreeDays.setDate(today.getDate() + 3);

    let events: any[] = [];
    let tasks: any[] = [];

    try {
      events = await service.getEvents(today, inThreeDays) || [];
      tasks = await service.getIncompleteTasks() || [];
    } catch (e) {
      console.warn("Fehler beim Abrufen von Kalender-Widget-Daten:", e);
    }

    return [
      {
        pluginName: "Calendar",
        type: "calendar_overview",
        data: {
          events: events.map(e => ({
            id: e.id,
            title: e.summary,
            time: e.start?.dateTime || e.start?.date
          })),
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            due: t.due
          }))
        }
      }
    ];
  }
};

