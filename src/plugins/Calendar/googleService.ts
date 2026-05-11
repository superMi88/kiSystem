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
    const scopes = ['https://www.googleapis.com/auth/calendar.readonly'];
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

  async getEvents(date: Date) {
    const authRecord = await this.prisma.googleAuth.findUnique({ where: { id: 1 } });
    if (!authRecord) return null;

    oauth2Client.setCredentials({
      access_token: authRecord.accessToken,
      refresh_token: authRecord.refreshToken,
      expiry_date: Number(authRecord.expiryDate)
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return res.data.items || [];
  }
}
