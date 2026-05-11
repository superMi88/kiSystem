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
        const date = new Date(args.datum);
        const service = new GoogleCalendarService(prisma);
        
        // 1. Lokale Termine
        const localEvents = await prisma.calendarEvent.findMany({
          where: {
            date: {
              gte: new Date(date.setHours(0,0,0,0)),
              lte: new Date(date.setHours(23,59,59,999))
            }
          }
        });

        // 2. Google Termine
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
            ...localEvents.map(e => ({ title: e.title, time: e.date, type: "local" })),
            ...googleEvents.map(e => ({ 
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
        
        // Versuche Uhrzeit aus Beschreibung zu extrahieren (z.B. "15:00")
        if (args.beschreibung) {
          const timeMatch = args.beschreibung.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
          }
        }

        // 1. Google Synchronisation
        const service = new GoogleCalendarService(prisma);
        try {
          const googleEvent = await service.createEvent(args.titel, date, args.beschreibung);
          if (googleEvent) {
            return { 
              status: "success", 
              message: `Termin '${args.titel}' wurde erfolgreich im Google Kalender erstellt.` 
            };
          }
        } catch (e: any) {
          console.error("Google Sync Fehler:", e);
          return { 
            status: "error", 
            message: `Fehler beim Speichern im Google Kalender: ${e.message}` 
          };
        }

        return { 
          status: "error", 
          message: "Konnte den Termin nicht erstellen. Hast du den Google Kalender verbunden?" 
        };
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
  }
};

