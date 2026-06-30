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
import os from "os";

import { PluginManager } from "./plugins/index.js";
import { getSettings, saveSettings } from "./settings.js";
import { runAutomaticMigration } from "./migrate.js";
import { getEventsForRange } from "./plugins/Calendar/index.js";
import { calculateNextDueDate } from "./plugins/Tasks/index.js";

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

app.post("/api/tools/call", async (req, res) => {
  const { name, arguments: args } = req.body;
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

  try {
    const task = await prisma.task.findUnique({ where: { id: Number(taskId) } });
    if (task && task.recurrence && task.due && targetCompleted) {
      const nextDue = calculateNextDueDate(task.due, task.recurrence);
      await prisma.task.update({
        where: { id: Number(taskId) },
        data: {
          due: nextDue,
          completed: false // Keep it open for the next occurrence
        }
      });
      res.json({ success: true, message: "Wiederkehrende Aufgabe auf das nächste Datum verschoben.", nextDue: nextDue.toISOString() });
    } else {
      await prisma.task.update({
        where: { id: Number(taskId) },
        data: { completed: targetCompleted }
      });
      res.json({ success: true, message: `Aufgabe erfolgreich ${targetCompleted ? 'erledigt' : 'wieder geöffnet'}.` });
    }
  } catch (e: any) {
    console.error("Fehler beim Erledigen/Reaktivieren der Aufgabe:", e);
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
  const { hotkey, disabledPlugins, autostart } = req.body;
  const current = getSettings();
  const updated = {
    hotkey: hotkey !== undefined ? hotkey : current.hotkey,
    disabledPlugins: disabledPlugins !== undefined ? disabledPlugins : current.disabledPlugins,
    autostart: autostart !== undefined ? autostart : current.autostart
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


let activeTools: { name: string; args: any }[] = [];

app.get("/chat/active-tools", (req, res) => {
  res.json(activeTools);
});


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

    const modelName = "gemini-flash-latest";
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ functionDeclarations: pluginManager.getGeminiTools() } as any],
      systemInstruction: {
        role: "system",
        parts: [{
          text: `Du bist ein hilfreicher PC-Assistent. 
Heute ist ${dateString}, es ist ${timeString} Uhr (deutsche Lokalzeit, Mitteleuropäische Sommerzeit, UTC+2). 
Nutze dieses Datum als Basis für relative Zeitangaben.
Wenn du relative Timer erstellst (z.B. "in 15 Minuten" oder "für 10 Sekunden"), benutze im Tool 'erstelle_timer' bevorzugt den Parameter 'sekunden'.
Für feste Uhrzeiten (z. B. "morgen um 17 Uhr") berechne die Ablaufzeit im lokalen Format unter Berücksichtigung des Offsets '+02:00' (z. B. YYYY-MM-DDTHH:mm:ss+02:00) und gib diesen String an 'erstelle_timer' oder 'fuege_termin_hinzu'.

Du hast Zugriff auf ein dreistufiges Gedächtnissystem für Personen:
1. Biografie (notes): Kompakte Zusammenfassung über die Person. Lesen per 'hole_person_info', Schreiben/Aktualisieren per 'aktualisiere_person_biografie'.
2. Strukturierte Fakten (Fact-Tabelle): Einzelne atomare Details (z.B. Lieblingsfarbe, Hobbys, Geburtstag). Lesen per 'hole_person_info', Hinzufügen per 'fuege_person_fakt_hinzu', Löschen per 'loesche_person_fakt' (benötigt die faktId).
3. Semantisches Langzeitgedächtnis (SemanticMemory-Tabelle): Unstrukturierte Erlebnisse, Treffen und Chats mit Vektorsuche. Speichern per 'erinnere_dich', Suchen per 'suche_im_gedaechtnis'.

WICHTIGE VERHALTENSREGELN:
- Die Biografie und die Fakten enthalten NICHT alle Informationen! Gehe nie davon aus, dass das Profil vollständig ist.
- Wenn der Benutzer nach einer Person fragt (z.B. 'weißt du was über curly oder laphi?'), musst du IMMER sowohl 'suche_im_gedaechtnis' (semantische Suche mit dem Namen) als auch 'hole_person_info' (Biografie & Fakten) aufrufen, um alle relevanten Informationen aus beiden Speicherstufen zu vereinen.
- Sei bei Antworten präzise, hilfsbereit und antworte auf Deutsch.` }]
      }
    });

    const chatHistory = conversationId ? (await prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })) : [];

    const chat = model.startChat({
      history: chatHistory
    });

    // Resolve any app:// link entities in the message and inject their contents as context for the AI
    let resolvedContext = "";
    if (message) {
      const entityRegex = /\[([^\]]+)\]\((app:\/\/([^/]+)\/(\d+))\)/g;
      let match;
      const resolvedEntities = new Set<string>();

      while ((match = entityRegex.exec(message)) !== null) {
        const fullUrl = match[2];
        const type = match[3];
        const id = parseInt(match[4], 10);
        const entityKey = `${type}-${id}`;

        if (!resolvedEntities.has(entityKey)) {
          resolvedEntities.add(entityKey);
          try {
            const entity = await pluginManager.resolveEntity(type, id);
            if (entity) {
              resolvedContext += `\n--- Verlinktes Element: [${match[1]}] (${fullUrl}) ---\n${JSON.stringify(entity, null, 2)}\n`;
            }
          } catch (err) {
            console.error(`Fehler beim Auflösen der Entity ${type}:${id}`, err);
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
    const executedTools: { name: string; args: any }[] = [];

    // Schleife für Tool-Chaining
    let step = 0;
    const MAX_STEPS = 5;
    while (step < MAX_STEPS) {
      const calls = currentResponse.functionCalls();
      if (!calls || calls.length === 0) {
        aiText = currentResponse.text();
        break;
      }

      console.log(`KI ruft ${calls.length} Tools auf (Schritt ${step + 1}):`);

      const functionResponses = [];
      for (const call of calls) {
        let toolResult: any;
        executedTools.push({ name: call.name, args: call.args });
        activeTools.push({ name: call.name, args: call.args });

        // Wenn wir das Limit erreichen, verweigern wir weitere Aufrufe und zwingen das Modell zu einer Antwort
        if (step === MAX_STEPS - 1) {
          console.log(`  - Tool-Limit erreicht. Verweigere Ausführung für: ${call.name}`);
          toolResult = {
            status: "limit_reached",
            message: "Such-Limit für diese Runde erreicht. Bitte fasse alle bisher gesammelten Informationen kurz zusammen und antworte dem Benutzer direkt."
          };
        } else {
          console.log(`  - Rufe Tool auf: ${call.name}`, call.args);
          try {
            toolResult = await pluginManager.executeTool(call.name, call.args);
            console.log("    Tool Ergebnis empfangen:", { name: call.name, hasWidget: !!toolResult?.type });

            if (toolResult && toolResult.type) {
              widgetData = toolResult;
            }
          } catch (err) {
            console.error("    Tool-Fehler:", err);
            toolResult = { status: "error", message: "Interner Tool-Fehler." };
          }
        }

        // Sende Tool-Ergebnis zurück an Gemini (ohne die riesigen Base64-Daten)
        let responseToGemini = toolResult;
        if (toolResult && toolResult.type === 'image_widget' && toolResult.url.startsWith('data:')) {
          responseToGemini = { ...toolResult, url: "[BILD_DATEN_GESENDET]" };
        }

        functionResponses.push({
          functionResponse: { name: call.name, response: responseToGemini }
        });
      }

      const nextStep = await chat.sendMessage(functionResponses);
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

    // Prepend tool calls info to the message
    if (executedTools.length > 0) {
      const toolSummaries = executedTools.map(t => {
        const argsStr = Object.entries(t.args || {})
          .map(([k, v]) => {
            const val = typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
            return `${k}: ${val}`;
          })
          .join(", ");
        return `🔧 *Greife auf Tool zu:* \`${t.name}(${argsStr})\``;
      }).join("\n");
      aiText = `${toolSummaries}\n\n${aiText}`;
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
app.listen(PORT, async () => {
  console.log(`KI-System Server läuft auf Port ${PORT}`);

  // Automatische Datenmigration ausführen
  await runAutomaticMigration(prisma);

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


