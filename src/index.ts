process.env.TZ = process.env.TZ || "Europe/Berlin";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI, SchemaType, FunctionCallingMode } from "@google/generative-ai";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { exec } from "child_process";
import os from "os";

import { PluginManager } from "./plugins/index.js";
import { getSettings, saveSettings, AVAILABLE_TRIGGERS, saveAgentConfig, deleteAgentConfig, toggleAgentStatus } from "./settings.js";
import { runAutomaticMigration } from "./migrate.js";
import { getEventsForRange, getTimelineRangeData } from "./plugins/Calendar/index.js";
import { calculateNextDueDate } from "./plugins/Tasks/index.js";
import { syncProjectStates, attachProjectStatesToProjects, ensureProjectStateSchema } from "./plugins/Projects/index.js";
import { getDaySummaryData, getRangeSummaryData, parseLocalDate } from "./plugins/Journal/index.js";
import { MailService } from "./plugins/Mail/service.js";
import { runTrainTripMonitor } from "./plugins/Mail/dbBahnService.js";
import { createDynamicToolsRouter } from "./routes/dynamicToolsRouter.js";
import { AgentRunService } from "./services/agentRunService.js";
import { RouteService, TravelMode, getGermanTimeContext, formatGermanDate, formatGermanTime } from "./services/routeService.js";
import { buildFormattedAddress, getPersonsForLocation } from "./plugins/Locations/index.js";
import { formatMediaItem, formatFileSize } from "./plugins/Media/index.js";
import multer from "multer";
import fs from "fs";
import path from "path";

dotenv.config();

process.on("unhandledRejection", (reason, promise) => {
  console.warn("[Process] Abgefangene unhandledRejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Process] Abgefangene uncaughtException:", error);
});

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    cb(null, `${base}_${uniqueSuffix}${ext}`);
  }
});
const upload = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const pluginManager = new PluginManager(prisma);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Dynamische Tools API-Endpunkte
app.use("/api/tools", createDynamicToolsRouter(pluginManager.dynamicTools, pluginManager));

const server = new Server(
  { name: "ki-system-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: pluginManager.getMCPTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await pluginManager.executeTool(name, args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: `Fehler: ${(error as Error).message}` }] };
  }
});

let transport: SSEServerTransport | null = null;
// ... (rest of the express setup remains similar, but the chat loop needs update)


app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

/**
 * Conversations API
 */
app.get("/conversations", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const where: any = {};
    if (type === 'agent_run') {
      where.isAgentRun = true;
    } else if (type === 'chat') {
      where.isAgentRun = false;
    }

    try {
      const conversations = await prisma.conversation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          notifications: {
            where: { isDismissed: false },
            select: { id: true, type: true, isDismissed: true }
          }
        }
      });
      return res.json(conversations);
    } catch (innerErr) {
      const fallbackConversations = await prisma.conversation.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return res.json(fallbackConversations);
    }
  } catch (e: any) {
    console.error("[Conversations API] Fehler beim Laden des Verlaufs:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/conversations/:id", async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (e: any) {
    console.error("[Conversations API] Fehler beim Laden der Nachrichten:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/conversations/:id/meta", async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id }
    });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation nicht gefunden" });
    }
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    let notifications: any[] = [];
    try {
      notifications = await prisma.agentNotification.findMany({
        where: { conversationId: req.params.id },
        orderBy: { createdAt: 'asc' }
      });
    } catch (_) { }
    res.json({ conversation, messages, notifications });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Agent Runs API
 */
