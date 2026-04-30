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
  const { message, audio } = req.body;

  try {
    // Speichere Benutzer-Nachricht in DB (falls Text vorhanden)
    if (message) {
      await prisma.chatMessage.create({
        data: { role: "user", text: message }
      });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
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
          }
        ] as any
      }]
    });

    const chat = model.startChat();
    
    // Baue die Nachricht für Gemini zusammen
    const promptParts: any[] = [];
    if (message) promptParts.push(message);
    if (audio) {
      promptParts.push({
        inlineData: {
          data: audio,
          mimeType: "audio/webm" // MediaRecorder nutzt meist webm
        }
      });
    }

    if (promptParts.length === 0) {
      return res.status(400).json({ text: "Keine Daten empfangen." });
    }

    const result = await chat.sendMessage(promptParts);
    const response = result.response;
    
    let aiText = "";

    const calls = response.functionCalls();
    if (calls && calls.length > 0) {
      const call = calls[0];
      let toolResult: any;

      if (call.name === "schalte_licht") {
        const args = call.args as { status: string };
        const status = args.status;
        await prisma.lichtStatus.upsert({
          where: { id: 1 },
          update: { status },
          create: { id: 1, status },
        });
        toolResult = { status: "success", message: `Licht ist jetzt ${status}` };
      } else if (call.name === "pruefe_licht") {
        const entry = await prisma.lichtStatus.findUnique({ where: { id: 1 } });
        toolResult = { status: entry?.status || "off" };
      }

      if (toolResult) {
        const finalResult = await chat.sendMessage([{
          functionResponse: {
            name: call.name,
            response: toolResult
          }
        }]);
        aiText = finalResult.response.text();
      }
    } else {
      aiText = response.text();
    }

    // Speichere KI-Antwort in DB
    if (aiText) {
      await prisma.chatMessage.create({
        data: { role: "ai", text: aiText }
      });
    }

    res.json({ text: aiText });
  } catch (error: any) {
    console.error("Detailed Error:", error);
    res.status(500).json({ text: `Fehler: ${error.message || "Unbekannter Fehler"}` });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KI-System Server läuft auf Port ${PORT}`);
});


