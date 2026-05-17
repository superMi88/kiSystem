import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
);

export class GoogleCalendarService {
  constructor(private prisma: PrismaClient) {}

  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/tasks'
    ];
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  async saveTokens(code: string) {
    const { tokens } = await oauth2Client.getToken(code);
    await this.prisma.googleAuth.upsert({
      where: { id: 1 },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiryDate: BigInt(tokens.expiry_date!)
      },
      create: {
        id: 1,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiryDate: BigInt(tokens.expiry_date!)
      }
    });
    return tokens;
  }

  private async getAuthenticatedClient() {
    const authRecord = await this.prisma.googleAuth.findUnique({ where: { id: 1 } });
    if (!authRecord) return null;

    oauth2Client.setCredentials({
      access_token: authRecord.accessToken,
      refresh_token: authRecord.refreshToken,
      expiry_date: Number(authRecord.expiryDate)
    });
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  private async getAuthenticatedTasksClient() {
    const authRecord = await this.prisma.googleAuth.findUnique({ where: { id: 1 } });
    if (!authRecord) return null;

    oauth2Client.setCredentials({
      access_token: authRecord.accessToken,
      refresh_token: authRecord.refreshToken,
      expiry_date: Number(authRecord.expiryDate)
    });
    return google.tasks({ version: 'v1', auth: oauth2Client });
  }

  async getEvents(date: Date, endDate?: Date) {
    const calendar = await this.getAuthenticatedClient();
    if (!calendar) return null;
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate) : new Date(date);
    end.setHours(23, 59, 59, 999);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return res.data.items || [];
  }

  async getIncompleteTasks() {
    try {
      const tasksClient = await this.getAuthenticatedTasksClient();
      if (!tasksClient) return [];

      const taskLists = await tasksClient.tasklists.list();
      const lists = taskLists.data.items || [];
      const allTasks = [];

      for (const list of lists) {
        if (!list.id) continue;
        const res = await tasksClient.tasks.list({
          tasklist: list.id,
          showCompleted: false,
          showHidden: false
        });
        const items = res.data.items || [];
        allTasks.push(...items.filter(t => t.status === 'needsAction'));
      }
      return allTasks;
    } catch (e: any) {
      console.warn(`Konnte Aufgaben nicht abrufen (Möglicherweise fehlt die Berechtigung): ${e.message}`);
      if (e.message && e.message.includes('insufficient authentication scopes')) {
        console.log('Lösche veraltete Tokens, um Neu-Authentifizierung zu erzwingen...');
        await this.prisma.googleAuth.delete({ where: { id: 1 } }).catch(() => {});
      }
      return [];
    }
  }

  async createEvent(title: string, date: Date, description?: string) {
    const calendar = await this.getAuthenticatedClient();
    if (!calendar) return null;

    const start = new Date(date);
    const end = new Date(date);
    // Wenn keine Uhrzeit angegeben ist (nur Datum), setzen wir es auf 12:00
    if (start.getHours() === 0 && start.getMinutes() === 0) {
      start.setHours(12, 0, 0, 0);
      end.setHours(13, 0, 0, 0);
    } else {
      end.setHours(start.getHours() + 1);
    }

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description: description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });

    return res.data;
  }

  async deleteEvent(eventId: string) {
    const calendar = await this.getAuthenticatedClient();
    if (!calendar) return null;

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    return true;
  }

  async updateEvent(eventId: string, updates: { title?: string, date?: Date, description?: string }) {
    const calendar = await this.getAuthenticatedClient();
    if (!calendar) return null;

    const requestBody: any = {};
    if (updates.title) requestBody.summary = updates.title;
    if (updates.description) requestBody.description = updates.description;
    if (updates.date) {
      const start = new Date(updates.date);
      const end = new Date(updates.date);
      end.setHours(end.getHours() + 1);
      requestBody.start = { dateTime: start.toISOString() };
      requestBody.end = { dateTime: end.toISOString() };
    }

    const res = await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: requestBody,
    });

    return res.data;
  }
}
