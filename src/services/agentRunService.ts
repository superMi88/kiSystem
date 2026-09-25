import { PrismaClient } from "@prisma/client";
import { PluginManager } from "../plugins/index.js";
import { GoogleGenerativeAI, FunctionCallingMode } from "@google/generative-ai";
import { getSettings } from "../settings.js";

export interface QueueEmailRunItem {
  emailId: number;
  prisma: PrismaClient;
  pluginManager: PluginManager;
  force?: boolean;
}

export class AgentRunService {
  private static queue: QueueEmailRunItem[] = [];
  private static isProcessing = false;

  /**
   * Reiht einen Agent Run für eine eingehende oder bestehende E-Mail in die Warteschlange ein.
   * Läuft asynchron im Hintergrund, damit der Hauptprozess (z.B. IMAP-Sync) nicht blockiert wird.
   */
  static queueEmailRun(
    emailId: number,
    prisma: PrismaClient,
    pluginManager: PluginManager,
    options?: { force?: boolean }
  ) {
    this.queue.push({ emailId, prisma, pluginManager, force: options?.force });
    this.processQueue();
  }

  private static async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) break;
        try {
          await this.executeEmailRun(item.emailId, item.prisma, item.pluginManager, { force: item.force });
        } catch (err: any) {
          console.error(`[AgentRunService] Fehler bei Ausführung für Mail ID ${item.emailId}:`, err);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Führt einen Agent Run für eine bestimmte E-Mail aus.
   */
  static async executeEmailRun(
    emailId: number,
    prisma: PrismaClient,
    pluginManager: PluginManager,
    options?: { force?: boolean }
  ) {
    // 1. E-Mail aus der Datenbank abrufen
    const email = await prisma.cachedEmail.findUnique({
      where: { id: emailId },
      include: {
        account: true,
        person: { include: { aliases: true } }
      }
    });

    if (!email) {
      console.warn(`[AgentRunService] E-Mail mit ID ${emailId} nicht gefunden.`);
      return null;
    }

    // Prüfen, ob bereits ein Agent Run für diese Mail existiert
    if (!options?.force && email.agentRunId) {
      const existingConv = await prisma.conversation.findUnique({
        where: { id: email.agentRunId }
      });
      if (existingConv) {
        console.log(`[AgentRunService] Agent Run existiert bereits für Mail ${emailId} (Conv ID: ${existingConv.id}).`);
        return existingConv;
      }
    }

    const cleanSubject = email.subject.replace(/^(re|fwd|aw|wg):\s*/gi, "").trim() || "Kein Betreff";
    const senderDisplay = email.fromName ? `${email.fromName} <${email.from}>` : email.from;

    // 2. Neue Konversation als Agent Run anlegen
    const conversation = await prisma.conversation.create({
      data: {
        title: `🤖 E-Mail: ${cleanSubject}`.slice(0, 80),
        isAgentRun: true,
        triggerType: "mail",
        triggerId: String(email.id),
        status: "running"
      }
    });

    // Verknüpfung in CachedEmail speichern
    await prisma.cachedEmail.update({
      where: { id: email.id },
      data: { agentRunId: conversation.id }
    });

    console.log(`[AgentRunService] 🚀 Starte Agent Run ${conversation.id} für E-Mail ${email.id} ("${cleanSubject}")...`);

    const dateFormatted = email.date.toLocaleString("de-DE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    // 3. System-Trigger-Nachricht als ChatMessage erstellen
    const triggerPrompt = `[E-Mail-Eingang zur automatischen Bearbeitung]
Postfach: ${email.account?.name || email.account?.email || "Unbekannt"}
Absender: ${senderDisplay}
Empfänger: ${email.to}
Datum: ${dateFormatted}
Betreff: ${email.subject}

Inhalt der E-Mail:
${(email.bodyText || email.snippet || "(Kein Inhalt)").slice(0, 4000)}

---
AUFTRAG AN DEN AUTONOMEN AGENTEN:
Analysiere diese E-Mail auf Relevanz und Handlungsbedarf. Der Benutzer möchte nicht alle E-Mails selbst durchlesen müssen, daher triffst du eine intelligente Vorauswahl für seinen Arbeitstisch:

1. WENN HANDLUNGSBEDARF, ENTSCHEIDUNG ODER EINE WICHTIGE INFORMATION VORLIEGT:
   - Wenn eine Rückfrage oder Entscheidung an den Benutzer vorliegt (z. B. "In der Mail steht, dass am 18.09. Keramik bemalen ist, soll ich das als Termin eintragen?"):
     Rufe 'erstelle_benachrichtigung' auf:
       * titel: Kurzer, aussagekräftiger Titel
       * nachricht: Die konkrete Frage oder Erklärung an den Benutzer
       * typ: "question"
       * buttons: Liste von Antwortmöglichkeiten als interaktive Buttons (z. B. [{ label: "Ja, eintragen", action: "reply", replyText: "Ja, trage den Termin für den 18.09. bitte ein", style: "primary" }, { label: "Nein", action: "dismiss", style: "secondary" }])
   - Wenn es eine persönliche Nachricht oder wichtige Mitteilung ist (z. B. "Nina hat dir auf Parship geschrieben", Bestellbestätigung oder dringende Statusänderung):
     Rufe 'erstelle_benachrichtigung' auf:
       * titel: Kurzer Titel (z. B. "Nina auf Parship")
       * nachricht: Wichtigste Aussage der Mail
       * typ: "info"
       * buttons: [{ label: "Gelesen", action: "dismiss", style: "secondary" }]
   - Wenn eindeutig eine feste Aufgabe oder ein bereits vereinbarter Termin vorliegt:
     Erstelle die Aufgabe mit 'erstelle_aufgabe' bzw. den Termin mit 'fuege_termin_hinzu'.
   - Kategorisiere die Mail per 'kategorisiere_mail' (z. B. 'Wichtig', 'Termine', 'Rechnungen', 'Persönlich').

2. WENN KEIN HANDLUNGSBEDARF BESTEHT (z. B. Newsletter, Werbung, unwichtige Systembenachrichtigungen, Spam):
   - Erstelle KEINE Benachrichtigung und keine Aufgaben! Der Arbeitstisch soll frei von Müll bleiben.
   - Kategorisiere die Mail per 'kategorisiere_mail' als 'Newsletter' oder 'Spam'.

3. Fasse am Ende kurz zusammen, was du geprüft und welche Aktionen du durchgeführt hast.`;

    await prisma.chatMessage.create({
      data: {
        role: "user",
        text: triggerPrompt,
        conversationId: conversation.id
      }
    });

    // 4. Gemini mit Tools initialisieren
    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
      const now = new Date();
      const dateString = now.toLocaleDateString("de-DE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      const timeString = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      const todayIso = now.toISOString().split("T")[0];

      const userModel = getSettings().aiModel;
      const modelName = userModel || process.env.GEMINI_MODEL || "gemini-3.5-flash";

      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ functionDeclarations: pluginManager.getGeminiTools() } as any],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.AUTO
          }
        },
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 0
          }
        } as any,
        systemInstruction: {
          role: "system",
          parts: [{
            text: `Du bist ein autonomer persönlicher KI-Agent im System. Du bearbeitest im Hintergrund neue Ereignisse wie eingehende E-Mails eigenständig.
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen (z. B. morgen = nächster Tag im Format YYYY-MM-DD).

OBERSTE REGELN FÜR DEN AGENTEN:
- Wenn Handlungsbedarf besteht (Aufgabe, Termin, Kategorie etc.), führe die Werkzeuge SOFORT per Function Call aus.
- Melde NIEMALS Scheinerfolge: Behaupte niemals, etwas erstellt oder verändert zu haben, wenn das Tool nicht erfolgreich ausgeführt wurde.
- Vermeide unnötigen Spam: Erstelle nur dann Aufgaben oder Termine, wenn wirklich eine Aktion oder Frist erforderlich ist.
- Verwende für Parameter reine JSON-Werte (Strings oder Zahlen), keine Python-Formeln.
- Antworte auf Deutsch, präzise und strukturiert.`
          }]
        }
      });

      const chat = model.startChat({
        history: [{
          role: "user",
          parts: [{ text: triggerPrompt }]
        }]
      });

      const initialResult = await chat.sendMessage(triggerPrompt);
      let currentResponse = initialResult.response;
      const executedTools: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string }[] = [];
      let step = 0;
      const MAX_STEPS = 6;
      let aiText = "";

      while (step < MAX_STEPS) {
        const cand = currentResponse.candidates?.[0];
        if (cand?.finishReason === "MALFORMED_FUNCTION_CALL") {
          console.warn("[AgentRunService] MALFORMED_FUNCTION_CALL erkannt. Sende Korrekturaufforderung...");
          const retryStep = await chat.sendMessage("Hinweis: Bitte rufe das Werkzeug erneut auf und verwende ausschließlich reine JSON-Werte für alle Parameter.");
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

        console.log(`[AgentRunService] Agent führt ${calls.length} Werkzeug(e) aus (Schritt ${step + 1}):`, calls.map((c: any) => c.name));

        const functionResponses = [];
        for (const call of calls) {
          let toolResult: any;
          const toolLog: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string } = {
            name: call.name,
            args: call.args,
            status: "success"
          };

          if (step === MAX_STEPS - 1) {
            console.log(`[AgentRunService] Tool-Limit erreicht für: ${call.name}`);
            toolLog.status = "limit_reached";
            toolLog.message = "Limit erreicht";
            toolResult = {
              status: "limit_reached",
              message: "Limit erreicht. Bitte fasse das Ergebnis zusammen."
            };
          } else {
            try {
              let toolArgs = (call.args || {}) as any;
              if (call.name === "erstelle_benachrichtigung") {
                toolArgs.conversationId = conversation.id;
                toolArgs.sourceType = "mail";
                toolArgs.sourceId = String(email.id);
              }
              toolResult = await pluginManager.executeTool(call.name, toolArgs);
              if (toolResult && toolResult.status === "error") {
                toolLog.status = "error";
                toolLog.message = toolResult.message || "Fehler";
              }
            } catch (err: any) {
              console.error("[AgentRunService] Tool-Fehler:", err);
              toolLog.status = "error";
              toolLog.message = err.message || "Interner Tool-Fehler";
              toolResult = { status: "error", message: toolLog.message };
            }
          }
          executedTools.push(toolLog);

          let responseToGemini = toolResult;
          if (toolResult && toolResult.type === "image_widget" && toolResult.url?.startsWith("data:")) {
            responseToGemini = { ...toolResult, url: "[BILD_DATEN]" };
          }

          functionResponses.push({
            functionResponse: { name: call.name, response: responseToGemini }
          });
        }

        const nextStep = await chat.sendMessage(functionResponses);
        currentResponse = nextStep.response;
        step++;
      }

      if (!aiText) {
        try {
          aiText = currentResponse.text();
        } catch (e) {
          aiText = "Die E-Mail wurde erfolgreich analysiert.";
        }
      }

      // Zusammenfassung der durchgeführten Aktionen voranstellen
      if (executedTools.length > 0) {
        const toolSummaries = executedTools.map(t => {
          const argsStr = Object.entries(t.args || {})
            .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
            .join(", ");
          if (t.status === "success") {
            return `✅ *Aktion ausgeführt:* \`${t.name}(${argsStr})\``;
          } else if (t.status === "error") {
            return `❌ *Aktion fehlgeschlagen:* \`${t.name}\` (${t.message || "Fehler"})`;
          } else {
            return `⚠️ *Aufruflimit erreicht:* \`${t.name}\``;
          }
        }).join("\n");
        aiText = `${toolSummaries}\n\n${aiText}`;
      }

      // 5. KI-Antwort in DB speichern
      await prisma.chatMessage.create({
        data: {
          role: "ai",
          text: aiText,
          conversationId: conversation.id
        }
      });

      // 6. Konversations-Status aktualisieren
      const updatedConv = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: "completed",
          summary: aiText.slice(0, 500)
        }
      });

      console.log(`[AgentRunService] ✅ Agent Run ${conversation.id} erfolgreich abgeschlossen!`);
      return updatedConv;

    } catch (err: any) {
      console.error(`[AgentRunService] ❌ Fehler im Agent Run ${conversation.id}:`, err);

      await prisma.chatMessage.create({
        data: {
          role: "ai",
          text: `❌ Fehler bei der automatischen Bearbeitung: ${err?.message || "Unbekannter Fehler"}`,
          conversationId: conversation.id
        }
      });

      const updatedConv = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: "error",
          summary: `Fehler: ${err?.message || "Unbekannter Fehler"}`.slice(0, 500)
        }
      });

      return updatedConv;
    }
  }

  /**
   * Gibt alle Agent Runs zurück.
   */
  static async getAgentRuns(
    prisma: PrismaClient,
    filter?: { triggerType?: string; status?: string }
  ) {
    const where: any = { isAgentRun: true };
    if (filter?.triggerType) {
      where.triggerType = filter.triggerType;
    }
    if (filter?.status) {
      where.status = filter.status;
    }

    return prisma.conversation.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
  }

  /**
   * Gibt den verknüpften Agent Run für eine bestimmte E-Mail zurück.
   */
  static async getAgentRunForEmail(emailId: number, prisma: PrismaClient) {
    const email = await prisma.cachedEmail.findUnique({
      where: { id: emailId },
      include: {
        agentRun: {
          include: {
            messages: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });

    if (email?.agentRun) {
      return email.agentRun;
    }

    // Fallback: Suche nach Conversation mit triggerType="mail" und triggerId=emailId
    return prisma.conversation.findFirst({
      where: {
        isAgentRun: true,
        triggerType: "mail",
        triggerId: String(emailId)
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  /**
   * Setzt einen Agent Run fort, wenn der Benutzer auf eine Benachrichtigung antwortet
   * oder im Agent Run Chat eine neue Nachricht sendet. Führt alle notwendigen Werkzeuge aus.
   */
  static async continueRun(
    conversationId: string,
    userMessage: string,
    prisma: PrismaClient,
    pluginManager: PluginManager
  ) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      throw new Error(`Konversation ${conversationId} nicht gefunden.`);
    }

    // 1. Benutzer-Nachricht speichern
    await prisma.chatMessage.create({
      data: {
        role: "user",
        text: userMessage,
        conversationId
      }
    });

    // 2. Chat-Historie abrufen
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" }
    });

    const chatHistory = messages.slice(0, -1).map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    // 3. Gemini aufrufen mit Werkzeugen
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
    const now = new Date();
    const dateString = now.toLocaleDateString("de-DE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const timeString = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const todayIso = now.toISOString().split("T")[0];

    const userModel = getSettings().aiModel;
    const modelName = userModel || process.env.GEMINI_MODEL || "gemini-3.5-flash";

    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ functionDeclarations: pluginManager.getGeminiTools() } as any],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.AUTO
        }
      },
      generationConfig: {
        thinkingConfig: {
          thinkingBudget: 0
        }
      } as any,
      systemInstruction: {
        role: "system",
        parts: [{
          text: `Du bist ein autonomer persönlicher KI-Agent im System. Du bearbeitest Anweisungen und Antworten des Benutzers zu einem vorherigen Vorgang (z.B. E-Mail).
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen.

OBERSTE REGELN:
- Wenn der Benutzer einer Aktion zugestimmt hat (z. B. 'Ja, trage den Termin bitte ein' oder 'Ja, erstelle die Aufgabe'), führe das entsprechende Werkzeug ('fuege_termin_hinzu', 'erstelle_aufgabe' etc.) SOFORT per Function Call aus!
- Melde NIEMALS Scheinerfolge.
- Antworte auf Deutsch, präzise und freundlich.`
        }]
      }
    });

    const chat = model.startChat({
      history: chatHistory
    });

    const initialResult = await chat.sendMessage(userMessage);
    let currentResponse = initialResult.response;
    const executedTools: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string }[] = [];
    let step = 0;
    const MAX_STEPS = 6;
    let aiText = "";

    while (step < MAX_STEPS) {
      const calls = currentResponse.functionCalls();
      if (!calls || calls.length === 0) {
        try {
          aiText = currentResponse.text();
        } catch (e) {
          aiText = "";
        }
        break;
      }

      console.log(`[AgentRunService.continueRun] Agent führt ${calls.length} Werkzeug(e) aus:`, calls.map((c: any) => c.name));

      const functionResponses = [];
      for (const call of calls) {
        let toolResult: any;
        const toolLog: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string } = {
          name: call.name,
          args: call.args,
          status: "success"
        };

        try {
          let toolArgs = (call.args || {}) as any;
          if (call.name === "erstelle_benachrichtigung") {
            toolArgs.conversationId = conversation.id;
          }
          toolResult = await pluginManager.executeTool(call.name, toolArgs);
          if (toolResult && toolResult.status === "error") {
            toolLog.status = "error";
            toolLog.message = toolResult.message || "Fehler";
          }
        } catch (err: any) {
          console.error("[AgentRunService.continueRun] Tool-Fehler:", err);
          toolLog.status = "error";
          toolLog.message = err.message || "Interner Tool-Fehler";
          toolResult = { status: "error", message: toolLog.message };
        }
        executedTools.push(toolLog);

        let responseToGemini = toolResult;
        if (toolResult && toolResult.type === "image_widget" && toolResult.url?.startsWith("data:")) {
          responseToGemini = { ...toolResult, url: "[BILD_DATEN]" };
        }

        functionResponses.push({
          functionResponse: { name: call.name, response: responseToGemini }
        });
      }

      const nextStep = await chat.sendMessage(functionResponses);
      currentResponse = nextStep.response;
      step++;
    }

    if (!aiText) {
      try {
        aiText = currentResponse.text();
      } catch (e) {
        aiText = "Aktion erfolgreich ausgeführt.";
      }
    }

    if (executedTools.length > 0) {
      const toolSummaries = executedTools.map(t => {
        const argsStr = Object.entries(t.args || {})
          .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
          .join(", ");
        if (t.status === "success") {
          return `✅ *Aktion ausgeführt:* \`${t.name}(${argsStr})\``;
        } else if (t.status === "error") {
          return `❌ *Aktion fehlgeschlagen:* \`${t.name}\` (${t.message || "Fehler"})`;
        } else {
          return `⚠️ *Limit erreicht:* \`${t.name}\``;
        }
      }).join("\n");
      aiText = `${toolSummaries}\n\n${aiText}`;
    }

    // AI-Nachricht in DB speichern
    const aiMessage = await prisma.chatMessage.create({
      data: {
        role: "ai",
        text: aiText,
        conversationId
      }
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: "completed",
        summary: aiText.slice(0, 500)
      }
    });

    return {
      aiMessage,
      executedTools,
      text: aiText
    };
  }
}
