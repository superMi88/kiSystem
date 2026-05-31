import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { exec } from "child_process";

import { PluginManager } from "./plugins/index.js";
import { getSettings, saveSettings } from "./settings.js";

dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const pluginManager = new PluginManager(prisma);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

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
  const conversations = await prisma.conversation.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(conversations);
});

app.get("/conversations/:id", async (req, res) => {
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: req.params.id },
    orderBy: { createdAt: 'asc' }
  });
  res.json(messages);
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
  const widgets = await pluginManager.getAllTopWidgets();
  res.json(widgets);
});

app.post("/tasks/complete", async (req, res) => {
  const { tasklistId, taskId } = req.body;
  if (!tasklistId || !taskId) {
    return res.status(400).json({ error: "tasklistId und taskId sind erforderlich." });
  }
  try {
    const { GoogleCalendarService } = await import("./plugins/Calendar/googleService.js");
    const googleService = new GoogleCalendarService(prisma);
    await googleService.completeTask(tasklistId, taskId);
    res.json({ success: true, message: "Aufgabe erfolgreich erledigt." });
  } catch (e: any) {
    console.error("Fehler beim Erledigen der Aufgabe:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Settings API
 */
app.get("/settings", (req, res) => {
  res.json(getSettings());
});

app.post("/settings", (req, res) => {
  const { hotkey, disabledPlugins } = req.body;
  const current = getSettings();
  const updated = {
    hotkey: hotkey !== undefined ? hotkey : current.hotkey,
    disabledPlugins: disabledPlugins !== undefined ? disabledPlugins : current.disabledPlugins
  };
  saveSettings(updated);
  res.json(updated);
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

/**
 * Google Auth Callback
 */
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (code) {
    try {
      // Wir nutzen eine temporäre Instanz des Service zum Speichern
      const { GoogleCalendarService } = await import("./plugins/Calendar/googleService.js");
      const googleService = new GoogleCalendarService(prisma);
      await googleService.saveTokens(code as string);
      res.send("<h1>Erfolg!</h1><p>Dein Google Kalender ist jetzt verbunden. Du kannst dieses Fenster schließen.</p>");
    } catch (e: any) {
      res.status(500).send("Fehler beim Speichern der Tokens: " + e.message);
    }
  } else {
    res.status(400).send("Kein Code erhalten.");
  }
});


/**
 * Gemini AI Integration
 */
app.post("/chat", async (req, res) => {
  let { message, audio, attachments, conversationId } = req.body;
  console.log("Chat Request Body:", { message, hasAudio: !!audio, attachmentsCount: attachments?.length, conversationId });

  try {
    // Erstelle neue Konversation, falls keine existiert
    if (!conversationId) {
      const title = message ? (message.substring(0, 30) + "...") : "Sprachnachricht";
      const newConv = await prisma.conversation.create({
        data: { title }
      });
      conversationId = newConv.id;
    }

    // Speichere Benutzer-Nachricht in DB
    if (message || audio || (attachments && attachments.length > 0)) {
      await prisma.chatMessage.create({
        data: { 
          role: "user", 
          text: message || (attachments && attachments.length > 0 ? "🖼️ Bild-Anhang" : "🎤 Sprachnachricht"), 
          conversationId 
        }
      });
    }

    const now = new Date();
    const dateString = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeString = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const modelName = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ functionDeclarations: pluginManager.getGeminiTools() } as any],
      systemInstruction: {
        role: "system",
        parts: [{ text: `Du bist ein hilfreicher PC-Assistent. 
Heute ist ${dateString}, es ist ${timeString} Uhr. 
Nutze dieses Datum als Basis für relative Zeitangaben wie 'heute', 'morgen' oder 'nächste Woche'. 
Wenn ein Benutzer eine Uhrzeit nennt, verwende beim Erstellen von Terminen bitte das volle ISO-Format (YYYY-MM-DDTHH:mm:ss).
Antworte kurz und präzise.` }]
      }
    });

    const chatHistory = conversationId ? (await prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })) : [];

    const chat = model.startChat({
      history: chatHistory
    });
    
    // Baue die Nachricht für Gemini zusammen
    const promptParts: any[] = [];
    if (message) {
      promptParts.push(message);
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
          promptParts.push({
            inlineData: {
              data: att.base64,
              mimeType: att.mimeType
            }
          });
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

    // Schleife für Tool-Chaining
    let step = 0;
    while (step < 5) {
      const calls = currentResponse.functionCalls();
      if (!calls || calls.length === 0) {
        aiText = currentResponse.text();
        break;
      }

      const call = calls[0];
      console.log(`KI ruft Tool auf (Schritt ${step + 1}):`, call.name, call.args);
      
      let toolResult: any;
      try {
        toolResult = await pluginManager.executeTool(call.name, call.args);
        console.log("Tool Ergebnis empfangen:", { name: call.name, hasWidget: !!toolResult?.type });
        
        // Falls das Tool ein Widget zurückgibt, speichern wir es für das Frontend
        if (toolResult && toolResult.type) {
          widgetData = toolResult;
        }
      } catch (err) {
        console.error("Tool-Fehler:", err);
        toolResult = { status: "error", message: "Interner Tool-Fehler." };
      }

      // Sende Tool-Ergebnis zurück an Gemini (ohne die riesigen Base64-Daten)
      let responseToGemini = toolResult;
      if (toolResult && toolResult.type === 'image_widget' && toolResult.url.startsWith('data:')) {
        responseToGemini = { ...toolResult, url: "[BILD_DATEN_GESENDET]" };
      }

      const nextStep = await chat.sendMessage([{
        functionResponse: { name: call.name, response: responseToGemini }
      }]);
      currentResponse = nextStep.response;
      step++;
    }

    // Speichere KI-Antwort in DB
    if (aiText) {
      await prisma.chatMessage.create({
        data: { role: "ai", text: aiText, conversationId }
      });
    }

    res.json({ text: aiText, conversationId, widget: widgetData });

  } catch (error: any) {
    console.error("Detailed Error:", error);
    res.status(500).json({ text: `Fehler: ${error.message || "Unbekannter Fehler"}` });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KI-System Server läuft auf Port ${PORT}`);
});


