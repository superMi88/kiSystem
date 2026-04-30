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

dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = new Server(
  { name: "ki-system-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "schalte_licht",
      description: "Schaltet das Licht ein oder aus.",
      inputSchema: {
        type: "object",
        properties: { status: { type: "string", enum: ["on", "off"] } },
        required: ["status"],
      },
    },
    {
      name: "pruefe_licht",
      description: "Prüft den aktuellen Status des Lichts.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "schalte_licht") {
      const status = args?.status as string;
      await prisma.lichtStatus.upsert({
        where: { id: 1 },
        update: { status },
        create: { id: 1, status },
      });
      return { content: [{ type: "text", text: `Licht wurde auf '${status}' gesetzt.` }] };
    }
    if (name === "pruefe_licht") {
      const entry = await prisma.lichtStatus.findUnique({ where: { id: 1 } });
      const status = entry?.status || "off";
      return { content: [{ type: "text", text: `Status: licht=${status}` }] };
    }
    throw new Error(`Tool nicht gefunden: ${name}`);
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: `Fehler: ${(error as Error).message}` }] };
  }
});

let transport: SSEServerTransport | null = null;

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

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Keine aktive SSE Verbindung");
  }
});

/**
 * Gemini AI Integration
 */
app.post("/chat", async (req, res) => {
  let { message, audio, conversationId } = req.body;

  try {
    // Erstelle neue Konversation, falls keine existiert
    if (!conversationId) {
      const title = message ? (message.substring(0, 30) + "...") : "Sprachnachricht";
      const newConv = await prisma.conversation.create({
        data: { title }
      });
      conversationId = newConv.id;
    }

    // Speichere Benutzer-Nachricht in DB (auch bei Audio)
    if (message || audio) {
      await prisma.chatMessage.create({
        data: { 
          role: "user", 
          text: message || "🎤 Sprachnachricht", 
          conversationId 
        }
      });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{
        functionDeclarations: [
          {
            name: "schalte_licht",
            description: "Schaltet das Licht ein oder aus.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: { 
                status: { 
                  type: SchemaType.STRING, 
                  description: "Der Status ('on' oder 'off')"
                } 
              },
              required: ["status"],
            } as any,
          },
          {
            name: "pruefe_licht",
            description: "Gibt den aktuellen Status des Lichts zurück.",
          },
          {
            name: "starte_programm",
            description: "Startet ein registriertes Programm auf dem PC.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                name: { type: SchemaType.STRING, description: "Der Name des Programms" }
              },
              required: ["name"]
            } as any
          },
          {
            name: "liste_programme",
            description: "Gibt eine Liste aller bereits registrierten Programme zurück.",
          },
          {
            name: "scanne_system_nach_apps",
            description: "Scannt den PC nach installierten Windows-Programmen und gibt deren Namen zurück.",
          }
        ] as any
      }]
    });

    const chatHistory = conversationId ? (await prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })) : [];

    const chat = model.startChat({
      history: chatHistory,
      systemInstruction: {
        role: "system",
        parts: [{ text: "Du bist ein hilfreicher PC-Assistent. Du kannst das Licht steuern und Programme starten. Du hast Zugriff auf Tools zum Scannen des PCs nach installierten Apps (`scanne_system_nach_apps`) und zum Starten dieser Apps. Wenn der Nutzer nach Programmen fragt oder etwas starten will, das du nicht kennst, biete einen Scan an oder führe ihn direkt aus. Antworte kurz und präzise." }]
      }
    });
    
    // Baue die Nachricht für Gemini zusammen
    const promptParts: any[] = [];
    if (message) promptParts.push(message);
    if (audio) {
      console.log("Empfange Audio-Daten (Base64 Länge):", audio.length);
      promptParts.push({
        inlineData: {
          data: audio,
          mimeType: "audio/webm"
        }
      });
    }

    console.log("Sende Anfrage an Gemini mit", promptParts.length, "Teilen.");
    const result = await chat.sendMessage(promptParts);
    const response = result.response;
    let aiText = "";
    let currentResponse = response;

    // Schleife für Tool-Chaining (falls Gemini mehrere Tools nacheinander aufrufen will)
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
        if (call.name === "schalte_licht") {
          const args = call.args as { status: string };
          await prisma.lichtStatus.upsert({ where: { id: 1 }, update: { status: args.status }, create: { id: 1, status: args.status } });
          toolResult = { status: "success", message: `Licht ist ${args.status}` };
        } else if (call.name === "pruefe_licht") {
          const entry = await prisma.lichtStatus.findUnique({ where: { id: 1 } });
          toolResult = { status: entry?.status || "off" };
        } else if (call.name === "starte_programm") {
          const args = call.args as { name: string };
          const appEntry = await prisma.appLauncher.findUnique({ where: { name: args.name } });
          if (appEntry) {
            // Wenn der Pfad wie ein normaler Windows-Pfad aussieht (z.B. C:\...), 
            // starten wir ihn direkt. Ansonsten nutzen wir den shell:AppsFolder (für AppIDs).
            const isAbsolutePath = /^[a-zA-Z]:\\/.test(appEntry.path);
            const startCommand = isAbsolutePath 
              ? `cmd /c start "" "${appEntry.path}"`
              : `cmd /c start "" "shell:AppsFolder\\${appEntry.path}"`;
            
            console.log(`Führe Start-Befehl aus: ${startCommand}`);
            exec(startCommand, (err) => { if (err) console.error("Start-Fehler:", err); });
            toolResult = { status: "success", message: `${args.name} gestartet.` };
          } else {
            toolResult = { status: "error", message: `Programm '${args.name}' unbekannt.` };
          }
        } else if (call.name === "liste_programme") {
          const apps = await prisma.appLauncher.findMany();
          toolResult = { apps: apps.map(a => a.name) };
        } else if (call.name === "scanne_system_nach_apps") {
          console.log("Starte System-Scan nach Apps...");
          const apps = await new Promise((resolve) => {
            exec('powershell -Command "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json"', (err, stdout) => {
              if (err) return resolve({ error: "Scan fehlgeschlagen" });
              try {
                const rawApps = JSON.parse(stdout);
                resolve(Array.isArray(rawApps) ? rawApps : [rawApps]);
              } catch { resolve({ error: "Fehler beim Parsen der Programme" }); }
            });
          });
          
          if (Array.isArray(apps)) {
            for (const app of apps) {
              if (app.Name && app.AppID) {
                await prisma.appLauncher.upsert({
                  where: { name: app.Name },
                  update: { path: app.AppID },
                  create: { name: app.Name, path: app.AppID }
                });
              }
            }
          }
          toolResult = { status: "success", message: `System-Scan abgeschlossen. ${Array.isArray(apps) ? apps.length : 0} Programme gefunden und registriert.` };
        }
      } catch (err) {
        toolResult = { status: "error", message: "Interner Tool-Fehler." };
      }

      // Sende Tool-Ergebnis zurück an Gemini
      const nextStep = await chat.sendMessage([{
        functionResponse: { name: call.name, response: toolResult }
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

    res.json({ text: aiText, conversationId });
  } catch (error: any) {
    console.error("Detailed Error:", error);
    res.status(500).json({ text: `Fehler: ${error.message || "Unbekannter Fehler"}` });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KI-System Server läuft auf Port ${PORT}`);
});