app.get("/api/agent-runs", async (req, res) => {
  try {
    const triggerType = req.query.triggerType as string | undefined;
    const status = req.query.status as string | undefined;
    const runs = await AgentRunService.getAgentRuns(prisma, { triggerType, status });
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/agent-runs/mail/:id", async (req, res) => {
  try {
    const emailId = Number(req.params.id);
    const run = await AgentRunService.getAgentRunForEmail(emailId, prisma);
    res.json({ agentRun: run });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agent-runs/discord", async (req, res) => {
  try {
    const { content, author, guild, channel, messageId, conversationId } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Parameter 'content' ist erforderlich." });
    }
    console.log(`[API] Trigger Discord Agent Run von ${author?.displayName || author?.username || 'Unbekannt'} ("${content.slice(0, 50)}")...`);
    const result = await AgentRunService.executeDiscordRun(
      {
        content,
        author: author || { id: "unknown", username: "unknown" },
        guild,
        channel,
        messageId,
        conversationId
      },
      prisma,
      pluginManager
    );
    res.json(result);
  } catch (err: any) {
    console.error("[API] Fehler bei Discord Agent Run Ausführung:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agent-runs/:id/continue", async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Parameter 'message' ist erforderlich." });
    }
    console.log(`[API] Continue Agent Run ${conversationId} mit: "${message}"...`);
    const result = await AgentRunService.continueRun(
      conversationId,
      message,
      prisma,
      pluginManager
    );
    res.json(result);
  } catch (err: any) {
    console.error("[API] Fehler beim Fortsetzen des Agent Runs:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agent-runs/mail/:id", async (req, res) => {
  try {
    const emailId = Number(req.params.id);
    const force = req.body?.force === true;
    console.log(`[API] Trigger Agent Run für E-Mail ${emailId} (force: ${force})...`);
    const run = await AgentRunService.executeEmailRun(emailId, prisma, pluginManager, { force });
    if (!run) {
      return res.status(404).json({ error: `E-Mail mit ID ${emailId} nicht gefunden.` });
    }
    res.json({ success: true, conversationId: run.id, agentRun: run });
  } catch (err: any) {
    console.error("[API] Fehler bei Agent Run Ausführung:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Agent Notifications API
 */
app.get("/api/notifications", async (req, res) => {
  try {
    const onlyActive = req.query.all !== "true";
    const notifications = await prisma.agentNotification.findMany({
      where: onlyActive ? { isDismissed: false } : {},
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        conversation: {
          select: { id: true, title: true, status: true }
        }
      }
    });
    res.json(notifications);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/notifications/:id", async (req, res) => {
  try {
    const notifId = Number(req.params.id);
    const notif = await prisma.agentNotification.findUnique({
      where: { id: notifId },
      include: {
        conversation: {
          select: { id: true, title: true, status: true }
        }
      }
    });
    if (!notif) {
      return res.status(404).json({ error: `Benachrichtigung mit ID ${notifId} nicht gefunden.` });
    }
    res.json(notif);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    const { title, message, reasoning, actionData, type, priority, buttons, conversationId, sourceType, sourceId, agentName, agentAvatar, agentColor } = req.body;
    const notif = await prisma.agentNotification.create({
      data: {
        title: title || "Benachrichtigung",
        message: message || "",
        reasoning: reasoning || null,
        agentName: agentName || "Haupt-Assistent",
        agentAvatar: agentAvatar || "🤖",
        agentColor: agentColor || "#cba6f7",
        actionData: actionData || null,
        type: type || "action_required",
        priority: priority || "normal",
        buttons: buttons || [
          { label: "Ja, Antwort senden", action: "execute_action", style: "primary" }
        ],
        conversationId: conversationId || null,
        sourceType: sourceType || "mail",
        sourceId: sourceId ? String(sourceId) : null
      }
    });
    res.json(notif);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/notifications/:id", async (req, res) => {
  try {
    const notifId = Number(req.params.id);
    const { title, message, actionData, reasoning } = req.body;
    const dataToUpdate: any = {};
    if (title !== undefined) dataToUpdate.title = title;
    if (message !== undefined) dataToUpdate.message = message;
    if (actionData !== undefined) dataToUpdate.actionData = actionData;
    if (reasoning !== undefined) dataToUpdate.reasoning = reasoning;
    const updated = await prisma.agentNotification.update({
      where: { id: notifId },
      data: dataToUpdate
    });
    res.json({ success: true, notification: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notifications/:id/respond", async (req, res) => {
  try {
    const notifId = Number(req.params.id);
    const { label, action, replyText } = req.body;

    const notif = await prisma.agentNotification.findUnique({
      where: { id: notifId },
      include: { conversation: true }
    });

    if (!notif) {
      return res.status(404).json({ error: `Benachrichtigung mit ID ${notifId} nicht gefunden.` });
    }

    // 1. Benachrichtigung aktualisieren
    const updatedNotif = await prisma.agentNotification.update({
      where: { id: notifId },
      data: {
        selectedButton: label,
        isRead: true,
        isDismissed: true
      }
    });

    // 2. Gesicherte direkte Ausführung von vorgeschlagenen Aktionen (Termin, Aufgabe, Mail)
    let executedAction: any = null;
    const actionData = (notif as any).actionData;

    if (action === "execute_action" && actionData) {
      if (actionData.actionType === "create_event" && actionData.eventData) {
        const ev = actionData.eventData;
        const evDate = ev.date || ev.datum;
        const evTitle = ev.title || ev.titel || "Neuer Termin";
        const evLocation = ev.location || ev.ort || null;
        const evDesc = ev.description || ev.beschreibung || null;
        const isAllDay = !!(ev.isAllDay || ev.ganztaegig);
        const sTime = ev.startTime || ev.startzeit;
        const eTime = ev.endTime || ev.endzeit;

        let start: Date;
        let end: Date;

        if (isAllDay || !sTime) {
          start = new Date(`${evDate}T00:00:00`);
          end = new Date(`${evDate}T23:59:59`);
        } else {
          start = new Date(`${evDate}T${sTime}:00`);
          if (eTime) {
            end = new Date(`${evDate}T${eTime}:00`);
          } else {
            end = new Date(start.getTime() + 60 * 60 * 1000);
          }
        }

        const desc = [
          evDesc,
          evLocation ? `Ort: ${evLocation}` : null
        ].filter(Boolean).join("\n\n") || null;

        const createdEvent = await prisma.event.create({
          data: {
            title: evTitle,
            description: desc,
            start,
            end,
            isAllDay
          }
        });

        executedAction = {
          type: "event_created",
          event: createdEvent,
          message: `Termin "${createdEvent.title}" wurde verbindlich in den Kalender eingetragen.`
        };

        if (notif.conversationId) {
          await prisma.chatMessage.create({
            data: {
              conversationId: notif.conversationId,
              role: "system",
              text: `✅ **Gesichert bestätigt:** Termin "${createdEvent.title}" für ${start.toLocaleString("de-DE")} wurde fest im Kalender eingetragen.`
            }
          });
        }
      } else if (actionData.actionType === "create_task" && actionData.taskData) {
        const td = actionData.taskData;
        const taskTitle = td.title || td.titel || "Neue Aufgabe";
        const taskNotes = td.notes || td.notizen || null;
        const dueRaw = td.dueDate || td.due || td.faelligkeit;
        const due = dueRaw ? new Date(dueRaw.includes("T") ? dueRaw : dueRaw + "T00:00:00") : null;

        const createdTask = await prisma.task.create({
          data: {
            title: taskTitle,
            notes: taskNotes,
            due,
            listTitle: "Standard"
          }
        });

        executedAction = {
          type: "task_created",
          task: createdTask,
          message: `Aufgabe "${createdTask.title}" wurde in deine Aufgabenliste eingetragen.`
        };

        if (notif.conversationId) {
          await prisma.chatMessage.create({
            data: {
              conversationId: notif.conversationId,
              role: "system",
              text: `✅ **Gesichert bestätigt:** Aufgabe "${createdTask.title}" wurde erfolgreich angelegt.`
            }
          });
        }
      } else if ((actionData.actionType === "send_mail_reply" || actionData.actionType === "send_mail") && (actionData.replyData || actionData.mailData)) {
        const mailData = actionData.mailData || actionData.replyData;
        let account = null;
        if (mailData.accountId) {
          account = await prisma.mailAccount.findUnique({ where: { id: Number(mailData.accountId) } });
        } else if (mailData.emailId || mailData.mailId) {
          const originalMail = await prisma.cachedEmail.findUnique({
            where: { id: Number(mailData.emailId || mailData.mailId) }
          });
          if (originalMail?.accountId) {
            account = await prisma.mailAccount.findUnique({ where: { id: originalMail.accountId } });
          }
        }
        if (!account) {
          account = await prisma.mailAccount.findFirst({
            where: { isDeleted: false }
          });
        }

        if (account) {
          const sendRes = await MailService.sendEmail(
            account.id,
            {
              to: mailData.to,
              subject: mailData.subject,
              body: mailData.body,
              attachments: mailData.attachments || undefined
            },
            prisma
          );
          executedAction = {
            type: "mail_sent",
            sendResult: sendRes,
            message: sendRes.success ? `E-Mail an ${mailData.to} wurde erfolgreich versendet.` : `Fehler beim Senden: ${sendRes.error}`
          };
          if (notif.conversationId) {
            await prisma.chatMessage.create({
              data: {
                conversationId: notif.conversationId,
                role: "system",
                text: sendRes.success
                  ? `✅ **Gesichert bestätigt & versendet:** E-Mail an "${mailData.to}" mit Betreff "${mailData.subject}" wurde versendet.`
                  : `❌ **Fehler beim Versenden:** ${sendRes.error}`
              }
            });
          }
        } else {
          executedAction = {
            type: "mail_error",
            message: "Kein aktives E-Mail-Konto zum Senden konfiguriert."
          };
        }
      } else if (actionData.actionType === "set_route_mode" && actionData.toEventId && actionData.origin) {
        let chosenMode: TravelMode = "driving";
        const txt = (replyText || label || "").toLowerCase();
        if (txt.includes("bahn") || txt.includes("transit") || txt.includes("öpnv")) {
          chosenMode = "transit";
        } else if (txt.includes("fahrrad") || txt.includes("bicycling") || txt.includes("rad")) {
          chosenMode = "bicycling";
        } else if (txt.includes("fuß") || txt.includes("walking")) {
          chosenMode = "walking";
        } else {
          chosenMode = "driving";
        }

        try {
          const routeRes = await RouteService.setEventTravelMode(
            Number(actionData.toEventId),
            actionData.origin,
            chosenMode,
            prisma
          );
          executedAction = {
            type: "route_mode_set",
            travelMode: chosenMode,
            route: routeRes.route,
            message: `Reiseweg (${routeRes.route.durationText}, ${routeRes.route.distanceText || ""}) wurde gespeichert.`
          };

          if (notif.conversationId) {
            await prisma.chatMessage.create({
              data: {
                conversationId: notif.conversationId,
                role: "system",
                text: `✅ **Reiseroute geplant:** Fahrt von "${actionData.origin}" nach "${actionData.destination}" per **${label || chosenMode}** dauert ca. ${routeRes.route.durationText} (${routeRes.route.distanceText || ""}).`
              }
            });
          }
        } catch (rErr: any) {
          console.error("[API] Fehler beim Setzen des TravelMode via Notification:", rErr);
        }
      }
    } else if (action === "set_route_mode" && actionData?.toEventId && actionData?.origin) {
      let chosenMode: TravelMode = "driving";
      const txt = (replyText || label || "").toLowerCase();
      if (txt.includes("bahn") || txt.includes("transit") || txt.includes("öpnv")) {
        chosenMode = "transit";
      } else if (txt.includes("fahrrad") || txt.includes("bicycling") || txt.includes("rad")) {
        chosenMode = "bicycling";
      } else if (txt.includes("fuß") || txt.includes("walking")) {
        chosenMode = "walking";
      } else {
        chosenMode = "driving";
      }

      try {
        const routeRes = await RouteService.setEventTravelMode(
          Number(actionData.toEventId),
          actionData.origin,
          chosenMode,
          prisma
        );
        executedAction = {
          type: "route_mode_set",
          travelMode: chosenMode,
          route: routeRes.route,
          message: `Reiseweg (${routeRes.route.durationText}, ${routeRes.route.distanceText || ""}) wurde gespeichert.`
        };

        if (notif.conversationId) {
          await prisma.chatMessage.create({
            data: {
              conversationId: notif.conversationId,
              role: "system",
              text: `✅ **Reiseroute geplant:** Fahrt von "${actionData.origin}" nach "${actionData.destination}" per **${label || chosenMode}** dauert ca. ${routeRes.route.durationText} (${routeRes.route.distanceText || ""}).`
            }
          });
        }
      } catch (rErr: any) {
        console.error("[API] Fehler beim Setzen des TravelMode via Notification:", rErr);
      }
    } else if ((action === "set_event_location" || actionData?.actionType === "set_event_location") && actionData?.eventId && actionData?.location) {
      try {
        await prisma.event.update({
          where: { id: Number(actionData.eventId) },
          data: { location: actionData.location }
        });
        executedAction = {
          type: "event_location_set",
          location: actionData.location,
          message: `Standort für den Termin wurde auf "${actionData.location}" gesetzt.`
        };
      } catch (lErr: any) {
        console.error("[API] Fehler beim Setzen des Event-Standorts via Notification:", lErr);
      }
    }

    // 3. Wenn Aktion 'reply' ist oder ein replyText vorliegt und eine Conversation verknüpft ist, Agenten ausführen
    let aiResponse = null;
    const shouldReply = (action === "reply" || Boolean(replyText)) && notif.conversationId;
    if (shouldReply) {
      const responseText = replyText || label;
      console.log(`[API] Führe Folgeaktion für Benachrichtigung ${notifId} in Conv ${notif.conversationId} aus ("${responseText}")...`);
      aiResponse = await AgentRunService.continueRun(
        notif.conversationId!,
        responseText,
        prisma,
        pluginManager
      );
    }

    res.json({
      success: true,
      notification: updatedNotif,
      executedAction,
      aiResponse
    });
  } catch (err: any) {
    console.error("[API] Fehler beim Beantworten der Benachrichtigung:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Routen- & Wegeberechnung API ====================
app.post("/api/routes/select-mode", async (req, res) => {
  try {
    const { eventId, fromLocation, travelMode, prevEventEnd, targetEventStart } = req.body;
    if (!eventId || !fromLocation || !travelMode) {
      return res.status(400).json({ error: "eventId, fromLocation und travelMode sind erforderlich." });
    }
    const result = await RouteService.setEventTravelMode(Number(eventId), fromLocation, travelMode, prisma, {
      prevEventEnd,
      targetEventStart
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[API] Fehler in /api/routes/select-mode:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/routes/switch-travel-event-mode", async (req, res) => {
  try {
    const { eventId, travelMode } = req.body;
    if (!eventId || !travelMode) {
      return res.status(400).json({ error: "eventId und travelMode sind erforderlich." });
    }
    const id = Number(eventId);
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return res.status(404).json({ error: "Termin nicht gefunden." });
    }

    const destination = event.location || event.title;
    let origin = event.travelOriginLocation;

    const prevEvent = await prisma.event.findFirst({
      where: {
        id: { not: id },
        isDeleted: false,
        isCancelled: false,
        end: { lte: event.start }
      },
      orderBy: { end: "desc" }
    });

    if (!origin && prevEvent && prevEvent.location) {
      origin = prevEvent.location;
    }

    if (!origin) {
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
        const prim = owner.locations[0].location;
        origin = prim.formattedAddress || `${prim.address || ''}, ${prim.city || ''}`.trim();
      }
    }

    if (!origin) {
      origin = "Zuhause";
    }

    const existingDetails = (event.travelTransitDetails as any) || {};

    let earliestDepartureDate: Date | null = null;
    if (existingDetails.earliestDepartureTime) {
      earliestDepartureDate = new Date(existingDetails.earliestDepartureTime);
    } else if (existingDetails.requestedDepartureTime) {
      earliestDepartureDate = new Date(existingDetails.requestedDepartureTime);
    } else if (prevEvent && prevEvent.end && (event.start.getTime() - new Date(prevEvent.end).getTime()) <= 90 * 60 * 1000) {
      earliestDepartureDate = new Date(prevEvent.end);
    } else {
      earliestDepartureDate = event.start;
    }

    let targetArrivalDate: Date | null = null;
    if (existingDetails.targetArrivalTime) {
      targetArrivalDate = new Date(existingDetails.targetArrivalTime);
    } else if (existingDetails.requestedArrivalTime) {
      targetArrivalDate = new Date(existingDetails.requestedArrivalTime);
    }
    const isArrivalBound = /^(anreise|hinfahrt)\b/i.test((event.title || '').trim()) || !!targetArrivalDate;

    const mode: TravelMode = travelMode as TravelMode;
    const route = await RouteService.calculateRoute(origin, destination, mode, prisma, {
      departureTime: earliestDepartureDate,
      arrivalTime: targetArrivalDate || (isArrivalBound ? event.end : undefined),
      prevEventEnd: prevEvent?.end
    });

    let newStart = earliestDepartureDate;
    let newEnd = event.end;

    if (mode === "transit") {
      newStart = new Date(route.journeyStartDateTime || route.transitDetails?.journeyStartDateTime || route.transitDetails?.departureDateTime || earliestDepartureDate);
      newEnd = new Date(route.journeyEndDateTime || route.transitDetails?.journeyEndDateTime || route.transitDetails?.arrivalDateTime || (newStart.getTime() + (route.durationMinutes || 15) * 60000));
    } else {
      // driving, bicycling, walking: ab frühestmöglichem Startzeitpunkt (z. B. 16:00 Uhr)
      const durationMs = (route.durationMinutes || 15) * 60000;
      if (isArrivalBound && targetArrivalDate) {
        newEnd = targetArrivalDate;
        newStart = new Date(newEnd.getTime() - durationMs);
      } else {
        newStart = earliestDepartureDate;
        newEnd = new Date(newStart.getTime() + durationMs);
      }
    }

    const modeIcons: Record<string, string> = {
      driving: '🚗',
      transit: '🚆',
      bicycling: '🚲',
      walking: '🚶'
    };
    let updatedTitle = event.title;
    if (updatedTitle) {
      const newIcon = modeIcons[mode] || '🗺️';
      if (/^[🚗🚆🚲🚶✈️🗺️]\s*/.test(updatedTitle)) {
        updatedTitle = updatedTitle.replace(/^[🚗🚆🚲🚶✈️🗺️]\s*/, `${newIcon} `);
      }
    }

    const updatedTransitDetails = {
      ...(route.transitDetails || {}),
      earliestDepartureTime: earliestDepartureDate.toISOString(),
      requestedDepartureTime: existingDetails.requestedDepartureTime || earliestDepartureDate.toISOString(),
      targetArrivalTime: targetArrivalDate ? targetArrivalDate.toISOString() : existingDetails.targetArrivalTime,
      bufferBeforeMinutes: (newStart.getTime() > earliestDepartureDate.getTime())
        ? Math.round((newStart.getTime() - earliestDepartureDate.getTime()) / 60000)
        : 0
    };

    const updated = await prisma.event.update({
      where: { id },
      data: {
        title: updatedTitle,
        travelMode: mode,
        travelOriginLocation: origin,
        travelDurationMinutes: route.durationMinutes,
        travelDistanceText: route.distanceText,
        travelTransitDetails: updatedTransitDetails as any,
        start: newStart,
        end: newEnd
      }
    });

    res.json({ success: true, event: updated, route });
  } catch (err: any) {
    console.error("[API] Fehler in /api/routes/switch-travel-event-mode:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/routes/calculate", async (req, res) => {
  try {
    const { origin, destination, travelMode, arrivalTime, departureTime, prevEventEnd, targetEventStart } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin und destination sind erforderlich." });
    }
    const mode: TravelMode = travelMode || "driving";
    const route = await RouteService.calculateRoute(origin, destination, mode, prisma, {
      arrivalTime: arrivalTime || targetEventStart,
      departureTime,
      prevEventEnd,
      targetEventStart: targetEventStart || arrivalTime
    });
    res.json({ success: true, route });
  } catch (err: any) {
    console.error("[API] Fehler in /api/routes/calculate:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/routes/check-today", async (req, res) => {
  try {
    const dateStr = req.body?.date;
    const date = dateStr ? new Date(dateStr) : new Date();
    const result = await RouteService.checkAndPlanRoutesForDay(date, prisma);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[API] Fehler in /api/routes/check-today:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notifications/:id/dismiss", async (req, res) => {
  try {
    const notifId = Number(req.params.id);
    const updated = await prisma.agentNotification.update({
      where: { id: notifId },
      data: { isDismissed: true, isRead: true }
    });
    res.json({ success: true, notification: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notifications/:id/read", async (req, res) => {
  try {
    const notifId = Number(req.params.id);
    const updated = await prisma.agentNotification.update({
      where: { id: notifId },
      data: { isRead: true }
    });
    res.json({ success: true, notification: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * App Launcher API
 */
app.post("/apps", async (req, res) => {
  const { name, path } = req.body;
  console.log("Empfange App-Registrierung:", name, path);
  try {
    const app = await prisma.appLauncher.upsert({
      where: { name },
      update: { path },
      create: { name, path }
    });
    console.log("App erfolgreich gespeichert:", app);
    res.json(app);
  } catch (e: any) {
    console.error("DB Fehler bei App-Registrierung:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/apps", async (req, res) => {
  const apps = await prisma.appLauncher.findMany();
  res.json(apps);
});

app.get("/alerts", async (req, res) => {
  const alerts = await pluginManager.getAllAlerts();
  res.json(alerts);
});

app.get("/widgets", async (req, res) => {
  const calendarDays = req.query.calendarDays ? parseInt(req.query.calendarDays as string) : 7;
  const widgets = await pluginManager.getAllTopWidgets({ calendarDays });
  res.json(widgets);
});

app.get("/api/calendar/events", async (req, res) => {
  try {
    const startStr = req.query.start as string;
    const endStr = req.query.end as string;
    if (!startStr || !endStr) {
      return res.status(400).json({ error: "start und end Parameter sind erforderlich." });
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    const events = await getEventsForRange(start, end, prisma);

    const futureEventsCount = await prisma.event.count({
      where: {
        isDeleted: false,
        start: { gt: end }
      }
    });

    const activeFuturePatternsCount = await prisma.recurrencePattern.count({
      where: {
        isDeleted: false,
        OR: [
          { recurrenceEnd: null },
          { recurrenceEnd: { gt: end } }
        ]
      }
    });

    const hasMore = (futureEventsCount > 0) || (activeFuturePatternsCount > 0);

    res.json({
      events,
      hasMore
    });
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Kalender-Events:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/calendar/timeline", async (req, res) => {
  try {
    const startStr = req.query.start as string;
    const endStr = req.query.end as string;
    if (!startStr || !endStr) {
      return res.status(400).json({ error: "start und end Parameter sind erforderlich." });
    }
    const startDate = parseLocalDate(startStr);
    const endDate = parseLocalDate(endStr);
    const data = await getTimelineRangeData(startDate, endDate, prisma);
    res.json(data);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Timeline:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/tools/call", async (req, res) => {
  const { name } = req.body;
  const args = req.body.arguments || req.body.args || {};
  try {
    const result = await pluginManager.executeTool(name, args);
    res.json(result);
  } catch (error: any) {
    console.error(`Fehler bei Tool Call '${name}':`, error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/tasks/complete", async (req, res) => {
  const { taskId, completed } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: "taskId ist erforderlich." });
  }
  const targetCompleted = completed !== undefined ? !!completed : true;
  const now = new Date();

  try {
    const task = await prisma.task.findUnique({ where: { id: Number(taskId) } });
    if (task && task.recurrence && task.due && targetCompleted) {
      const nextDue = calculateNextDueDate(task.due, task.recurrence);
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
      await prisma.task.update({
        where: { id: Number(taskId) },
        data: {
          due: nextDue,
          completed: false
        }
      });
      res.json({ success: true, message: "Wiederkehrende Aufgabe erledigt und auf das nächste Datum verschoben.", nextDue: nextDue.toISOString() });
    } else {
      let statusToSet: string = targetCompleted ? 'done' : 'in_progress';
      if (task && task.projectId) {
        const parentProj = await prisma.project.findUnique({ where: { id: task.projectId } });
        if (parentProj && (parentProj as any).categories) {
          statusToSet = task.status || (targetCompleted ? 'done' : 'in_progress');
        }
      }
      await prisma.task.update({
        where: { id: Number(taskId) },
        data: {
          completed: targetCompleted,
          completedAt: targetCompleted ? now : null,
          status: statusToSet
        }
      });
      res.json({ success: true, message: `Aufgabe erfolgreich ${targetCompleted ? 'erledigt' : 'wieder geöffnet'}.` });
    }
  } catch (e: any) {
    console.error("Fehler beim Erledigen/Reaktivieren der Aufgabe:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Projects & Tasks Star / Pin / Status API
 */
const handleProjectPin = async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const { isStarred } = req.body;
    let targetStarred = isStarred;
    if (targetStarred === undefined) {
      const proj = await prisma.project.findUnique({ where: { id } });
      if (!proj) return res.status(404).json({ error: "Projekt nicht gefunden." });
      targetStarred = !proj.isStarred;
    }
    const updated = await prisma.project.update({
      where: { id },
      data: { isStarred: !!targetStarred }
    });
    res.json({ success: true, project: updated });
  } catch (e: any) {
    console.error("Fehler beim Umschalten des Projekt-Pins:", e);
    res.status(500).json({ error: e.message });
  }
};
app.post("/api/projects/:id/star", handleProjectPin);
app.post("/api/projects/:id/pin", handleProjectPin);

app.get("/api/projects/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const project: any = await prisma.project.findUnique({
      where: { id },
      include: {
        tasks: { where: { isDeleted: false }, orderBy: [{ isStarred: "desc" }, { createdAt: "desc" }] },
        notes: { where: { isDeleted: false }, orderBy: { updatedAt: "desc" } }
      }
    });
    if (!project) return res.status(404).json({ error: "Projekt nicht gefunden." });
    await attachProjectStatesToProjects(prisma, [project]);
    const pStates = project.states || [];
    const defState = pStates.find((s: any) => s.isDefault) || pStates[0] || null;
    const syncedCats = pStates.length > 0
      ? { items: pStates.map((s: any) => ({ id: s.id, name: s.name, icon: s.icon, isDefault: s.isDefault })), defaultId: defState.id }
      : (project.categories || null);
    res.json({
      ...project,
      categories: syncedCats
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const handleSaveProjectStates = async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const rawInput = req.body.states !== undefined ? req.body.states : req.body.categories;
    const states = await syncProjectStates(prisma, id, rawInput || null);
    const updated: any = await prisma.project.findUnique({
      where: { id }
    });
    if (updated) {
      updated.states = states;
    }
    res.json({ success: true, project: updated, states });
  } catch (e: any) {
    console.error("Fehler beim Speichern der Projekt-Zustände:", e);
    res.status(500).json({ error: e.message });
  }
};
app.post("/api/projects/:id/categories", handleSaveProjectStates);
app.post("/api/projects/:id/states", handleSaveProjectStates);

const handleTaskPin = async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const { isStarred } = req.body;
    let targetStarred = isStarred;
    if (targetStarred === undefined) {
      const task = await prisma.task.findUnique({ where: { id } });
      if (!task) return res.status(404).json({ error: "Aufgabe nicht gefunden." });
      targetStarred = !task.isStarred;
    }
    const updated = await prisma.task.update({
      where: { id },
      data: { isStarred: !!targetStarred }
    });
    res.json({ success: true, task: updated });
  } catch (e: any) {
    console.error("Fehler beim Umschalten des Aufgaben-Pins:", e);
    res.status(500).json({ error: e.message });
  }
};
app.post("/api/tasks/:id/star", handleTaskPin);
app.post("/api/tasks/:id/pin", handleTaskPin);

app.post("/api/tasks/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rawVal = req.body.stateId !== undefined ? req.body.stateId : req.body.status;
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === "") {
      return res.status(400).json({ error: "Gültiger status oder stateId erforderlich." });
    }
    const statusStr = String(rawVal).trim();
    const now = new Date();
    const updateData: any = {};

    await ensureProjectStateSchema(prisma);

    if (statusStr.toLowerCase() === "archive" || statusStr.toLowerCase() === "archiv") {
      const updated = await prisma.task.update({
        where: { id },
        data: { isDeleted: true }
      });
      return res.json({ success: true, task: updated, isArchived: true });
    }

    if (/^\d+$/.test(statusStr)) {
      const numStateId = Number(statusStr);
      const stRows: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT "id", "name", "icon" FROM "ProjectState" WHERE "id" = $1`,
        numStateId
      ).catch(() => []);
      if (stRows[0]) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Task" SET "stateId" = $1, "listTitle" = 'Standard' WHERE "id" = $2`,
          Number(stRows[0].id),
          id
        );
        const taskAfter = await prisma.task.findUnique({ where: { id } });
        return res.json({
          success: true,
          task: { ...taskAfter, stateId: Number(stRows[0].id), state: stRows[0] }
        });
      } else {
        updateData.status = statusStr;
      }
    } else {
      updateData.status = statusStr;
      if (statusStr === 'done') {
        updateData.completed = true;
        updateData.completedAt = now;
        updateData.isPlanned = false;
      } else if (statusStr === 'suggestion') {
        updateData.completed = false;
        updateData.completedAt = null;
        updateData.isPlanned = true;
      } else if (statusStr === 'in_progress') {
        updateData.completed = false;
        updateData.completedAt = null;
        updateData.isPlanned = false;
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: updateData
    });
    res.json({ success: true, task: updated });
  } catch (e: any) {
    console.error("Fehler beim Aktualisieren des Aufgaben-Status:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Journal / Tagebuch API
 */
app.get("/api/journal/days", async (req, res) => {
  try {
    const startStr = req.query.start as string;
    const endStr = req.query.end as string;
    if (!startStr || !endStr) {
      return res.status(400).json({ error: "start und end Parameter sind erforderlich." });
    }
    const startDate = parseLocalDate(startStr);
    const endDate = parseLocalDate(endStr);
    const data = await getRangeSummaryData(startDate, endDate, prisma);
    res.json(data);
  } catch (e: any) {
    console.error("Fehler beim Abrufen des Tagebuch-Datumsbereichs:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/journal/day-summary", async (req, res) => {
  try {
    const dateStr = req.query.date as string;
    const targetDate = parseLocalDate(dateStr);
    const summary = await getDaySummaryData(targetDate, prisma);
    res.json(summary);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Tagebuch-Tagesübersicht:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/journal/entries", async (req, res) => {
  try {
    const { content, title, date } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "content ist erforderlich." });
    }
    const targetDate = parseLocalDate(date);

    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
    let embedding: number[] | null = null;
    try {
      const result = await embeddingModel.embedContent(content);
      embedding = result.embedding.values;
    } catch (err) {
      console.error("Fehler beim Erstellen des Embeddings für Tagebucheintrag:", err);
    }

    let entry: any;
    if (embedding && embedding.length > 0) {
      try {
        const inserted: any[] = await prisma.$queryRawUnsafe(
          `INSERT INTO "DiaryEntry" (date, title, content, embedding, "createdAt", "updatedAt", "isDeleted")
           VALUES ($1, $2, $3, $4::vector, NOW(), NOW(), false)
           RETURNING id, date, title, content, "createdAt"`,
          targetDate,
          title || null,
          content,
          `[${embedding.join(",")}]`
        );
        entry = inserted[0];
      } catch (rawErr) {
        console.warn("Vektoreinbettung konnte nicht direkt gespeichert werden, Fallback auf Standard-Insert:", rawErr);
        entry = await prisma.diaryEntry.create({
          data: {
            date: targetDate,
            title: title || null,
            content
          }
        });
      }
    } else {
      entry = await prisma.diaryEntry.create({
        data: {
          date: targetDate,
          title: title || null,
          content
        }
      });
    }

    res.json({ success: true, entry });
  } catch (e: any) {
    console.error("Fehler beim Erstellen des Tagebucheintrags:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/journal/entries/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.diaryEntry.update({
      where: { id },
      data: { isDeleted: true }
    });
    res.json({ success: true, message: "Tagebucheintrag gelöscht." });
  } catch (e: any) {
    console.error("Fehler beim Löschen des Tagebucheintrags:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/journal/entries/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, content, date } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "content ist erforderlich." });
    }
    const updateData: any = {
      title: title || null,
      content: content.trim()
    };
    if (date) {
      updateData.date = parseLocalDate(date);
    }

    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
    try {
      const result = await embeddingModel.embedContent(content.trim());
      const embedding = result.embedding.values;
      if (embedding && embedding.length > 0) {
        await prisma.$queryRawUnsafe(
          `UPDATE "DiaryEntry" SET title = $1, content = $2, embedding = $3::vector, "updatedAt" = NOW() WHERE id = $4`,
          updateData.title,
          updateData.content,
          `[${embedding.join(",")}]`,
          id
        );
        const updated = await prisma.diaryEntry.findUnique({ where: { id } });
        return res.json({ success: true, entry: updated });
      }
    } catch (embErr) {
      console.warn("Embedding-Update fehlgeschlagen:", embErr);
    }

    const entry = await prisma.diaryEntry.update({
      where: { id },
      data: updateData
    });
    res.json({ success: true, entry });
  } catch (e: any) {
    console.error("Fehler beim Bearbeiten des Tagebucheintrags:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/journal/search", async (req, res) => {
  try {
    const queryStr = req.query.q as string;
    if (!queryStr) {
      return res.status(400).json({ error: "q (Suchbegriff) ist erforderlich." });
    }

    let matches: any[] = [];
    try {
      const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
      const result = await embeddingModel.embedContent(queryStr);
      const embedding = result.embedding.values;

      matches = await prisma.$queryRawUnsafe(
        `SELECT id, date, title, content, "createdAt"
         FROM "DiaryEntry"
         WHERE "isDeleted" = false AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector LIMIT 10`,
        `[${embedding.join(",")}]`
      );
    } catch (searchErr) {
      console.warn("Vektorsuche fehlgeschlagen oder nicht verfügbar, Fallback auf Textsuche:", searchErr);
      const fallbackEntries = await prisma.diaryEntry.findMany({
        where: {
          isDeleted: false,
          OR: [
            { content: { contains: queryStr, mode: 'insensitive' } },
            { title: { contains: queryStr, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { date: 'desc' }
      });
      matches = fallbackEntries;
    }

    res.json(matches);
  } catch (e: any) {
    console.error("Fehler bei der Vektorsuche im Tagebuch:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Dynamic Entity Links API
 */
app.get("/api/plugins/entities", (req, res) => {
  try {
    const configs = pluginManager.getEntityConfigs();
    res.json(configs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/entities/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  try {
    const entity = await pluginManager.resolveEntity(type, Number(id));
    if (!entity) {
      return res.status(404).json({ error: `Entity vom Typ '${type}' mit ID ${id} nicht gefunden.` });
    }
    res.json(entity);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mail API
 */
app.get("/api/mail/accounts", async (req, res) => {
  try {
    const accounts = await prisma.mailAccount.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        email: true,
        imapHost: true,
        imapPort: true,
        imapTls: true,
        smtpHost: true,
        smtpPort: true,
        smtpTls: true,
        color: true,
        createdAt: true,
        _count: {
          select: {
            cachedEmails: { where: { isRead: false } }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
    res.json(accounts);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Mail-Konten:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/accounts", async (req, res) => {
  try {
    const { name, email, password, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpTls, color } = req.body;
    if (!name || !email || !password || !imapHost || !smtpHost) {
      return res.status(400).json({ error: "Name, E-Mail, Passwort, IMAP- und SMTP-Host sind erforderlich." });
    }

    const newAccount = await prisma.mailAccount.create({
      data: {
        name,
        email,
        password,
        imapHost,
        imapPort: imapPort ? Number(imapPort) : 993,
        imapTls: imapTls !== undefined ? !!imapTls : true,
        smtpHost,
        smtpPort: smtpPort ? Number(smtpPort) : 587,
        smtpTls: smtpTls !== undefined ? !!smtpTls : true,
        color: color || (email.toLowerCase().includes("web.de") ? "#fab387" : (email.toLowerCase().includes("gmail") ? "#f38ba8" : "#89b4fa"))
      }
    });

    // Sofortige erste Synchronisation im Hintergrund anstoßen
    MailService.syncAccountEmails(newAccount, prisma).catch(err => {
      console.warn(`[Mail] Fehler bei Erstsynchronisierung von ${newAccount.email}:`, err);
    });

    res.json({
      id: newAccount.id,
      name: newAccount.name,
      email: newAccount.email,
      imapHost: newAccount.imapHost,
      imapPort: newAccount.imapPort,
      imapTls: newAccount.imapTls,
      smtpHost: newAccount.smtpHost,
      smtpPort: newAccount.smtpPort,
      smtpTls: newAccount.smtpTls,
      color: newAccount.color
    });
  } catch (e: any) {
    console.error("Fehler beim Anlegen des Mail-Kontos:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/mail/accounts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, password, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpTls, color } = req.body;

    const data: any = {};
    if (name) data.name = name;
    if (email) data.email = email;
    if (password) data.password = password;
    if (imapHost) data.imapHost = imapHost;
    if (imapPort) data.imapPort = Number(imapPort);
    if (imapTls !== undefined) data.imapTls = !!imapTls;
    if (smtpHost) data.smtpHost = smtpHost;
    if (smtpPort) data.smtpPort = Number(smtpPort);
    if (smtpTls !== undefined) data.smtpTls = !!smtpTls;
    if (color) data.color = color;

    const updated = await prisma.mailAccount.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        imapHost: true,
        imapPort: true,
        imapTls: true,
        smtpHost: true,
        smtpPort: true,
        smtpTls: true,
        color: true
      }
    });

    res.json(updated);
  } catch (e: any) {
    console.error("Fehler beim Aktualisieren des Mail-Kontos:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/mail/accounts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.mailAccount.update({
      where: { id },
      data: { isDeleted: true }
    });
    res.json({ success: true, message: "Konto erfolgreich entfernt." });
  } catch (e: any) {
    console.error("Fehler beim Löschen des Mail-Kontos:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/accounts/test", async (req, res) => {
  try {
    const { email, password, imapHost, imapPort, imapTls } = req.body;
    if (!email || !password || !imapHost) {
      return res.status(400).json({ error: "E-Mail, Passwort und IMAP-Host sind erforderlich." });
    }

    const testRes = await MailService.testConnection({
      email,
      password,
      imapHost,
      imapPort: imapPort ? Number(imapPort) : 993,
      imapTls: imapTls !== undefined ? !!imapTls : true
    });

    res.json(testRes);
  } catch (e: any) {
    console.error("Fehler beim Verbindungstest:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get("/api/mail/messages", async (req, res) => {
  try {
    const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;
    const category = req.query.category as string | undefined;
    const personId = req.query.personId ? Number(req.query.personId) : undefined;
    const query = req.query.q as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await MailService.getUnifiedEmails(prisma, {
      accountId,
      category,
      personId,
      query,
      limit,
      offset
    });

    res.json(result);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Nachrichten:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/mail/messages/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const mail = await prisma.cachedEmail.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            email: true,
            color: true
          }
        },
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            aliases: { select: { name: true, isPrimary: true } }
          }
        },
        agentRun: {
          select: {
            id: true,
            title: true,
            status: true,
            summary: true,
            createdAt: true
          }
        }
      }
    });

    if (!mail) {
      return res.status(404).json({ error: `E-Mail mit ID ${id} nicht gefunden.` });
    }

    if (!mail.isRead) {
      await MailService.markEmailReadStatus(prisma, id, true);
      mail.isRead = true;
    }

    res.json(mail);
  } catch (e: any) {
    console.error("Fehler beim Laden der E-Mail:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/messages/:id/read", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const isRead = req.body?.isRead !== undefined ? !!req.body.isRead : true;
    const result = await MailService.markEmailReadStatus(prisma, id, isRead);
    res.json(result);
  } catch (e: any) {
    console.error("Fehler beim Ändern des Gelesen-Status:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/mail/categories", async (req, res) => {
  try {
    const cats = await MailService.getCategories(prisma);
    res.json(cats);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Kategorien:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/categories", async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name der Kategorie ist erforderlich." });
    }
    const cat = await MailService.createCategory(prisma, name, icon);
    res.json(cat);
  } catch (e: any) {
    console.error("Fehler beim Erstellen der Kategorie:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/mail/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, icon } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name der Kategorie ist erforderlich." });
    }
    const cat = await MailService.updateCategory(prisma, id, name, icon);
    res.json(cat);
  } catch (e: any) {
    console.error("Fehler beim Aktualisieren der Kategorie:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/mail/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await MailService.deleteCategory(prisma, id);
    res.json({ success: true, message: "Kategorie gelöscht." });
  } catch (e: any) {
    console.error("Fehler beim Löschen der Kategorie:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/mail/messages/:id/category", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { category } = req.body;
    const updated = await MailService.updateEmailCategory(prisma, id, category);
    res.json(updated);
  } catch (e: any) {
    console.error("Fehler beim Aktualisieren der Kategorie:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/mail/messages/:id/person", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const personId = req.body.personId !== undefined && req.body.personId !== null ? Number(req.body.personId) : null;
    const updated = await MailService.linkEmailToPerson(prisma, id, personId);
    res.json(updated);
  } catch (e: any) {
    console.error("Fehler beim Verknüpfen der Person:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/mail/messages/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.cachedEmail.delete({ where: { id } });
    res.json({ success: true, message: "E-Mail gelöscht." });
  } catch (e: any) {
    console.error("Fehler beim Löschen der E-Mail:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/messages/batch-category", async (req, res) => {
  try {
    const { ids, category } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs Array erforderlich." });
    }
    let cleanCategory: string | null = null;
    if (Array.isArray(category)) {
      const list = category.map(c => typeof c === "string" ? c.trim() : "").filter(Boolean);
      cleanCategory = list.length > 0 ? Array.from(new Set(list)).join(", ") : null;
    } else if (typeof category === "string" && category.trim()) {
      cleanCategory = category.trim();
    }
    await prisma.cachedEmail.updateMany({
      where: { id: { in: ids.map(Number) } },
      data: { category: cleanCategory }
    });
    res.json({ success: true, count: ids.length, category: cleanCategory });
  } catch (e: any) {
    console.error("Fehler bei Batch-Kategorisierung:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/messages/batch-person", async (req, res) => {
  try {
    const { ids, personId } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs Array erforderlich." });
    }
    const pId = personId !== undefined && personId !== null ? Number(personId) : null;
    await prisma.cachedEmail.updateMany({
      where: { id: { in: ids.map(Number) } },
      data: { personId: pId }
    });
    res.json({ success: true, count: ids.length, personId: pId });
  } catch (e: any) {
    console.error("Fehler bei Batch-Personenzuordnung:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/messages/batch-read", async (req, res) => {
  try {
    const { ids, isRead } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs Array erforderlich." });
    }
    await prisma.cachedEmail.updateMany({
      where: { id: { in: ids.map(Number) } },
      data: { isRead: !!isRead }
    });
    res.json({ success: true, count: ids.length, isRead: !!isRead });
  } catch (e: any) {
    console.error("Fehler bei Batch-Gelesen-Status:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/messages/batch-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs Array erforderlich." });
    }
    await prisma.cachedEmail.deleteMany({
      where: { id: { in: ids.map(Number) } }
    });
    res.json({ success: true, count: ids.length });
  } catch (e: any) {
    console.error("Fehler beim Batch-Löschen:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/memory/people", async (req, res) => {
  try {
    const people = await prisma.person.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        isOwner: true,
        isFavorite: true,
        email: true,
        emails: true,
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
      const primaryAlias = p.aliases ? (p.aliases.find(a => a.isPrimary) || p.aliases[0]) : null;
      const nameStr = primaryAlias && primaryAlias.name ? primaryAlias.name : (p.isOwner ? "Ich" : `Person #${p.id}`);
      const aliasList = (p.aliases || []).map(a => a.name).filter(n => n && n !== nameStr);
      return {
        id: p.id,
        isOwner: !!p.isOwner,
        isFavorite: !!p.isFavorite,
        name: nameStr,
        email: p.email,
        emails: p.emails,
        aliases: aliasList,
        biography: p.biography
      };
    });

    formattedPeople.sort((a, b) => {
      if (a.isOwner) return -1;
      if (b.isOwner) return 1;
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    res.json(formattedPeople);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Personen:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/entities/person/:id/favorite", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isFavorite } = req.body;
    const updated = await prisma.person.update({
      where: { id },
      data: { isFavorite: !!isFavorite }
    });
    res.json({ success: true, isFavorite: updated.isFavorite });
  } catch (e: any) {
    console.error("Fehler beim Aktualisieren des Favoritenstatus:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/memory/people/batch-favorite", async (req, res) => {
  try {
    const { ids, isFavorite } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: "ids Array erforderlich." });
    }
    const numIds = ids.map(Number).filter(n => !isNaN(n));
    await prisma.person.updateMany({
      where: { id: { in: numIds } },
      data: { isFavorite: !!isFavorite }
    });
    res.json({ success: true, count: numIds.length, isFavorite: !!isFavorite });
  } catch (e: any) {
    console.error("Fehler beim Batch-Favorisieren:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/entities/person/:id/email", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { email, emails } = req.body;
    const data: any = {};
    if (email !== undefined) data.email = email ? email.trim() : null;
    if (emails !== undefined) data.emails = emails ? emails.trim() : null;

    const updated = await prisma.person.update({
      where: { id },
      data,
      include: { aliases: true }
    });

    // Retroaktiver Abgleich: Verknüpfe alle bisher nicht zugeordneten E-Mails dieser Adresse
    const addressToMatch = (updated.email || "").toLowerCase().trim();
    if (addressToMatch) {
      await prisma.cachedEmail.updateMany({
        where: {
          personId: null,
          from: { contains: addressToMatch, mode: "insensitive" }
        },
        data: { personId: updated.id }
      });
    }

    res.json(updated);
  } catch (e: any) {
    console.error("Fehler beim Speichern der Personen-E-Mail:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Locations & Person-Locations API
 */
app.get("/api/locations", async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const type = req.query.type as string | undefined;
    const city = req.query.city as string | undefined;
    const state = req.query.state as string | undefined;
    const personId = req.query.personId ? Number(req.query.personId) : undefined;

    const where: any = { isDeleted: false };
    if (type && type !== "all") where.type = type;
    if (city) where.city = { contains: city.trim(), mode: "insensitive" };
    if (state) where.state = { contains: state.trim(), mode: "insensitive" };
    if (personId) where.persons = { some: { personId } };

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { address: { contains: term, mode: "insensitive" } },
        { city: { contains: term, mode: "insensitive" } },
        { state: { contains: term, mode: "insensitive" } },
        { postalCode: { contains: term, mode: "insensitive" } },
        { formattedAddress: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
        {
          persons: {
            some: {
              person: {
                aliases: {
                  some: { name: { contains: term, mode: "insensitive" } }
                }
              }
            }
          }
        }
      ];
    }

    const locations = await (prisma as any).location.findMany({
      where,
      orderBy: [{ isFavorite: "desc" }, { name: "asc" }]
    });

    const results = await Promise.all(
      locations.map(async (loc: any) => {
        const persons = await getPersonsForLocation(prisma, loc);
        return {
          ...loc,
          formattedAddress: loc.formattedAddress || buildFormattedAddress(loc),
          persons
        };
      })
    );

    res.json(results);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Orte:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/locations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const loc = await (prisma as any).location.findUnique({
      where: { id }
    });
    if (!loc || loc.isDeleted) {
      return res.status(404).json({ error: "Ort nicht gefunden." });
    }
    const persons = await getPersonsForLocation(prisma, loc);
    res.json({
      ...loc,
      formattedAddress: loc.formattedAddress || buildFormattedAddress(loc),
      persons
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/locations", async (req, res) => {
  try {
    const {
      name,
      type,
      address,
      postalCode,
      city,
      state,
      country,
      notes,
      personId,
      relationType,
      label,
      isPrimary
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name des Ortes ist erforderlich." });
    }

    const formattedAddress = buildFormattedAddress({
      address,
      postalCode,
      city,
      state,
      country: country || "Deutschland"
    }) || name.trim();

    const loc = await (prisma as any).location.create({
      data: {
        name: name.trim(),
        type: type || (state && !address ? "state" : city && !address ? "city" : "residence"),
        address: address ? address.trim() : null,
        postalCode: postalCode ? postalCode.trim() : null,
        city: city ? city.trim() : null,
        state: state ? state.trim() : null,
        country: country ? country.trim() : "Deutschland",
        formattedAddress,
        notes: notes ? notes.trim() : null
      }
    });

    if (personId) {
      const pId = Number(personId);
      const relType = relationType || "residence";
      if (isPrimary) {
        await (prisma as any).personLocation.updateMany({
          where: { personId: pId, relationType: relType },
          data: { isPrimary: false }
        });
      }
      await (prisma as any).personLocation.create({
        data: {
          personId: pId,
          locationId: loc.id,
          relationType: relType,
          label: label ? label.trim() : null,
          isPrimary: !!isPrimary
        }
      });
    }

    const persons = await getPersonsForLocation(prisma, loc);
    res.json({
      ...loc,
      persons
    });
  } catch (e: any) {
    console.error("Fehler beim Erstellen des Ortes:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/locations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      name,
      type,
      address,
      postalCode,
      city,
      state,
      country,
      notes
    } = req.body;

    const existing = await (prisma as any).location.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      return res.status(404).json({ error: "Ort nicht gefunden." });
    }

    const newAddress = address !== undefined ? (address ? address.trim() : null) : existing.address;
    const newPostal = postalCode !== undefined ? (postalCode ? postalCode.trim() : null) : existing.postalCode;
    const newCity = city !== undefined ? (city ? city.trim() : null) : existing.city;
    const newState = state !== undefined ? (state ? state.trim() : null) : existing.state;
    const newCountry = country !== undefined ? (country ? country.trim() : "Deutschland") : existing.country;

    const formattedAddress = buildFormattedAddress({
      address: newAddress,
      postalCode: newPostal,
      city: newCity,
      state: newState,
      country: newCountry
    }) || (name ? name.trim() : existing.name);

    const updated = await (prisma as any).location.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        type: type !== undefined ? type : undefined,
        address: newAddress,
        postalCode: newPostal,
        city: newCity,
        state: newState,
        country: newCountry,
        formattedAddress,
        notes: notes !== undefined ? (notes ? notes.trim() : null) : undefined
      }
    });

    const persons = await getPersonsForLocation(prisma, updated);
    res.json({
      ...updated,
      persons
    });
  } catch (e: any) {
    console.error("Fehler beim Aktualisieren des Ortes:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/locations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await (prisma as any).location.update({
      where: { id },
      data: { isDeleted: true }
    });
    res.json({ success: true, message: "Ort gelöscht." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/locations/:id/favorite", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isFavorite } = req.body;
    const updated = await (prisma as any).location.update({
      where: { id },
      data: { isFavorite: !!isFavorite }
    });
    res.json({ success: true, isFavorite: updated.isFavorite });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/locations/:id/persons", async (req, res) => {
  try {
    const locationId = Number(req.params.id);
    const { personId, relationType, label, isPrimary } = req.body;
    if (!personId) {
      return res.status(400).json({ error: "personId ist erforderlich." });
    }
    const pId = Number(personId);
    const relType = relationType || "residence";

    if (isPrimary) {
      await (prisma as any).personLocation.updateMany({
        where: { personId: pId, relationType: relType },
        data: { isPrimary: false }
      });
    }

    const pl = await (prisma as any).personLocation.upsert({
      where: {
        personId_locationId_relationType: {
          personId: pId,
          locationId,
          relationType: relType
        }
      },
      update: {
        label: label ? label.trim() : null,
        isPrimary: !!isPrimary
      },
      create: {
        personId: pId,
        locationId,
        relationType: relType,
        label: label ? label.trim() : null,
        isPrimary: !!isPrimary
      }
    });

    const loc = await (prisma as any).location.findUnique({ where: { id: locationId } });
    const persons = await getPersonsForLocation(prisma, loc);
    res.json({ success: true, link: pl, persons });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/locations/:id/persons/:personId", async (req, res) => {
  try {
    const locationId = Number(req.params.id);
    const personId = Number(req.params.personId);
    await (prisma as any).personLocation.deleteMany({
      where: { locationId, personId }
    });
    const loc = await (prisma as any).location.findUnique({ where: { id: locationId } });
    const persons = await getPersonsForLocation(prisma, loc);
    res.json({ success: true, persons });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/persons/:id/locations", async (req, res) => {
  try {
    const personId = Number(req.params.id);
    const links = await (prisma as any).personLocation.findMany({
      where: {
        personId,
        location: { isDeleted: false }
      },
      include: { location: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
    });

    const formatted = links.map((pl: any) => ({
      linkId: pl.id,
      relationType: pl.relationType,
      label: pl.label || (pl.relationType === "residence" ? "Wohnsitz" : pl.relationType),
      isPrimary: pl.isPrimary,
      location: {
        ...pl.location,
        formattedAddress: pl.location.formattedAddress || buildFormattedAddress(pl.location)
      }
    }));

    res.json(formatted);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/persons/:id/locations", async (req, res) => {
  try {
    const personId = Number(req.params.id);
    const {
      existingLocationId,
      name,
      type,
      address,
      postalCode,
      city,
      state,
      country,
      notes,
      relationType,
      label,
      isPrimary
    } = req.body;

    let targetLocationId: number;

    if (existingLocationId) {
      targetLocationId = Number(existingLocationId);
    } else {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Ortsname ist erforderlich." });
      }
      const formattedAddress = buildFormattedAddress({
        address,
        postalCode,
        city,
        state,
        country: country || "Deutschland"
      }) || name.trim();

      const newLoc = await (prisma as any).location.create({
        data: {
          name: name.trim(),
          type: type || (state && !address ? "state" : city && !address ? "city" : "residence"),
          address: address ? address.trim() : null,
          postalCode: postalCode ? postalCode.trim() : null,
          city: city ? city.trim() : null,
          state: state ? state.trim() : null,
          country: country ? country.trim() : "Deutschland",
          formattedAddress,
          notes: notes ? notes.trim() : null
        }
      });
      targetLocationId = newLoc.id;
    }

    const relType = relationType || "residence";

    if (isPrimary) {
      await (prisma as any).personLocation.updateMany({
        where: { personId, relationType: relType },
        data: { isPrimary: false }
      });
    }

    const link = await (prisma as any).personLocation.upsert({
      where: {
        personId_locationId_relationType: {
          personId,
          locationId: targetLocationId,
          relationType: relType
        }
      },
      update: {
        label: label ? label.trim() : null,
        isPrimary: !!isPrimary
      },
      create: {
        personId,
        locationId: targetLocationId,
        relationType: relType,
        label: label ? label.trim() : null,
        isPrimary: !!isPrimary
      },
      include: { location: true }
    });

    res.json({
      success: true,
      link: {
        ...link,
        location: {
          ...link.location,
          formattedAddress: link.location.formattedAddress || buildFormattedAddress(link.location)
        }
      }
    });
  } catch (e: any) {
    console.error("Fehler beim Zuordnen des Ortes zur Person:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/routes/calculate", async (req, res) => {
  try {
    const { origin, destination, mode } = req.query as { origin?: string; destination?: string; mode?: TravelMode };
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin und destination sind erforderlich." });
    }
    const result = await RouteService.calculateRoute(origin, destination, mode || "transit", prisma);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// Media & File Management API Endpoints
// ==========================================

app.post("/api/media/upload", upload.array("files"), async (req, res) => {
  try {
    const description = req.body.description ? String(req.body.description).trim() : null;
    const personIdsRaw = req.body.personIds;
    const projectIdsRaw = req.body.projectIds;
    const projectTag = req.body.tag ? String(req.body.tag).trim() : null;
    const personRole = req.body.role ? String(req.body.role).trim() : null;

    let personIds: number[] = [];
    if (personIdsRaw) {
      if (Array.isArray(personIdsRaw)) personIds = personIdsRaw.map(Number).filter(Boolean);
      else {
        try { personIds = JSON.parse(personIdsRaw).map(Number).filter(Boolean); }
        catch { personIds = String(personIdsRaw).split(",").map(s => Number(s.trim())).filter(Boolean); }
      }
    }

    let projectIds: number[] = [];
    if (projectIdsRaw) {
      if (Array.isArray(projectIdsRaw)) projectIds = projectIdsRaw.map(Number).filter(Boolean);
      else {
        try { projectIds = JSON.parse(projectIdsRaw).map(Number).filter(Boolean); }
        catch { projectIds = String(projectIdsRaw).split(",").map(s => Number(s.trim())).filter(Boolean); }
      }
    }

    const files = (req.files as Express.Multer.File[]) || [];

    // Support Base64 Upload
    if (files.length === 0 && req.body.dataBase64) {
      const { title, fileName, fileType, dataBase64 } = req.body;
      const buffer = Buffer.from(dataBase64.replace(/^data:.*?;base64,/, ""), "base64");
      const ext = path.extname(fileName || "file.bin") || (fileType?.includes("png") ? ".png" : fileType?.includes("jpeg") ? ".jpg" : ".bin");
      const safeName = `${Date.now()}_${(fileName || "file").replace(/[^a-zA-Z0-9_\-\.]/g, "_")}${ext}`;
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, safeName), buffer);

      const mimeType = fileType || (ext === ".pdf" ? "application/pdf" : "application/octet-stream");
      const isImg = mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext.toLowerCase());
      const category = isImg ? "image" : "document";

      let extractedText: string | null = null;
      if (mimeType.includes("text") || [".txt", ".md", ".json", ".csv"].includes(ext.toLowerCase())) {
        extractedText = buffer.toString("utf-8");
      }

      const item = await (prisma as any).mediaItem.create({
        data: {
          title: title || fileName || "Hochgeladene Datei",
          fileName: safeName,
          filePath: `/uploads/${safeName}`,
          fileType: mimeType,
          category,
          fileSize: buffer.length,
          description,
          extractedText,
          persons: {
            create: personIds.map(pid => ({ personId: pid, role: personRole || "Zugehörig" }))
          },
          projects: {
            create: projectIds.map(pid => ({ projectId: pid, tag: projectTag || "Zugehörig" }))
          }
        },
        include: {
          persons: { include: { person: { include: { aliases: true } } } },
          projects: { include: { project: true } }
        }
      });
      return res.json({ success: true, count: 1, items: [formatMediaItem(item)] });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: "Keine Dateien zum Hochladen übergeben." });
    }

    const savedItems = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const isImg = file.mimetype.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext);
      const category = isImg ? "image" : "document";

      let extractedText: string | null = null;
      if (file.mimetype.includes("text") || [".txt", ".md", ".json", ".csv"].includes(ext)) {
        try {
          extractedText = fs.readFileSync(file.path, "utf-8");
        } catch { }
      }

      const item = await (prisma as any).mediaItem.create({
        data: {
          title: file.originalname,
          fileName: file.filename,
          filePath: `/uploads/${file.filename}`,
          fileType: file.mimetype,
          category,
          fileSize: file.size,
          description,
          extractedText,
          persons: {
            create: personIds.map(pid => ({ personId: pid, role: personRole || "Zugehörig" }))
          },
          projects: {
            create: projectIds.map(pid => ({ projectId: pid, tag: projectTag || "Zugehörig" }))
          }
        },
        include: {
          persons: { include: { person: { include: { aliases: true } } } },
          projects: { include: { project: true } }
        }
      });
      savedItems.push(formatMediaItem(item));
    }

    res.json({ success: true, count: savedItems.length, items: savedItems });
  } catch (err: any) {
    console.error("Fehler beim Medien-Upload:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/media", async (req, res) => {
  try {
    const { category, projectId, personId, isFavorite, search } = req.query as any;

    const where: any = { isDeleted: false };
    if (category && category !== "all") {
      where.category = category;
    }
    if (isFavorite === "true" || isFavorite === true) {
      where.isFavorite = true;
    }
    if (projectId) {
      where.projects = { some: { projectId: Number(projectId) } };
    }
    if (personId) {
      where.persons = { some: { personId: Number(personId) } };
    }
    if (search && String(search).trim()) {
      const q = String(search).trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { fileName: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { extractedText: { contains: q, mode: "insensitive" } }
      ];
    }

    const items = await (prisma as any).mediaItem.findMany({
      where,
      include: {
        persons: { include: { person: { include: { aliases: true } } } },
        projects: { include: { project: true } }
      },
      orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }]
    });

    res.json(items.map(formatMediaItem));
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Medien:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/media/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = await (prisma as any).mediaItem.findUnique({
      where: { id },
      include: {
        persons: { include: { person: { include: { aliases: true } } } },
        projects: { include: { project: true } }
      }
    });
    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Datei nicht gefunden." });
    }
    res.json(formatMediaItem(item));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/media/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, isFavorite } = req.body;
    const data: any = {};
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (isFavorite !== undefined) data.isFavorite = !!isFavorite;

    const item = await (prisma as any).mediaItem.update({
      where: { id },
      data,
      include: {
        persons: { include: { person: { include: { aliases: true } } } },
        projects: { include: { project: true } }
      }
    });
    res.json(formatMediaItem(item));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/media/:id/content", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = await (prisma as any).mediaItem.findUnique({
      where: { id },
      include: {
        persons: { include: { person: { include: { aliases: true } } } },
        projects: { include: { project: true } }
      }
    });
    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Datei nicht gefunden." });
    }

    const diskPath = path.join(process.cwd(), "public", item.filePath.replace(/^\//, ""));
    let content = "";
    if (fs.existsSync(diskPath)) {
      try {
        content = fs.readFileSync(diskPath, "utf-8");
      } catch (err: any) {
        content = item.extractedText || "";
      }
    } else if (item.extractedText) {
      content = item.extractedText;
    }

    res.json({
      id: item.id,
      title: item.title,
      fileName: item.fileName,
      filePath: item.filePath,
      fileType: item.fileType,
      fileSize: item.fileSize,
      content,
      media: formatMediaItem(item)
    });
  } catch (e: any) {
    console.error("Fehler beim Laden des Dateiinhalts:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/media/:id/content", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { content, title } = req.body;
    if (content === undefined || typeof content !== "string") {
      return res.status(400).json({ error: "Parameter 'content' als String erforderlich." });
    }

    const item = await (prisma as any).mediaItem.findUnique({ where: { id } });
    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Datei nicht gefunden." });
    }

    const diskPath = path.join(process.cwd(), "public", item.filePath.replace(/^\//, ""));
    const uploadDir = path.dirname(diskPath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(diskPath, content, "utf-8");
    const newSize = Buffer.byteLength(content, "utf-8");

    const data: any = {
      extractedText: content,
      fileSize: newSize
    };
    if (title && String(title).trim()) {
      data.title = String(title).trim();
    }

    const updated = await (prisma as any).mediaItem.update({
      where: { id },
      data,
      include: {
        persons: { include: { person: { include: { aliases: true } } } },
        projects: { include: { project: true } }
      }
    });

    res.json({
      success: true,
      item: formatMediaItem(updated),
      message: "Dateiinhalt erfolgreich gespeichert."
    });
  } catch (e: any) {
    console.error("Fehler beim Speichern des Dateiinhalts:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/media/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await (prisma as any).mediaItem.update({
      where: { id },
      data: { isDeleted: true }
    });
    res.json({ success: true, message: "Datei gelöscht." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/media/:id/favorite", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isFavorite } = req.body;
    const item = await (prisma as any).mediaItem.update({
      where: { id },
      data: { isFavorite: !!isFavorite }
    });
    res.json({ success: true, isFavorite: item.isFavorite });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/media/:id/persons", async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    const { personId, role } = req.body;
    if (!personId) return res.status(400).json({ error: "personId erforderlich" });

    const link = await (prisma as any).mediaPerson.upsert({
      where: { mediaId_personId: { mediaId, personId: Number(personId) } },
      create: { mediaId, personId: Number(personId), role: role || "Zugehörig" },
      update: { role: role || "Zugehörig" }
    });
    res.json({ success: true, link });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/media/:id/persons/:personId", async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    const personId = Number(req.params.personId);
    await (prisma as any).mediaPerson.deleteMany({
      where: { mediaId, personId }
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/media/:id/projects", async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    const { projectId, tag } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId erforderlich" });

    const link = await (prisma as any).mediaProject.upsert({
      where: { mediaId_projectId: { mediaId, projectId: Number(projectId) } },
      create: { mediaId, projectId: Number(projectId), tag: tag || "Zugehörig" },
      update: { tag: tag || "Zugehörig" }
    });
    res.json({ success: true, link });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/media/:id/projects/:projectId", async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    const projectId = Number(req.params.projectId);
    await (prisma as any).mediaProject.deleteMany({
      where: { mediaId, projectId }
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/projects/:id/media", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const links = await (prisma as any).mediaProject.findMany({
      where: { projectId, media: { isDeleted: false } },
      include: {
        media: {
          include: {
            persons: { include: { person: { include: { aliases: true } } } },
            projects: { include: { project: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(links.map((l: any) => ({
      ...formatMediaItem(l.media),
      tag: l.tag
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/persons/:id/media", async (req, res) => {
  try {
    const personId = Number(req.params.id);
    const links = await (prisma as any).mediaPerson.findMany({
      where: { personId, media: { isDeleted: false } },
      include: {
        media: {
          include: {
            persons: { include: { person: { include: { aliases: true } } } },
            projects: { include: { project: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(links.map((l: any) => ({
      ...formatMediaItem(l.media),
      role: l.role
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


app.post("/api/mail/send", async (req, res) => {
  try {
    const { accountId, to, subject, body, inReplyTo, references, attachments, notificationId } = req.body;
    if (!accountId || !to || !subject || !body) {
      return res.status(400).json({ error: "accountId, to, subject und body sind erforderlich." });
    }

    const sendRes = await MailService.sendEmail(
      Number(accountId),
      {
        to,
        subject,
        body,
        inReplyTo,
        references,
        attachments: attachments || undefined
      },
      prisma
    );

    if (sendRes.success && notificationId) {
      try {
        await prisma.agentNotification.update({
          where: { id: Number(notificationId) },
          data: {
            isRead: true,
            isDismissed: true,
            selectedButton: "Im Editor gesendet"
          }
        });
      } catch (_) { }
    }

    res.json(sendRes);
  } catch (e: any) {
    console.error("Fehler beim Senden der Mail:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/mail/sync", async (req, res) => {
  try {
    const accountId = req.body?.accountId ? Number(req.body.accountId) : undefined;
    const fullSync = req.body?.fullSync === true;

    if (accountId) {
      const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
      if (!account || account.isDeleted) {
        return res.status(404).json({ error: "Konto nicht gefunden." });
      }
      const syncRes = await MailService.syncAccountEmails(account, prisma, { fullSync });
      return res.json({ success: true, count: syncRes.count, error: syncRes.error });
    }

    const allSync = await MailService.syncAllAccounts(prisma, { fullSync });
    res.json({ success: true, totalSynced: allSync.totalSynced, results: allSync.results });
  } catch (e: any) {
    console.error("Fehler beim Synchronisieren:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/mail/notifications/latest", async (req, res) => {
  try {
    const sinceId = req.query.sinceId ? Number(req.query.sinceId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await MailService.getLatestUnreadEmails(prisma, { sinceId, limit });
    res.json(result);
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Mail-Benachrichtigungen:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/notifications/test", async (req, res) => {
  try {
    res.json({
      success: true,
      testMail: {
        id: -1,
        accountId: 0,
        accountName: "Test-Konto",
        accountEmail: "test@kisystem.app",
        accountColor: "#89b4fa",
        from: "kiSystem Support <support@kisystem.app>",
        fromName: "kiSystem Support",
        subject: "🎉 Test-Benachrichtigung für neue E-Mails",
        snippet: "Wenn du diese Push-Benachrichtigung auf deinem Smartphone siehst, funktioniert das Benachrichtigungssystem einwandfrei!",
        date: new Date().toISOString()
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mail/test-inject", async (req, res) => {
  try {
    const { preset, subject, body, from, fromName, to } = req.body || {};

    let mailSubject = subject;
    let mailBody = body;
    let mailFrom = from || "test@beispiel.de";
    let mailFromName = fromName || "Test Absender";
    const mailTo = to || "benutzer@kisystem.local";

    if (preset === "question" || (!mailSubject && !preset)) {
      mailSubject = mailSubject || "Terminanfrage: Keramik bemalen am Samstag 15:00 Uhr";
      mailFromName = (mailFromName === "Test Absender") ? "Sarah" : mailFromName;
      mailFrom = (mailFrom === "test@beispiel.de") ? "sarah@friends.de" : mailFrom;
      mailBody = mailBody || "Hallo!\nHast du Lust am Samstag um 15:00 Uhr mit mir Keramik bemalen zu gehen? Sag mir bitte kurz Bescheid, ob du Zeit hast!\nLiebe Grüße, Sarah";
    } else if (preset === "info") {
      mailSubject = mailSubject || "Wichtige Mitteilung: Paketankündigung für heute";
      mailFromName = (mailFromName === "Test Absender") ? "DHL Paket" : mailFromName;
      mailFrom = (mailFrom === "test@beispiel.de") ? "noreply@dhl.de" : mailFrom;
      mailBody = mailBody || "Guten Tag,\nIhr Paket von Amazon wird voraussichtlich heute zwischen 14:00 und 16:30 Uhr zugestellt. Sie können den Lieferstatus online verfolgen.";
    } else if (preset === "spam" || preset === "newsletter") {
      mailSubject = mailSubject || "Mega Sale: 50% Rabatt auf die neue Frühlingskollektion!";
      mailFromName = (mailFromName === "Test Absender") ? "ModeStore Newsletter" : mailFromName;
      mailFrom = (mailFrom === "test@beispiel.de") ? "newsletter@modestore.de" : mailFrom;
      mailBody = mailBody || "Hallo Fashion-Fan,\nNur dieses Wochenende sparst du 50% auf alle Artikel! Klicke hier zum Shoppen. Wenn du keine Newsletter mehr erhalten möchtest, klicke hier zum Abmelden.";
    }

    // 1. Account ermitteln oder Dummy-Konto anlegen
    let account = await prisma.mailAccount.findFirst({
      where: { isDeleted: false },
      orderBy: { id: "asc" }
    });

    if (!account) {
      account = await prisma.mailAccount.create({
        data: {
          name: "Lokales Test-Postfach",
          email: "test@kisystem.local",
          password: "test-password",
          imapHost: "localhost",
          imapPort: 993,
          imapTls: false,
          smtpHost: "localhost",
          smtpPort: 587,
          smtpTls: false,
          color: "#89b4fa"
        }
      });
    }

    // 2. Höchste UID für dieses Konto ermitteln
    const maxUidRecord = await prisma.cachedEmail.findFirst({
      where: { accountId: account.id },
      orderBy: { uid: "desc" },
      select: { uid: true }
    });
    const nextUid = (maxUidRecord?.uid || 0) + 1;

    // 3. E-Mail in CachedEmail einfügen
    const cleanSnippet = (mailBody || "").replace(/\s+/g, " ").trim().slice(0, 160);
    const createdMail = await prisma.cachedEmail.create({
      data: {
        accountId: account.id,
        uid: nextUid,
        messageId: `<test-${Date.now()}@kisystem.local>`,
        subject: mailSubject,
        from: mailFrom,
        fromName: mailFromName,
        to: mailTo,
        date: new Date(),
        bodyText: mailBody,
        bodyHtml: `<p>${(mailBody || "").replace(/\n/g, "<br>")}</p>`,
        snippet: cleanSnippet,
        isRead: false,
        hasAttachments: false
      }
    });

    console.log(`[Test-Inject] ✉️ Test-Mail #${createdMail.id} "${createdMail.subject}" angelegt.`);

    // 4. Hook aufrufen (löst Agent Run aus)
    if (typeof MailService.onNewEmail === "function") {
      MailService.onNewEmail(createdMail, prisma);
    }

    res.json({
      success: true,
      message: `Test-Mail #${createdMail.id} erfolgreich angelegt und Agent Run gestartet.`,
      email: createdMail
    });
  } catch (err: any) {
    console.error("[Test-Inject] Fehler:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/persons/merge", async (req, res) => {
  const { sourceId, targetId } = req.body;
  if (!sourceId || !targetId) {
    return res.status(400).json({ error: "sourceId und targetId sind erforderlich." });
  }
  if (Number(sourceId) === Number(targetId)) {
    return res.status(400).json({ error: "Ein Profil kann nicht mit sich selbst verschmolzen werden." });
  }
  try {
    await prisma.$transaction(async (tx) => {
      const sourcePerson = await tx.person.findUnique({
        where: { id: Number(sourceId) },
        include: { aliases: true }
      });
      const targetPerson = await tx.person.findUnique({
        where: { id: Number(targetId) },
        include: { aliases: true }
      });
      if (!sourcePerson || !targetPerson) {
        throw new Error("Eine oder beide Personen existieren nicht.");
      }

      const targetAliasNames = new Set(targetPerson.aliases.map(a => a.name.toLowerCase()));
      for (const sourceAlias of sourcePerson.aliases) {
        if (targetAliasNames.has(sourceAlias.name.toLowerCase())) {
          await tx.personAlias.delete({ where: { id: sourceAlias.id } });
        } else {
          await tx.personAlias.update({
            where: { id: sourceAlias.id },
            data: { personId: targetPerson.id, isPrimary: false }
          });
        }
      }

      await tx.fact.updateMany({
        where: { personId: sourcePerson.id },
        data: { personId: targetPerson.id }
      });

      await tx.semanticMemory.updateMany({
        where: { personId: sourcePerson.id },
        data: { personId: targetPerson.id }
      });

      if (sourcePerson.biography) {
        const newBiography = targetPerson.biography
          ? `${targetPerson.biography}\n\n[Zusammengeführt]: ${sourcePerson.biography}`
          : sourcePerson.biography;
        await tx.person.update({
          where: { id: targetPerson.id },
          data: { biography: newBiography }
        });
      }

      await tx.person.delete({
        where: { id: sourcePerson.id }
      });
    });

    res.json({ success: true, message: "Profile erfolgreich zusammengeführt." });
  } catch (error: any) {
    console.error("Fehler beim Mergen der Profile:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Settings API
 */
app.get("/settings", (req, res) => {
  res.json(getSettings());
});

app.post("/settings", (req, res) => {
  const { hotkey, disabledPlugins, autostart, aiModel, googleSearchGrounding, agentSettings } = req.body;
  const current = getSettings();
  const updated = {
    hotkey: hotkey !== undefined ? hotkey : current.hotkey,
    disabledPlugins: [], // Plugins sind immer aktiv
    autostart: autostart !== undefined ? autostart : current.autostart,
    aiModel: aiModel !== undefined ? aiModel : current.aiModel,
    googleSearchGrounding: googleSearchGrounding !== undefined ? Boolean(googleSearchGrounding) : (current.googleSearchGrounding !== false),
    agentSettings: agentSettings !== undefined ? agentSettings : current.agentSettings
  };
  saveSettings(updated);
  res.json(updated);
});

app.get("/settings/agents", (req, res) => {
  const settings = getSettings();
  const plugins = pluginManager.getPluginsInfo().map(p => ({
    name: p.name,
    description: p.description,
  }));
  const dynamicProviders = (pluginManager.dynamicTools as any).getProviders
    ? (pluginManager.dynamicTools as any).getProviders()
    : ["discord-bot"];

  res.json({
    agentSettings: settings.agentSettings || {},
    availableTriggers: AVAILABLE_TRIGGERS,
    plugins,
    dynamicProviders
  });
});

app.post("/settings/agents", (req, res) => {
  try {
    const { id, name, description, avatar, color, trigger, triggerDescription, systemPrompt, allowedPlugins, pluginPermissions, detailedPermissions, allowedDynamicProviders, allowAllDynamicTools, isEnabled } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Der Name des Agenten ist erforderlich." });
    }
    const rawKey = (id && id.trim()) ? id.trim() : name.trim();
    const key = rawKey.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

    const updated = saveAgentConfig(key, {
      name: name.trim(),
      description: description || "",
      avatar: avatar || undefined,
      color: color || undefined,
      trigger: trigger || "manual",
      triggerDescription,
      systemPrompt,
      allowedPlugins: allowedPlugins || ["*"],
      pluginPermissions,
      detailedPermissions,
      allowedDynamicProviders: allowedDynamicProviders || [],
      allowAllDynamicTools: allowAllDynamicTools ?? true,
      isEnabled: isEnabled !== false
    });
    res.json({ success: true, key, agent: updated[key], agentSettings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/settings/agents/:id", (req, res) => {
  try {
    const { id } = req.params;
    deleteAgentConfig(id);
    const settings = getSettings();
    res.json({ success: true, agentSettings: settings.agentSettings || {} });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/settings/agents/:id/toggle", (req, res) => {
  try {
    const { id } = req.params;
    const { isEnabled } = req.body || {};
    const newStatus = toggleAgentStatus(id, isEnabled);
    const settings = getSettings();
    res.json({ success: true, isEnabled: newStatus, agentSettings: settings.agentSettings || {} });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/agent-runs/trigger", async (req, res) => {
  try {
    const { agentId, trigger, prompt, title, metadata } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Parameter 'prompt' ist erforderlich." });
    }
    console.log(`[API] Manueller/Externer Trigger Agent Run mit Prompt: "${prompt.slice(0, 50)}"... agentId=${agentId}, trigger=${trigger}`);
    const result = await AgentRunService.executeTriggerRun(
      { agentId, trigger, prompt, title, metadata },
      prisma,
      pluginManager
    );
    res.json(result);
  } catch (err: any) {
    console.error("[API] Fehler bei Trigger Agent Run:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/settings/plugins", (req, res) => {
  res.json(pluginManager.getPluginsInfo());
});

app.post("/messages", async (req, res) => {

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Keine aktive SSE Verbindung");
  }
});


let activeTools: { name: string; args: any }[] = [];

app.get("/chat/active-tools", (req, res) => {
  res.json(activeTools);
});


function sanitizeEntityDatesForGermanContext(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (obj instanceof Date) {
    return `${formatGermanDate(obj)} ${formatGermanTime(obj)} Uhr (deutsche Lokalzeit)`;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeEntityDatesForGermanContext);
  }
  const copy: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) {
      copy[k] = `${formatGermanDate(v)} ${formatGermanTime(v)} Uhr (deutsche Lokalzeit)`;
    } else if (typeof v === "object" && v !== null) {
      copy[k] = sanitizeEntityDatesForGermanContext(v);
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

/**
 * Gemini AI Integration
 */
app.post("/chat", async (req, res) => {
  let { message, audio, attachments, conversationId } = req.body;
  console.log("Chat Request Body:", { message, hasAudio: !!audio, attachmentsCount: attachments?.length, conversationId });

  try {
    activeTools = [];
    // Erstelle neue Konversation, falls keine existiert
    if (!conversationId) {
      const title = message ? (message.substring(0, 30) + "...") : "Sprachnachricht";
      const newConv = await prisma.conversation.create({
        data: { title }
      });
      conversationId = newConv.id;
    }

    // 1. Vorherigen Chatverlauf abrufen (strikt validiert für Gemini: startet mit user, endet mit model)
    const rawPrevMessages = conversationId ? await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    }) : [];
    const chatHistory = AgentRunService.formatGeminiChatHistory(rawPrevMessages, 14);

    // 2. Speichere Benutzer-Nachricht in DB
    if (message || audio || (attachments && attachments.length > 0)) {
      await prisma.chatMessage.create({
        data: {
          role: "user",
          text: message || (attachments && attachments.length > 0 ? "🖼️ Bild-Anhang" : "🎤 Sprachnachricht"),
          conversationId
        }
      });
    }

    const timeCtx = getGermanTimeContext();
    const dateString = timeCtx.dateString;
    const timeString = timeCtx.timeString;
    const todayIso = timeCtx.todayIso;
    const offsetStr = timeCtx.offsetStr;
    const tzName = timeCtx.tzName;

    const userModel = getSettings().aiModel;
    const modelName = userModel || process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const groundingEnabled = getSettings().googleSearchGrounding !== false;
    const chatTools: any[] = [{ functionDeclarations: pluginManager.getGeminiTools() }];
    if (groundingEnabled) {
      chatTools.push({ googleSearch: {} });
    }

    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: chatTools as any,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.AUTO
        },
        includeServerSideToolInvocations: true
      } as any,
      generationConfig: {
        thinkingConfig: {
          thinkingBudget: 0
        }
      } as any,
      systemInstruction: {
        role: "system",
        parts: [{
          text: `Du bist ein hilfsbereiter, proaktiver persönlicher KI-Assistent. 
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, ${tzName}, ${offsetStr}). 
Nutze '${todayIso}' als heutiges Datum als Basis für alle Datumsberechnungen (z.B. morgen = nächster Tag im Format YYYY-MM-DD).

ZEITZONEN- & UHRZEIT-REGEL (STRENGSTE PFLICHT):
- Alle Uhrzeiten und Zeitangaben des Benutzers beziehen sich IMMER auf die DEUTSCHE LOKALZEIT (Europe/Berlin, ${tzName}, ${offsetStr})!
- Wenn der Benutzer sagt "16 Uhr", "16:00", "um 17:30", "Termin endet 16 Uhr" oder "fahrt um 16:08", meint er ausnahmslos deutsche Zeit.
- Wandle deutsche Zeiten NIEMALS in UTC um und ziehe NIEMALS Zeitzonenstunden ab!
- HÄNGE NIEMALS ein 'Z' an Datums- oder Zeit-Strings an ('Z' bedeutet UTC und verschiebt Fahrten bei Google Maps um 1-2 Stunden)!
- Bei Werkzeugaufrufen ('berechne_route', 'erstelle_wegzeit_termin', 'fuege_termin_hinzu', 'bearbeite_termin', 'erstelle_timer'):
  * Übergib Zeitparameter (wie 'abfahrtszeit', 'ankunftszeit', 'datum', 'neues_datum') IMMER im lokalen deutschen Format:
    - Entweder als reine Uhrzeit: z. B. '16:00' bzw. '16:08'
    - Oder als lokales ISO-Datum OHNE 'Z': z. B. '${todayIso}T16:00:00' (oder mit deutschem Offset '${todayIso}T16:00:00${offsetStr}').
- Beziehe dich in deinen Antworten immer auf diese genauen deutschen Uhrzeiten.

INTERNET- & LIVE-SUCHE (GOOGLE SEARCH GROUNDING):
- Du hast Zugriff auf die integrierte Live-Google-Suche (Google Search Grounding).
- Wenn der Benutzer nach aktuellen Informationen, Wetter, Nachrichten, Sportergebnissen, Öffnungszeiten, Ereignissen, Recherchen oder externem Wissen fragt, führe automatisch eine Google-Suche durch.
- Nutze die Suchergebnisse, um präzise, aktuelle und verlässliche Antworten zu liefern.

WERKZEUGAUFRUFE (TOOLS) - OBERSTE REGEL:
- Wenn der Benutzer eine Aktion wünscht (z.B. Aufgabe erstellen, Mails anzeigen/holen, Timer/Wecker stellen, Projekt erstellen, Termin eintragen, Notiz speichern usw.), rufe das passende Werkzeug SOFORT als Function Call auf. Antworte NICHT nur mit Text oder leeren Floskeln, sondern führe die Aktion direkt aus!
- Verwende in Werkzeug-Parametern IMMER reine JSON-Werte (Strings oder Zahlen). Führe NIEMALS Python-Code oder Formeln wie 'from datetime import date' in den Argumenten aus, sondern berechne Datums-Strings im Voraus als z.B. "${todayIso}".
- Wenn du relative Timer erstellst (z.B. "in 15 Minuten" oder "für 10 Sekunden"), benutze im Tool 'erstelle_timer' bevorzugt den Parameter 'sekunden'.
- Für feste Uhrzeiten (z. B. "morgen um 17 Uhr") berechne die Ablaufzeit im lokalen Format (z. B. YYYY-MM-DDTHH:mm:ss${offsetStr}) und gib diesen String an 'erstelle_timer' oder 'fuege_termin_hinzu'.

Du hast Zugriff auf ein persönliches Profil des Benutzers ("Ich / Über mich"):
- Wenn der Benutzer persönliche Informationen über sich selbst erzählt ("Ich mag...", "Mein Ziel ist...", "Ich habe mir vorgenommen...", "Merke dir über mich..."), verwende 'merke_ueber_mich'.
- Wenn du nach persönlichen Informationen, Vorlieben, Zielen oder Gewohnheiten des Benutzers gefragt wirst, verwende 'hole_mein_profil'.

Du hast Zugriff auf ein dreistufiges Gedächtnissystem für Kontakte und Personen:
1. Biografie (notes): Kompakte Zusammenfassung über die Person. Lesen per 'hole_person_info', Schreiben/Aktualisieren per 'aktualisiere_person_biografie'.
2. Strukturierte Fakten (Fact-Tabelle): Einzelne atomare Details (z.B. Lieblingsfarbe, Hobbys). Lesen per 'hole_person_info', Hinzufügen per 'fuege_person_fakt_hinzu', Löschen per 'loesche_person_fakt'. Geburtstage per 'setze_person_geburtstag'.
3. Semantisches Langzeitgedächtnis (SemanticMemory-Tabelle): Unstrukturierte Erlebnisse, Treffen und Chats mit Vektorsuche. Speichern per 'erinnere_dich', Suchen per 'suche_im_gedaechtnis'.

Du hast Zugriff auf ein Tagebuch (Journal) mit täglichen Einträgen, Kalenderterminen und erledigten Aufgaben:
- Einen Tagebucheintrag verfassen oder ergänzen per 'eintrag_ins_tagebuch'.
- Den Tagesablauf, Erlebnisse und erledigte Aufgaben eines Tages lesen per 'lies_tagebuch'.
- Vergangene Tagebucheinträge semantisch per Vektorsuche durchsuchen per 'suche_im_tagebuch'.

Du hast Zugriff auf ein Orts- und Standortsystem (Locations) und Kalendersystem (Calendar):
- Orte, Wohnsitze, Büros, Städte und Bundesländer werden mit 'erstelle_ort', 'suche_orte' oder 'verknuepfe_person_ort' verwaltet.
- WICHTIG: Wenn der Benutzer sagt "Ich treffe mich bei [Person]" (z.B. "Ich treffe mich bei Tom" oder "Trag ein: Treffen bei Tom"):
  1. Rufe 'hole_person_orte' auf, um die bekannten Adressen der Person zu finden.
  2. Hat die Person genau 1 Adresse / Wohnsitz: Verwende diese Adresse automatisch als Standort für den Termin ('standort').
  3. Hat die Person mehrere Adressen (z.B. Wohnung und Ferienhaus/Büro): Frage kurz nach, an welcher der Adressen das Treffen stattfindet.
  4. Hat die Person noch keine Adresse hinterlegt: Frage freundlich nach, wo die Person wohnt oder wo das Treffen stattfindet, und biete an, die Adresse für sie zu speichern ('erstelle_ort').
- WICHTIG ZU WEGEZEITEN & TERMINEN:
  * Termine haben KEINE fest verknüpfte Anreise oder Route als Eigenschaft im Termin.
  * Wegezeiten und Fahrtzeiten sind EIGENSTÄNDIGE Kalendertermine mit vollwertigen Google-Maps-Details (Abfahrtszeit, Ankunftszeit, Haltestellen, ÖPNV-Linien)!
  * Man bearbeitet oder verschiebt entweder den Termin ODER die Wegezeit unabhängig voneinander ('bearbeite_termin'). Sie haben keine direkte technische Kopplung in der Datenbank; dass man für einen Termin erst anreisen muss, verstehst du als KI logisch aus den Zeiten und Orten.
  * Wenn der Nutzer eine Anreise, Fahrt, Hin- oder Rückfahrt zu einem Termin oder Ort wünscht (z. B. "Plane mir die Anreise zum Termin", "Trag mir die Fahrt ein", "plane hin und rückfahrt bei dem Termin mit der bahn"):
    1. Rufe für jede Fahrt/Wegzeit IMMER das Tool 'erstelle_wegzeit_termin' auf (verwende dafür NICHT das generische 'fuege_termin_hinzu')!
    2. Übergib 'abfahrtszeit' oder 'ankunftszeit' als deutsche Zeit (z. B. '16:00' oder '${todayIso}T16:00:00'), NIEMALS in UTC und OHNE 'Z'!
    3. 'erstelle_wegzeit_termin' ermittelt automatisch die Verbindung über Google Maps und trägt die Wegezeit als vollwertige Wegezeit mit den exakten Google-Maps-Zeiten, Verkehrsmitteln, Linien (z. B. S4), Haltestellen und Verkehrsmittel-Umschaltknöpfen in den Kalender ein!
    4. Du musst Wegbeschreibungen nicht manuell in das Textfeld 'beschreibung' packen, das System bindet die Google-Maps-Fahrtdetails automatisch ein.
    5. Start & Ziel: Für Fahrten von/nach Hause kannst du als Parameter einfach 'Zuhause' angeben und für Personen ihren Namen (z.B. 'Tom'). Das System löst diese automatisch auf die echten Adressen auf.
- Reiserouten und Wegezeiten zwischen beliebigen Orten oder Personen berechnest du direkt per 'berechne_route':
  * Das Tool liefert bis zu 2 Routenoptionen und prüft automatisch auf Überschneidungen/Kollisionen mit bestehenden Kalenderterminen.
  * Schlage dem Nutzer stets die Optionen mit ihren Vor- und Nachteilen vor (z. B. Abfahrtszeiten, Wartezeit beim Umsteigen, ob man ewig warten muss oder eine Direktverbindung hat) und weise aktiv darauf hin, falls eine Route mit einem Termin im Kalender kollidiert!

Du hast Zugriff auf ein Medien- und Dateisystem (Media):
- Hochgeladene Fotos, Dokumente, PDFs und Dateien verwaltest und durchsuchst du mit 'suche_dateien' und 'lese_datei_inhalt'.
- Dateien können Projekten und Personen zugeordnet sein (n:n Verbindung).
- WICHTIG: Wenn der Benutzer eine Stellenanzeige gibt und eine Bewerbung verfassen möchte (z.B. "Hier ist eine Stelle, schreib mir eine Bewerbung mithilfe meines Projekts Bewerbung" oder "Bereite eine Bewerbung als Mail vor"):
  1. Analysiere vorhandene Dokumente (Lebenslauf, Anschreiben) im Projekt oder Profil mit 'suche_dateien' / 'lese_datei_inhalt' oder deinen hinterlegten Informationen.
  2. Formuliere ein professionelles, passgenaues Anschreiben und schlage es direkt per 'schlage_mail_vor' als E-Mail-Entwurf (mit Betreff, Empfänger und Anhängen) vor!
- Wenn der Benutzer nach Bildern von bestimmten Personen oder Projekten fragt, filtere sie mit 'suche_dateien' gezielt nach Person oder Projekt.
- Beschreibungen zu Bildern und Dokumenten ("was ist darauf abgebildet") können mit 'aktualisiere_datei_beschreibung' ergänzt werden.

PROJEKTE, PROJEKT-ZUSTÄNDE (ProjectState-Tabelle) & AUFGABEN (STRENGSTE PFLICHT):
- Jedes Projekt kann eigene Projekt-Zustände (Spalten/Phasen wie z. B. "Geplant", "Beworben", "Abgelehnt" oder "Offen", "In Arbeit", "Fertig") besitzen.
- Diese Projekt-Zustände sind in einer EIGENEN Datenbanktabelle ('ProjectState') gespeichert und haben jeweils eine eindeutige numerische ID ('zustandId' / 'stateId').
- Zustände eines Projekts anlegen, ändern oder löschen:
  * Nutze IMMER das Werkzeug 'verwalte_projekt_zustaende' (oder den Parameter 'zustaende' bei 'erstelle_projekt' / 'bearbeite_projekt').
  * 'verwalte_projekt_zustaende' legt die Zustände als echte Datensätze in der Tabelle 'ProjectState' an und gibt dir die zugehörigen numerischen IDs ('zustandId') zurück.
- Aufgaben in einem Projekt erstellen oder einem Projekt-Zustand zuordnen:
  * Jede Aufgabe in einem Projekt wird über ihre 'projectId' dem Projekt und über ihre numerische 'zustandId' ('stateId') exakt einem Projekt-Zustand aus der 'ProjectState'-Tabelle zugeordnet!
  * Übergib bei 'erstelle_aufgabe' und 'aktualisiere_aufgabe' IMMER 'projectId' UND 'zustandId' (die numerische ID des Zustands aus 'hole_projekte' oder 'verwalte_projekt_zustaende'; alternativ 'zustandName', das automatisch in die 'zustandId' aufgelöst wird).
  * VERWENDE NIEMALS 'aufgabenlisteTitel' ('listTitle') oder Tags für Projekt-Zustände! 'aufgabenlisteTitel' hat nichts mit Projekt-Zuständen zu tun!
  * Prüfe bei Fragen zu einem Projekt zuerst per 'hole_projekte' die tatsächlichen 'zustaende' (mit ihren 'zustandId's) und die 'zustandId' / 'zustandName' der Aufgaben.

E-MAIL-ENTWÜRFE, ANTWORTEN & ANHÄNGE (STRENGSTE PFLICHT):
- Wenn der Benutzer eine E-Mail verfassen, vorbereiten, vorschlagen oder mit Anhang versenden möchte:
  * Rufe IMMER das Werkzeug 'schlage_mail_vor' auf (oder 'schlage_mail_antwort_vor' beim Antworten auf eingegangene Mails)!
  * Nutze dafür NIEMALS das generische 'erstelle_benachrichtigung', sondern IMMER 'schlage_mail_vor'!
  * Gib 'empfaenger', 'betreff' und im Parameter 'inhalt' den VOLLSTÄNDIGEN Text der E-Mail (inkl. freundlicher Anrede, Fließtext, Grußformel) an.
  * E-MAIL-ANHÄNGE WERDEN VOLLSTÄNDIG UNTERSTÜTZT! Wenn der Benutzer einen Anhang wünscht (z. B. Dokument, PDF, Textdatei, Bild):
    1. Suche die Datei per 'suche_dateien' (oder nimm die vom Benutzer genannte oder im Chat verlinkte Datei).
    2. Übergib den/die Dateinamen (z. B. ['TermindetailsAgenda.pdf'] oder ['Anschreiben_Vorlage.txt']) im Parameter 'anhaenge' als Array an 'schlage_mail_vor'!
    3. Behaupte NIEMALS, dass Anhänge im Testmodus oder technisch nicht möglich seien oder nur "textlich beschrieben" werden! Das System hängt die Dateien physisch an die E-Mail an und bietet dem Benutzer interaktive Knöpfe ('Ja, abschicken' und 'Bearbeiten').
  * CHAT-NACHRICHT DER KI BEI E-MAIL-ENTWÜRFEN (STRENGSTE REGEL):
    - Erkläre in deiner Chat-Nachricht kurz und freundlich den Kontext und worum es in dem Entwurf geht (Empfänger, Betreff, Zweck des Schreibens, welche Anhänge verknüpft sind).
    - DU DARFST DEN E-MAIL-TEXT NIEMALS NOCHMAL IN DEINER CHAT-NACHRICHT WIEDERHOLEN! (Kein 'E-Mail-Inhalt: > Sehr geehrte Damen und Herren...'). Der E-Mail-Text wird bereits direkt in der interaktiven Entwurfskarte unter deiner Nachricht angezeigt. Eine doppelte Wiedergabe des E-Mail-Texts in der Chat-Nachricht ist strengstens untersagt!

WICHTIGE VERHALTENSREGELN & VERHINDERUNG VON SCHEINERFOLGEN:
- Du darfst NIEMALS dem Benutzer behaupten, dass eine Aufgabe, ein Termin, ein Timer/Wecker, ein Projekt oder eine Notiz erstellt, geändert oder gelöscht wurde, wenn du das entsprechende Werkzeug NICHT aufgerufen hast ODER wenn der Aufruf fehlgeschlagen ist (status: 'error')!
- Gib NIEMALS Scheinerfolgsmeldungen aus. Jede Erfolgsmeldung muss auf einer echten Rückmeldung des Werkzeugs basieren. Wenn ein Tool fehlschlägt, informiere den Benutzer ehrlich über den Fehler.
- TRANSPARENTE ENTWÜRFE & BENACHRICHTIGUNGEN:
  Wenn du 'erstelle_benachrichtigung' für eine Bestätigung oder Rückfrage aufrufst (z. B. Ankündigung veröffentlichen, Mail senden), MUSST du im Parameter 'nachricht' zwingend den VOLLSTÄNDIGEN Text/Inhalt des Entwurfs (Titel, kompletter Ankündigungstext, Kanal, Pings etc.) als lesbare Vorschau einfügen! Behalte den Entwurfstext niemals für dich!

- TRANSPARENTE ERSTELLUNGSBERICHTE: Wenn du etwas anlegst (Aufgabe, Termin, Timer/Wecker), berichte dem Benutzer detailliert und transparent, was genau erstellt wurde:
  * Bei Aufgaben: Nenne Titel, Fälligkeitsdatum/Uhrzeit, Aufgabenliste/Projekt und ob sie 'In Planung' ist.
  * Bei Terminen: Nenne Titel, Datum, Start- und Enduhrzeit sowie Wiederholung (falls vorhanden).
  * Bei Timern/Weckern: Nenne Ablaufzeit bzw. Dauer und Bezeichnung.
- Sei bei Antworten stets präzise, ehrlich, hilfsbereit und antworte auf Deutsch.` }]
      }
    });

    const chat = model.startChat({
      history: chatHistory
    });

    // Resolve any app:// link entities in the message and inject their contents as context for the AI
    let resolvedContext = "";
    if (message) {
      const entityRegex = /\[([^\]]+)\]\((app:\/\/([^/]+)\/([^)]+))\)/g;
      let match;
      const resolvedEntities = new Set<string>();

      while ((match = entityRegex.exec(message)) !== null) {
        const linkText = match[1];
        const fullUrl = match[2];
        const type = match[3];
        const rawId = match[4];
        const entityKey = `${type}-${rawId}`;

        if (!resolvedEntities.has(entityKey)) {
          resolvedEntities.add(entityKey);
          try {
            if (type === "event") {
              let eventRecord: any = null;
              if (rawId.startsWith("rec-")) {
                const parts = rawId.split("-");
                const patId = parseInt(parts[1], 10);
                const occMs = parseInt(parts[2], 10);
                const pattern = await prisma.recurrencePattern.findUnique({ where: { id: patId } });
                if (pattern) {
                  const durMs = new Date(pattern.originalEnd).getTime() - new Date(pattern.originalStart).getTime();
                  const occStart = new Date(occMs);
                  const occEnd = new Date(occMs + durMs);
                  const override = await prisma.event.findFirst({
                    where: { recurrenceId: patId, originalOccurrenceDate: occStart }
                  });
                  if (override && !override.isDeleted) {
                    eventRecord = override;
                  } else if (!override?.isDeleted) {
                    eventRecord = {
                      id: rawId,
                      title: pattern.title,
                      description: pattern.description,
                      start: occStart,
                      end: occEnd,
                      location: pattern.location,
                      isAllDay: pattern.isAllDay
                    };
                  }
                }
              } else {
                const cleanId = rawId.replace(/^event-/, "").replace(/^app:\/\/event\//, "");
                const numId = parseInt(cleanId, 10);
                if (!isNaN(numId)) {
                  eventRecord = await prisma.event.findUnique({ where: { id: numId } });
                }
              }

              if (eventRecord) {
                const sDate = new Date(eventRecord.start);
                const eDate = new Date(eventRecord.end);
                const dateStr = formatGermanDate(sDate);
                const startTimeStr = formatGermanTime(sDate);
                const endTimeStr = formatGermanTime(eDate);
                const dateIso = sDate.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
                const loc = eventRecord.location || "Nicht angegeben";

                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Kalendertermin\nTitel: "${eventRecord.title}" (ID: ${eventRecord.id})\nDatum: ${dateStr} (${dateIso})\nStartzeit: ${eventRecord.isAllDay ? "Ganztägig" : `${startTimeStr} Uhr (deutsche Lokalzeit)`}\nEndzeit: ${eventRecord.isAllDay ? "Ganztägig" : `${endTimeStr} Uhr (deutsche Lokalzeit)`}\n${!eventRecord.isAllDay ? `Zeitspanne: ${startTimeStr} - ${endTimeStr} Uhr (deutsche Lokalzeit)\n` : ""}Standort / Adresse: ${loc}\nBeschreibung: ${eventRecord.description || "Keine"}\n\nSTRIKTE ANWEISUNG FÜR DIE KI FÜR WEGZEITEN / ROUTENPLANUNG ZU DIESEM TERMIN:\n- Dieser Termin findet nach deutscher Lokalzeit von ${startTimeStr} Uhr bis ${endTimeStr} Uhr statt!\n- Wenn der Nutzer eine HINFAHRT oder Anreise wünscht:\n  * Zielort: "${loc}"\n  * Gewünschte Ankunftszeit am Zielort ist ${startTimeStr} Uhr (Parameter ankunftszeit="${startTimeStr}" oder ankunftszeit="${dateIso}T${startTimeStr}:00")!\n- Wenn der Nutzer eine RÜCKFAHRT oder Heimweg wünscht:\n  * Startort: "${loc}"\n  * Gewünschte Abfahrtszeit am Startort ist ${endTimeStr} Uhr (Parameter abfahrtszeit="${endTimeStr}" oder abfahrtszeit="${dateIso}T${endTimeStr}:00")!\n- Wandle diese Zeiten (${startTimeStr} und ${endTimeStr}) NIEMALS in UTC um und ziehe keine Stunden ab!\n`;
              } else {
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Kalendertermin\nID: ${rawId}\n`;
              }
            } else if (type === "travel") {
              const cleanId = rawId.replace(/^rec-/, "").replace(/^event-/, "");
              const numId = parseInt(cleanId, 10);
              let eventRecord: any = null;
              if (!isNaN(numId)) {
                eventRecord = await prisma.event.findUnique({ where: { id: numId } });
              }
              if (eventRecord) {
                const sDate = new Date(eventRecord.start);
                const eDate = new Date(eventRecord.end);
                const dStr = formatGermanDate(sDate);
                const sTime = formatGermanTime(sDate);
                const eTime = formatGermanTime(eDate);
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Wegezeit / Fahrt (Eigenständiger Termin)\nTitel: "${eventRecord.title}" (ID: ${eventRecord.id})\nDatum: ${dStr}\nReisezeit: ${sTime} Uhr bis ${eTime} Uhr (deutsche Lokalzeit)\nStart: ${sTime} Uhr\nAnkunft: ${eTime} Uhr\nStartort: ${eventRecord.travelOriginLocation || "Nicht angegeben"}\nZielort: ${eventRecord.location || "Nicht angegeben"}\nVerkehrsmittel: ${eventRecord.travelMode || "transit"}\nHinweis für KI: Dies ist eine Wegezeit. Du kannst sie unabhängig mit 'bearbeite_termin' (eventId="${eventRecord.id}") anpassen oder verschieben.\n`;
              } else {
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Wegezeit / Fahrt\nBezeichnung: ${linkText}\nID: ${rawId}\nHinweis für KI: Dies ist eine Wegezeit. Sie kann als eigenständiger Termin per 'bearbeite_termin' angepasst werden.\n`;
              }
            } else if (type === "pause") {
              resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Pause / Freies Zeitfenster im Tagesablauf\nBezeichnung: ${linkText}\nID / Zeitfenster: ${rawId}\nHinweis für KI: Der Nutzer verlinkt diese freie Pause im Kalender (z.B. um in dieser freien Zeit einen neuen Termin einzutragen oder eine Aufgabe einzuplanen). Wenn der Nutzer einen Termin in dieser Pause erstellen möchte, nutze das Tool 'fuege_termin_hinzu' und wähle die Uhrzeit passend innerhalb des Zeitfensters dieser Pause.\n`;
            } else if (type === "task") {
              const numId = parseInt(rawId, 10);
              let taskRecord: any = null;
              if (!isNaN(numId)) {
                taskRecord = await prisma.task.findUnique({
                  where: { id: numId },
                  include: {
                    project: { include: { states: { orderBy: { sortOrder: "asc" } } } },
                    state: true
                  }
                });
              }
              if (taskRecord) {
                const dueStr = taskRecord.due
                  ? `${formatGermanDate(new Date(taskRecord.due))} um ${formatGermanTime(new Date(taskRecord.due))} Uhr (deutsche Lokalzeit)`
                  : "Keine Fälligkeit";
                const stateInfo = taskRecord.state
                  ? `${taskRecord.state.icon} ${taskRecord.state.name} (zustandId: ${taskRecord.state.id})`
                  : "Kein Projekt-Zustand zugeordnet (zustandId: null)";
                const availStates = taskRecord.project?.states?.length
                  ? taskRecord.project.states.map((s: any) => `${s.icon} "${s.name}" (zustandId: ${s.id})`).join(", ")
                  : "Keine eigenen Projekt-Zustände eingerichtet";
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Aufgabe\nTitel: "${taskRecord.title}" (ID: ${taskRecord.id})\nFälligkeit: ${dueStr}\nErledigt: ${taskRecord.completed ? "Ja" : "Nein"}\nProjekt: ${taskRecord.project ? `"${taskRecord.project.name}" (projectId: ${taskRecord.project.id})` : "Kein Projekt"}\nAktueller Projekt-Zustand: ${stateInfo}\nVerfügbare Zustände im Projekt: ${availStates}\nNotizen: ${taskRecord.notes || "Keine"}\n`;
              }
            } else if (type === "project") {
              const numId = parseInt(rawId, 10);
              let projRecord: any = null;
              if (!isNaN(numId)) {
                projRecord = await prisma.project.findUnique({
                  where: { id: numId },
                  include: {
                    states: { orderBy: { sortOrder: "asc" } },
                    tasks: { where: { isDeleted: false }, include: { state: true } },
                    notes: { where: { isDeleted: false } }
                  }
                });
              }
              if (projRecord) {
                const statesStr = projRecord.states?.length
                  ? projRecord.states.map((s: any) => `${s.icon} "${s.name}" (zustandId: ${s.id}${s.isDefault ? ", Standard" : ""})`).join(", ")
                  : "Keine eigenen Projekt-Zustände in ProjectState-Tabelle eingerichtet";
                const tasksStr = projRecord.tasks?.length
                  ? projRecord.tasks.map((t: any) => `  * [ID ${t.id}] "${t.title}" -> zustandId: ${t.stateId ?? "null"} (${t.state ? t.state.name : "kein Zustand"}), erledigt: ${t.completed}`).join("\n")
                  : "  Keine Aufgaben";
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Projekt\nName: "${projRecord.name}" (projectId: ${projRecord.id})\nKonfigurierte Projekt-Zustände (ProjectState): ${statesStr}\nAufgaben im Projekt:\n${tasksStr}\n`;
              }
            } else if (type === "timer") {
              const numId = parseInt(rawId, 10);
              let timerRecord: any = null;
              if (!isNaN(numId)) {
                timerRecord = await prisma.timer.findUnique({ where: { id: numId } });
              }
              if (timerRecord) {
                const targetStr = timerRecord.targetTime
                  ? `${formatGermanDate(new Date(timerRecord.targetTime))} um ${formatGermanTime(new Date(timerRecord.targetTime))} Uhr (deutsche Lokalzeit)`
                  : "Keine Ablaufzeit";
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Timer / Wecker\nBezeichnung: "${timerRecord.label || "Timer"}" (ID: ${timerRecord.id})\nAblaufzeit: ${targetStr}\nStatus: ${timerRecord.status}\n`;
              }
            } else if (type === "journal") {
              const numId = parseInt(rawId, 10);
              let entryRecord: any = null;
              if (!isNaN(numId)) {
                entryRecord = await prisma.diaryEntry.findUnique({ where: { id: numId } });
              }
              if (entryRecord) {
                const dateStr = formatGermanDate(new Date(entryRecord.date));
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: Tagebucheintrag\nTitel: "${entryRecord.title || "Tagebucheintrag"}" (ID: ${entryRecord.id})\nDatum: ${dateStr}\nInhalt: ${entryRecord.content}\n`;
              }
            } else if (type === "mail") {
              const numId = parseInt(rawId, 10);
              let mailRecord: any = null;
              if (!isNaN(numId)) {
                mailRecord = await prisma.cachedEmail.findUnique({ where: { id: numId } });
              }
              if (mailRecord) {
                const dateStr = mailRecord.date
                  ? `${formatGermanDate(new Date(mailRecord.date))} um ${formatGermanTime(new Date(mailRecord.date))} Uhr (deutsche Lokalzeit)`
                  : "Unbekannt";
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\nTyp: E-Mail\nBetreff: "${mailRecord.subject}" (ID: ${mailRecord.id})\nVon: ${mailRecord.from}\nAn: ${mailRecord.to}\nDatum: ${dateStr}\nInhalt:\n${(mailRecord.bodyText || mailRecord.snippet || "").slice(0, 1000)}\n`;
              }
            } else if (type === "media" || type === "file") {
              const numId = parseInt(rawId, 10);
              const mediaItem = await prisma.mediaItem.findUnique({
                where: { id: numId },
                include: {
                  persons: { include: { person: { include: { aliases: true } } } },
                  projects: { include: { project: true } }
                }
              });
              if (mediaItem) {
                resolvedContext += `\n--- Verlinkte Datei / Foto: [${linkText}] (${fullUrl}) ---\nTyp: Datei / Foto (${mediaItem.category})\nDateiname: "${mediaItem.fileName}"\nTitel: "${mediaItem.title}"\nFormat: ${mediaItem.fileType} (${formatFileSize(mediaItem.fileSize || 0)})\n${mediaItem.description ? `Beschreibung: ${mediaItem.description}\n` : ""}${mediaItem.extractedText ? `Dokumentinhalt:\n${mediaItem.extractedText.slice(0, 2500)}\n` : ""}\nHINWEIS FÜR DIE KI: Diese Datei stammt aus dem System ("Dateien & Fotos"). Wenn eine E-Mail mit dieser Datei verfasst oder vorgeschlagen werden soll, übergib den Dateinamen "${mediaItem.fileName}" zwingend im Parameter 'anhaenge' an 'schlage_mail_vor' oder 'sende_mail'.\n`;
              } else {
                resolvedContext += `\n--- Verlinkte Datei: [${linkText}] (${fullUrl}) ---\nID: ${rawId}\n`;
              }
            } else {
              const numId = parseInt(rawId, 10);
              const entity = await pluginManager.resolveEntity(type, isNaN(numId) ? rawId : numId);
              if (entity) {
                const sanitized = sanitizeEntityDatesForGermanContext(entity);
                resolvedContext += `\n--- Verlinktes Element: [${linkText}] (${fullUrl}) ---\n${JSON.stringify(sanitized, null, 2)}\n`;
              }
            }
          } catch (err) {
            console.error(`Fehler beim Auflösen der Entity ${type}:${rawId}`, err);
          }
        }
      }
    }

    // Baue die Nachricht für Gemini zusammen
    const promptParts: any[] = [];
    if (message) {
      let promptText = message;
      if (resolvedContext) {
        promptText += `\n\n[Kontext der verlinkten Elemente]:\n${resolvedContext}`;
      }
      promptParts.push(promptText);
    } else if (attachments && attachments.length > 0) {
      promptParts.push("Analysiere diesen Anhang."); // Default prompt if only image is sent
    }
    if (audio) {
      console.log("Empfange Audio-Daten (Base64 Länge):", audio.length);
      promptParts.push({
        inlineData: {
          data: audio,
          mimeType: "audio/webm"
        }
      });
    }

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      console.log(`Verarbeite ${attachments.length} Anhänge für Gemini...`);
      attachments.forEach((att: any, index: number) => {
        if (att.base64 && att.mimeType) {
          const isText = att.mimeType.startsWith("text/") ||
            (att.name && (att.name.endsWith(".txt") || att.name.endsWith(".md") || att.name.endsWith(".csv")));
          if (isText) {
            try {
              const textContent = Buffer.from(att.base64, "base64").toString("utf-8");
              promptParts.push(`\n[Inhalt der angehängten Textdatei "${att.name || 'Dokument.txt'}"]:\n${textContent}\n`);
            } catch (_) {
              promptParts.push({
                inlineData: {
                  data: att.base64,
                  mimeType: "text/plain"
                }
              });
            }
          } else {
            promptParts.push({
              inlineData: {
                data: att.base64,
                mimeType: att.mimeType
              }
            });
          }
        } else {
          console.warn(`Anhang ${index} ist unvollständig:`, { hasBase64: !!att.base64, mimeType: att.mimeType });
        }
      });
    }

    console.log("Sende Anfrage an Gemini mit", promptParts.length, "Teilen.");
    if (promptParts.length === 0) {
      throw new Error("Kein Inhalt (Text oder Bilder) zum Senden vorhanden.");
    }
    const result = await chat.sendMessage(promptParts);
    const response = result.response;
    let aiText = "";
    let currentResponse = response;
    let widgetData: any = null;
    const executedTools: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string }[] = [];
    const createdNotificationIds: number[] = [];

    // Schleife für Tool-Chaining
    let step = 0;
    const MAX_STEPS = 5;
    while (step < MAX_STEPS) {
      const cand = currentResponse.candidates?.[0];
      if (cand?.finishReason === 'MALFORMED_FUNCTION_CALL') {
        console.warn("MALFORMED_FUNCTION_CALL erkannt. Sende Korrekturaufforderung an das Modell...");
        const correctivePrompt = "Hinweis: Der vorherige Funktionsaufruf enthielt ungültigen Code oder fehlerhafte Argumente. Bitte rufe das Werkzeug erneut auf und verwende ausschließlich reine JSON-Werte (Strings oder Zahlen) für alle Parameter.";
        const retryStep = await chat.sendMessage(correctivePrompt);
        currentResponse = retryStep.response;
        step++;
        continue;
      }

      const calls = currentResponse.functionCalls();
      if (!calls || calls.length === 0) {
        try {
          aiText = currentResponse.text();
        } catch (e) {
          aiText = "";
        }
        break;
      }

      console.log(`KI ruft ${calls.length} Tools auf (Schritt ${step + 1}):`);

      const functionResponses = [];
      for (const call of calls) {
        let toolResult: any;
        const toolLog: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string } = {
          name: call.name,
          args: call.args,
          status: "success"
        };
        activeTools.push({ name: call.name, args: call.args });

        // Wenn wir das Limit erreichen, verweigern wir weitere Aufrufe und zwingen das Modell zu einer Antwort
        if (step === MAX_STEPS - 1) {
          console.log(`  - Tool-Limit erreicht. Verweigere Ausführung für: ${call.name}`);
          toolLog.status = "limit_reached";
          toolLog.message = "Limit erreicht";
          toolResult = {
            status: "limit_reached",
            message: "Such-Limit für diese Runde erreicht. Bitte fasse alle bisher gesammelten Informationen kurz zusammen und antworte dem Benutzer direkt."
          };
        } else {
          if (conversationId) {
            if (!call.args) (call as any).args = {};
            if (!(call.args as any).conversationId) {
              (call.args as any).conversationId = conversationId;
            }
          }
          console.log(`  - Rufe Tool auf: ${call.name}`, call.args);
          try {
            toolResult = await pluginManager.executeTool(call.name, call.args);
            console.log("    Tool Ergebnis empfangen:", { name: call.name, hasWidget: !!toolResult?.type });

            if (toolResult && toolResult.notificationId) {
              createdNotificationIds.push(toolResult.notificationId);
              if (conversationId) {
                try {
                  await prisma.agentNotification.update({
                    where: { id: toolResult.notificationId },
                    data: { conversationId }
                  });
                } catch (_) { }
              }
            }

            if (toolResult && toolResult.status === "error") {
              toolLog.status = "error";
              toolLog.message = toolResult.message || "Fehler";
            }

            if (toolResult && toolResult.type) {
              widgetData = toolResult;
            }
          } catch (err: any) {
            console.error("    Tool-Fehler:", err);
            toolLog.status = "error";
            toolLog.message = err.message || "Interner Tool-Fehler.";
            toolResult = { status: "error", message: toolLog.message };
          }
        }
        executedTools.push(toolLog);

        // Sende Tool-Ergebnis zurück an Gemini (ohne die riesigen Base64-Daten)
        let responseToGemini = toolResult;
        if (toolResult && toolResult.type === 'image_widget' && toolResult.url.startsWith('data:')) {
          responseToGemini = { ...toolResult, url: "[BILD_DATEN_GESENDET]" };
        }

        functionResponses.push({
          functionResponse: { name: call.name, response: responseToGemini }
        });
      }

      let nextStep: any;
      try {
        nextStep = await chat.sendMessage(functionResponses);
      } catch (chatSendErr: any) {
        if (chatSendErr.message && chatSendErr.message.includes("Role 'function' is not supported")) {
          (chat as any)._history.push({
            role: "user",
            parts: functionResponses
          });
          nextStep = await model.generateContent({
            contents: (chat as any)._history
          });
          if (nextStep.response && nextStep.response.candidates && nextStep.response.candidates[0] && nextStep.response.candidates[0].content) {
            (chat as any)._history.push(nextStep.response.candidates[0].content);
          }
        } else {
          console.warn(`Fehler beim Senden der Function-Responses mit Modell '${modelName}':`, chatSendErr.message);
          if (modelName !== "gemini-3.8-flash") {
            console.log("Führe automatischen Fallback auf 'gemini-3.8-flash' aus...");
            try {
              const fallbackModel = genAI.getGenerativeModel({
                model: "gemini-3.8-flash",
                tools: chatTools as any,
                toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO }, includeServerSideToolInvocations: true } as any,
                generationConfig: { thinkingConfig: { thinkingBudget: 0 } } as any
              });
              const fallbackChat = fallbackModel.startChat({ history: chatHistory });
              await fallbackChat.sendMessage(promptParts);
              nextStep = await fallbackChat.sendMessage(functionResponses);
            } catch (fallbackErr: any) {
              console.error("Fallback ebenfalls fehlgeschlagen:", fallbackErr.message);
              throw chatSendErr;
            }
          } else {
            throw chatSendErr;
          }
        }
      }
      currentResponse = nextStep.response;
      step++;
    }

    // Falls die Schleife das Limit erreicht hat und kein Text generiert wurde:
    if (!aiText) {
      try {
        aiText = currentResponse.text();
      } catch (e) {
        aiText = "Ich habe die gewünschten Informationen gesucht, konnte aber keine passende Antwort zusammenfassen.";
      }
    }

    // Kompakte, zugeklappte Zusammenfassung der Aktionen anhängen
    let createdNotifications: any[] = [];
    if (conversationId || createdNotificationIds.length > 0) {
      createdNotifications = await prisma.agentNotification.findMany({
        where: {
          OR: [
            ...(conversationId ? [{ conversationId }] : []),
            ...(createdNotificationIds.length > 0 ? [{ id: { in: createdNotificationIds } }] : [])
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 5
      });
    }
    const latestNotif = createdNotifications.length > 0 ? createdNotifications[0] : null;

    // Wenn ein E-Mail-Entwurf erstellt wurde, entferne eine evtl. noch enthaltene doppelte Wiedergabe des E-Mail-Inhalts aus dem KI-Freitext
    const hasMailDraft = createdNotifications.some((n: any) =>
      (n.actionData && ((n.actionData as any).actionType === "send_mail" || (n.actionData as any).actionType === "send_mail_reply")) ||
      (n.title && n.title.toLowerCase().includes("mail"))
    );
    if (hasMailDraft && aiText) {
      aiText = aiText.replace(/\*{0,2}E-Mail-Inhalt:?\*{0,2}\s*(?:\r?\n\s*>[^\n]*)+/gi, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    // Google Search Grounding Metadaten erfassen (Quellen & Suchanfragen)
    const groundingMeta = currentResponse?.candidates?.[0]?.groundingMetadata;
    if (groundingMeta) {
      if (groundingMeta.webSearchQueries?.length) {
        for (const query of groundingMeta.webSearchQueries) {
          activeTools.push({ name: "google_suche", args: { anfrage: query } });
          executedTools.push({
            name: "google_suche",
            args: { anfrage: query },
            status: "success",
            message: `Web-Suche nach: "${query}"`
          });
        }
      }
      if (groundingMeta.groundingChunks?.length) {
        const sources: string[] = [];
        const seenUrls = new Set<string>();
        for (const chunk of groundingMeta.groundingChunks) {
          const web = (chunk as any).web;
          if (web?.uri && !seenUrls.has(web.uri)) {
            seenUrls.add(web.uri);
            const title = web.title || "Quelle";
            sources.push(`[${title}](${web.uri})`);
          }
        }
        if (sources.length > 0 && !aiText.includes("🔍 **Quellen:**")) {
          aiText = `${aiText.trim()}\n\n🔍 **Quellen:** ${sources.slice(0, 5).join(' • ')}`;
        }
      }
    }

    if (executedTools.length > 0) {
      aiText = `${aiText.trim()}${AgentRunService.formatExecutedToolsSummary(executedTools)}`;
    }

    // Speichere KI-Antwort in DB
    if (aiText) {
      await prisma.chatMessage.create({
        data: { role: "ai", text: aiText, conversationId }
      });
    }

    res.json({
      text: aiText,
      conversationId,
      widget: widgetData,
      notification: latestNotif,
      notifications: createdNotifications
    });

  } catch (error: any) {
    console.error("Detailed Error:", error);
    const errMessage = error?.message || String(error) || "Unbekannter Fehler";
    const errStack = error?.stack || "";
    const errDetails = JSON.stringify(
      {
        name: error?.name || "Error",
        message: errMessage,
        status: error?.status || error?.statusCode || undefined,
        errorDetails: error?.errorDetails || undefined,
        stack: errStack
      },
      null,
      2
    );
    res.status(500).json({
      text: `Fehler: ${errMessage}`,
      error: errMessage,
      details: errDetails
    });
  }
});


// =========================================================================
// Client-Side SPA Routing Endpoints & Fallback
// =========================================================================
const frontendSpaRoutes = [
  '/',
  '/chat',
  '/chat/:id',
  '/kalender',
  '/kalender/:date',
  '/calendar',
  '/calendar/:date',
  '/mail',
  '/mail/:id',
  '/mails',
  '/mails/:id',
  '/projekte',
  '/projekte/:id',
  '/projects',
  '/projects/:id',
  '/gedaechtnis',
  '/gedaechtnis/:id',
  '/memory',
  '/memory/:id',
  '/personen',
  '/personen/:id',
  '/orte',
  '/orte/:id',
  '/locations',
  '/locations/:id',
  '/fotos',
  '/photos',
  '/dokumente',
  '/docs',
  '/medien',
  '/media',
  '/briefing',
  '/timer',
  '/verlauf',
  '/history',
  '/einstellungen'
];

frontendSpaRoutes.forEach((route) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "index.html"));
  });
});

// General SPA fallback for client-side routing on any non-API GET request
app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api") &&
    !req.path.startsWith("/sse") &&
    !req.path.startsWith("/messages") &&
    !req.path.startsWith("/conversations") &&
    !req.path.startsWith("/widgets") &&
    !req.path.startsWith("/uploads") &&
    !req.path.startsWith("/settings") &&
    !req.path.startsWith("/alerts") &&
    !req.path.startsWith("/apps") &&
    !req.path.includes(".")
  ) {
    return res.sendFile(path.join(process.cwd(), "public", "index.html"));
  }
  next();
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`KI-System Server läuft auf Port ${PORT}`);

  // Automatische Datenmigration zuerst ausführen (stellt sicher, dass alle Tabellen/Spalten existieren)
  await runAutomaticMigration(prisma);

  // Dynamische Tools initialisieren
  await pluginManager.init();

  // Agent Run Hook für neu eingehende E-Mails registrieren
  MailService.onNewEmail = (createdMail, dbPrisma) => {
    console.log(`[Mail Hook] 📬 Neue E-Mail empfangen: #${createdMail.id} "${createdMail.subject}". Starte Agent Run...`);
    AgentRunService.queueEmailRun(createdMail.id, dbPrisma, pluginManager);
  };

  // Periodischer Hintergrund-Sync für E-Mails alle 3 Minuten
  setInterval(() => {
    MailService.syncAllAccounts(prisma).then(res => {
      if (res.newEmails && res.newEmails.length > 0) {
        console.log(`[Mail AutoSync] 📬 ${res.newEmails.length} neue ungelesene E-Mail(s) empfangen!`);
      }
    }).catch(err => {
      console.warn("[Mail AutoSync] Hintergrund-Sync fehlgeschlagen:", err?.message || err);
    });
  }, 3 * 60 * 1000);

  // Minütliche Echtzeit-Überwachung von anstehenden DB-Zugfahrten (60 Min vor Abfahrt)
  setInterval(() => {
    runTrainTripMonitor(prisma).then(res => {
      if (res.notifications && res.notifications.length > 0) {
        console.log(`[Bahn Monitor] 🚆 ${res.notifications.length} Fahrtwarnung(en):`, res.notifications);
      }
    }).catch(err => {
      console.warn("[Bahn Monitor] Überwachungsfehler:", err?.message || err);
    });
  }, 60 * 1000);

  // Output local network IP addresses to let the user know what to enter in the mobile app settings
  const nets = os.networkInterfaces();
  console.log("\n>>> LOKALE IP-ADRESSEN FÜR DIE MOBILE APP <<<");
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n");
});


