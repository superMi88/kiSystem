import { PrismaClient } from "@prisma/client";
import { PluginManager } from "../plugins/index.js";
import { GoogleGenerativeAI, FunctionCallingMode } from "@google/generative-ai";
import { getSettings, getAgentConfig } from "../settings.js";

export interface QueueEmailRunItem {
  emailId: number;
  prisma: PrismaClient;
  pluginManager: PluginManager;
  force?: boolean;
}

export class AgentRunService {
  /**
   * Formatiert Argumente eines Tool-Aufrufs kompakt für Logs und Chat.
   * Verhindert das Ausgeben riesiger Text- oder JSON-Blobs im Chat.
   */
  static formatToolArgs(toolName: string, args: Record<string, any>): string {
    if (!args || Object.keys(args).length === 0) return "";

    // 1. Spezialbehandlung für erstelle_benachrichtigung: keine riesigen Entwürfe/Buttons
    if (toolName === "erstelle_benachrichtigung") {
      const parts: string[] = [];
      const title = args.titel || args.title;
      if (title) parts.push(`titel: "${title.length > 50 ? title.slice(0, 47) + '...' : title}"`);
      const type = args.typ || args.type;
      if (type) parts.push(`typ: "${type}"`);
      return parts.join(", ");
    }

    // 2. Spezialbehandlung für Ankündigungen: Description ausblenden / kürzen
    if (toolName === "discord_send_announcement" || toolName === "send_announcement") {
      const parts: string[] = [];
      if (args.title) parts.push(`title: "${args.title.length > 50 ? args.title.slice(0, 47) + '...' : args.title}"`);
      if (args.channel) parts.push(`channel: "${args.channel}"`);
      return parts.join(", ");
    }

    // 3. Allgemeine Bereinigung
    return Object.entries(args)
      .filter(([k]) => !['conversationId', 'sourceId', 'sourceType'].includes(k))
      .map(([k, v]) => {
        if (typeof v === "string") {
          const clean = v.length > 40 ? v.slice(0, 37) + "..." : v;
          return `${k}: "${clean}"`;
        }
        if (typeof v === "object" && v !== null) {
          const json = JSON.stringify(v);
          return `${k}: ${json.length > 35 ? json.slice(0, 32) + "..." : json}`;
        }
        return `${k}: ${v}`;
      })
      .join(", ");
  }

  /**
   * Erstellt eine kompakte, zugeklappte Zusammenfassung der ausgeführten Aktionen.
   * Verwendet Discord-kompatibles Spoiler-Markdown (|| ... ||),
   * sodass der normale Chat sauber bleibt und der Nutzer sie bei Interesse aufklappen kann.
   */
  static formatExecutedToolsSummary(
    executedTools: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string }[]
  ): string {
    if (!executedTools || executedTools.length === 0) return "";

    const lines: string[] = [];
    const seen = new Set<string>();

    for (const t of executedTools) {
      const argsStr = AgentRunService.formatToolArgs(t.name, t.args || {});
      const key = `${t.status}:${t.name}:${argsStr}`;
      if (seen.has(key)) continue; // Duplikate vermeiden
      seen.add(key);

      if (t.status === "success") {
        lines.push('✅ `' + t.name + '(' + argsStr + ')`');
      } else if (t.status === "error") {
        lines.push('❌ `' + t.name + '` (' + (t.message || 'Fehler') + ')');
      } else {
        lines.push('⚠️ *Aufruflimit:* `' + t.name + '`');
      }
    }

    if (lines.length === 0) return "";

    return `\n\n> ⚙️ **Ausgeführte Aktionen (${lines.length})** *(Klicken zum Aufklappen)*\n||\n${lines.join("\n")}\n||`;
  }

  /**
   * Bereitet den Chatverlauf für Gemini strikt nach API-Vorgaben auf:
   * 1. Die Historie MUSS zwingend mit der Rolle 'user' beginnen (GoogleGenerativeAI Regel).
   * 2. Aufeinanderfolgende gleiche Rollen werden zusammengeführt.
   * 3. Die Historie MUSS mit 'model' enden (da nach startChat ein sendMessage mit 'user' folgt).
   * 4. Begrenzung auf maximal maxRecent Nachrichten (Sliding Window).
   */
  static formatGeminiChatHistory(
    messages: { role: string; text: string }[],
    maxRecent: number = 14
  ): { role: "user" | "model"; parts: [{ text: string }] }[] {
    if (!messages || messages.length === 0) return [];

    const sliced = messages.slice(-maxRecent);
    const validHistory: { role: "user" | "model"; parts: [{ text: string }] }[] = [];

    for (const m of sliced) {
      if (!m.text || !m.text.trim()) continue;
      const role: "user" | "model" = m.role === "user" ? "user" : "model";

      if (validHistory.length === 0) {
        // Erstes Element in Gemini-History MUSS zwingend 'user' sein!
        if (role !== "user") continue;
        validHistory.push({ role, parts: [{ text: m.text }] });
      } else {
        const last = validHistory[validHistory.length - 1];
        if (last.role === role) {
          last.parts[0].text += "\n\n" + m.text;
        } else {
          validHistory.push({ role, parts: [{ text: m.text }] });
        }
      }
    }

    // Da sendMessage() die neue User-Nachricht sendet, muss die Historie mit 'model' abschließen:
    while (validHistory.length > 0 && validHistory[validHistory.length - 1].role !== "model") {
      validHistory.pop();
    }

    // Falls nach dem Pop der Anfang nicht mehr 'user' ist:
    while (validHistory.length > 0 && validHistory[0].role !== "user") {
      validHistory.shift();
    }

    return validHistory;
  }

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

    const agentConfig = getAgentConfig("mail");
    if (agentConfig && agentConfig.isEnabled === false) {
      console.log(`[AgentRunService] ⚠️ E-Mail Agent ist deaktiviert. Überspringe automatischen Run für E-Mail ${email.id}.`);
      return null;
    }

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
   - SICHERHEITSRICHTLINIE: Erstelle Termine, Aufgaben oder E-Mail-Antworten NIEMALS direkt selbst. Schlage sie immer zur Benutzerbestätigung auf dem Arbeitstisch vor!
   - Bei Terminen oder Terminvorschlägen (z. B. Einladungen, Fristen, Meetings):
     Rufe IMMER 'schlage_termin_vor' auf:
       * titel: Prägnanter Titel des Termins
       * datum: Datum im Format YYYY-MM-DD
       * startzeit / endzeit: Uhrzeiten (optional, z. B. '14:00')
       * ganztaegig: true falls ganztägig
       * ort / beschreibung: Relevante Details
       * mailZusammenfassung: Beschreibe in 1-2 prägnanten Sätzen, was grob in der E-Mail stand
       * begruendung: Warum dieser Termin vorgeschlagen wird
     Der Termin wird erst verbindlich angelegt, wenn der Benutzer im UI auf "Ja" klickt!
   - Bei Aufgaben oder To-Dos (z. B. Überweisung tätigen, Dokumente einreichen):
     Rufe IMMER 'schlage_aufgabe_vor' auf:
       * titel: Titel der Aufgabe
       * faelligkeit: Optionales Fälligkeitsdatum (YYYY-MM-DD)
       * notizen: Relevante Hinweise
       * mailZusammenfassung: Beschreibe in 1-2 prägnanten Sätzen, was grob in der E-Mail stand
       * begruendung: Warum die Aufgabe anfällt
   - Bei E-Mail-Antworten (wenn eine Antwort vom Benutzer verlangt oder sinnvoll ist):
     Rufe IMMER 'schlage_mail_antwort_vor' auf mit Empfänger, Betreff, vorgeschlagenem Nachrichtentext, mailZusammenfassung (was in der Mail stand) und Begründung.
   - Wenn eine sonstige Rückfrage oder Information vorliegt:
     Rufe 'erstelle_benachrichtigung' auf (typ: 'question' oder 'info').
   - Kategorisiere die Mail per 'kategorisiere_mail' (z. B. 'Wichtig', 'Termine', 'Rechnungen', 'Persönlich').

2. WENN KEIN HANDLUNGSBEDARF BESTEHT (z. B. Newsletter, Werbung, unwichtige Systembenachrichtigungen, Spam):
   - Erstelle KEINE Benachrichtigung und keine Vorschläge! Der Arbeitstisch soll frei von Müll bleiben.
   - Kategorisiere die Mail per 'kategorisiere_mail' als 'Newsletter' oder 'Spam'.

3. TRANSPARENTER GEDANKENGANG & ZUSAMMENFASSUNG (PFLICHT):
   Schließe deine finale Antwort immer mit einer klaren Begründung für den Benutzer ab:
   - **Gedankengang**: Erkläre in 1-2 Sätzen genau, warum diese Mail relevant ist (und daher ein Vorschlag auf dem Arbeitstisch erzeugt wurde) ODER warum sie NICHT relevant ist.
   - **Ergebnis**: Zusammenfassung der getroffenen Vorschläge/Aktionen.`;

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

      const isDiscord = conversation.triggerType === "discord";

    const systemPrompt = isDiscord
      ? `Du bist ein autonomer persönlicher KI-Agent im System, verbunden mit dem Discord-Bot.
Du bearbeitest eine Rückmeldung oder Fortsetzung des Benutzers auf Discord.
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen.

OBERSTE REGELN:
- Wenn der Benutzer einer Aktion zugestimmt hat (z. B. 'Ja, bitte abschicken', 'Ja, erstelle die Aufgabe', 'Ja, trage den Termin ein'), führe das entsprechende Werkzeug (wie 'discord_send_announcement', 'fuege_termin_hinzu', 'erstelle_aufgabe') SOFORT per Function Call aus!
- Falls du weitere Rückfragen hast oder neue Optionen anbietest, rufe erneut 'erstelle_benachrichtigung' auf (typ='question' mit buttons). PFLICHT: Bei Entwürfen IMMER den VOLLSTÄNDIGEN Text/Vorschau in 'nachricht' einbetten!
- Melde NIEMALS Scheinerfolge.
- Antworte auf Deutsch, präzise und freundlich.`
      : `Du bist ein autonomer persönlicher KI-Agent im System. Du bearbeitest Anweisungen und Antworten des Benutzers zu einem vorherigen Vorgang (z.B. E-Mail).
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen.

OBERSTE REGELN:
- Wenn der Benutzer einer Aktion zugestimmt hat (z. B. 'Ja, trage den Termin bitte ein' oder 'Ja, erstelle die Aufgabe'), führe das entsprechende Werkzeug ('fuege_termin_hinzu', 'erstelle_aufgabe' etc.) SOFORT per Function Call aus!
- Melde NIEMALS Scheinerfolge.
- Antworte auf Deutsch, präzise und freundlich.`;

    const userModel = getSettings().aiModel;
      const modelName = userModel || process.env.GEMINI_MODEL || "gemini-3.5-flash";

      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ functionDeclarations: pluginManager.getGeminiTools(agentConfig?.id || "mail") } as any],
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
- SICHERHEITSRICHTLINIE: Erstelle Termine, Aufgaben oder E-Mail-Antworten NIEMALS eigenständig! Du hast keine Berechtigung dazu.
  * Für Termine: Rufe IMMER 'schlage_termin_vor' auf (Datum, Uhrzeit, Titel, Ort, mailZusammenfassung [was grob in der Mail stand], Begründung).
  * Für Aufgaben: Rufe IMMER 'schlage_aufgabe_vor' auf (Titel, Fälligkeit, Notizen, mailZusammenfassung, Begründung).
  * Für Antworten: Rufe IMMER 'schlage_mail_antwort_vor' auf (mailZusammenfassung, Antworttext, Begründung).
  * Für reine Rückfragen/Infos: Rufe 'erstelle_benachrichtigung' auf.
- Melde NIEMALS Scheinerfolge: Behaupte niemals, etwas erstellt oder verändert zu haben, wenn das Tool nicht erfolgreich ausgeführt wurde.
- Vermeide unnötigen Spam: Erstelle nur dann Vorschläge auf dem Arbeitstisch, wenn wirklich eine Aktion oder Frist erforderlich ist.
- Verwende für Parameter reine JSON-Werte (Strings oder Zahlen), keine Python-Formeln.
- Antworte auf Deutsch, präzise und strukturiert.${agentConfig?.systemPrompt?.trim() ? `\n\nSPEZIELLE ROLLENANWEISUNGEN FÜR DIESEN AGENTEN:\n${agentConfig.systemPrompt.trim()}` : ""}`
          }]
        }
      });

      const chat = model.startChat({
        history: []
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
              if (["erstelle_benachrichtigung", "schlage_termin_vor", "schlage_aufgabe_vor", "schlage_mail_antwort_vor"].includes(call.name)) {
                toolArgs.conversationId = conversation.id;
                toolArgs.sourceType = "mail";
                toolArgs.sourceId = String(email.id);
                if (!toolArgs.agentName) toolArgs.agentName = agentConfig?.name || "E-Mail-Agent";
              }
              toolResult = await pluginManager.executeTool(call.name, toolArgs, agentConfig?.id || "mail");
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

      // Kompakte, zugeklappte Zusammenfassung der Aktionen anhängen
      if (executedTools.length > 0) {
        aiText = `${aiText.trim()}${AgentRunService.formatExecutedToolsSummary(executedTools)}`;
      }

      // 5. KI-Antwort in DB speichern
      await prisma.chatMessage.create({
        data: {
          role: "ai",
          text: aiText,
          conversationId: conversation.id
        }
      });

      // 6. Konversations-Status aktualisieren (Prüfen, ob noch offene Rückfragen/Benachrichtigungen vorliegen)
      const openNotifs = await prisma.agentNotification.findMany({
        where: { conversationId: conversation.id, isDismissed: false }
      });
      const finalEmailStatus = openNotifs.length > 0 ? "waiting_for_user" : "completed";

      const updatedConv = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: finalEmailStatus,
          summary: aiText.slice(0, 500).replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/\\x[0-9a-fA-F]{0,1}$/, '').replace(/\\$/, '').replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/\\x[0-9a-fA-F]{0,1}$/, '').replace(/\\$/, '').replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/\\x[0-9a-fA-F]{0,1}$/, '').replace(/\\$/, '')
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
  /**
   * Führt einen Agent Run für eine Anfrage aus Discord (z. B. Bot-Erwähnung oder Antwort) aus.
   */
  static async executeDiscordRun(
    options: {
      content: string;
      author: { id: string; username: string; displayName?: string };
      guild?: { id: string; name: string };
      channel?: { id: string; name: string };
      messageId?: string;
      conversationId?: string;
    },
    prisma: PrismaClient,
    pluginManager: PluginManager
  ) {
    const { content, author, guild, channel, messageId } = options;
    const triggerId = `${guild?.id || ""}:${channel?.id || ""}:${messageId || ""}`;

    let conversation: any = null;
    if (options.conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: options.conversationId }
      });
    }

    if (!conversation) {
      const cleanTitle = `🤖 Discord: ${content.replace(/\s+/g, " ").trim()}`.slice(0, 80);
      conversation = await prisma.conversation.create({
        data: {
          title: cleanTitle,
          isAgentRun: true,
          triggerType: "discord",
          triggerId,
          status: "running"
        }
      });
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "running" }
      });
    }

    const agentConfig = getAgentConfig("discord");
    if (agentConfig && agentConfig.isEnabled === false) {
      console.log("[AgentRunService.executeDiscordRun] ⚠️ Discord Agent ist deaktiviert.");
      return {
        success: false,
        conversationId: conversation.id,
        status: "error",
        text: "Der Discord-Agent ist aktuell in den Systemeinstellungen deaktiviert.",
        notification: null,
        notifications: [],
        executedTools: [],
        conversation
      };
    }

    console.log(`[AgentRunService] 🚀 Starte Agent Run ${conversation.id} für Discord-Anfrage von ${author.displayName || author.username}...`);

    // 1. Benutzer-Nachricht als ChatMessage speichern
    await prisma.chatMessage.create({
      data: {
        role: "user",
        text: content,
        conversationId: conversation.id
      }
    });

    // 2. Chat-Verlauf abrufen
    const previousMessages = await prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" }
    });

    // Verlauf validieren (muss zwingend mit 'user' beginnen und mit 'model' enden)
    const chatHistory = AgentRunService.formatGeminiChatHistory(previousMessages.slice(0, -1), 14);

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

      const systemPrompt = `Du bist ein autonomer persönlicher KI-Agent im System, verbunden mit dem Discord-Bot.
Ein Benutzer hat dir über Discord eine Frage gestellt oder einen Auftrag erteilt.
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen (z. B. morgen = nächster Tag im Format YYYY-MM-DD).

DISCORD-KONTEXT:
- Absender: ${author.displayName || author.username} (Discord-ID: ${author.id})
- Discord-Server (Guild): ${guild ? `${guild.name} (ID: ${guild.id})` : "Direktnachricht / Unbekannt"}
- Text-Kanal: ${channel ? `#${channel.name} (ID: ${channel.id})` : "Unbekannt"}

OBERSTE REGELN FÜR DEN DISCORD AGENTEN:
1. DATENSCHUTZ & BERECHTIGUNGEN (STRENGSTE REGEL):
   - Du bist der spezialisierte Discord-Server-Assistent.
   - Aus Datenschutz- und Sicherheitsgründen hast du AUSSCHLIESSLICH Zugriff auf:
     1. Den Discord-Server & Discord-Werkzeuge ('discord_send_announcement' und das allgemeine 'get_instructions').
      Hinweis: Nutze vor dem Verfassen einer Ankündigung immer das universelle Tool 'get_instructions' (mit toolName='discord_send_announcement' und optional category='Servernews' oder 'Spielevents'), um Vorlagen, Pflichtangaben und Formatierungsregeln abzurufen.
     2. Den Terminkalender (Termine eintragen, prüfen, anpassen).
     3. Das Benachrichtigungssystem ('erstelle_benachrichtigung' für Rückfragen/Optionen mit Buttons).
   - Du hast STRIKT KEINEN ZUGRIFF auf persönliche oder private Daten wie das Personen-Langzeitgedächtnis, Tagebucheinträge, E-Mails oder vertrauliche Notizen.
   - Falls ein Benutzer auf Discord nach privaten Personendaten, Gedächtnisinhalten, Tagebüchern oder E-Mails fragt, lehne dies freundlich ab mit dem Hinweis, dass solche Daten privat geschützt sind und über Discord nicht zugänglich sind.
   - Wenn der Benutzer eine zulässige Aktion wünscht (z. B. Ankündigung verfassen/senden, Termin eintragen), führe die Werkzeuge SOFORT per Function Call aus.
   - Falls 'guildId' in einem Discord-Tool verlangt wird, verwende die oben angegebene Server-ID "${guild?.id || ""}".

2. RÜCKFRAGEN, OPTIONEN & ENTSCHEIDUNGEN AN DEN BENUTZER:
   - Wenn du eine Rückfrage hast, wichtige Informationen fehlen, du dem Benutzer Optionen zur Auswahl anbieten möchtest (z. B. Vorlagen, Zeiten, Kategorien) oder eine Bestätigung vor einer wichtigen Aktion (z. B. dem Veröffentlichen einer Ankündigung) benötigst:
     RUFE DAS WERKZEUG 'erstelle_benachrichtigung' AUF!
       * titel: Kurzer, aussagekräftiger Titel (z. B. 'Testankündigung bestätigen' oder 'Auswahl treffen')
       * nachricht: Die konkrete Frage UND die VOLLSTÄNDIGE Entwurfsvorschau an den Benutzer.
         STRENGE PFLICHT BEI ENTWÜRFEN (z. B. Discord-Ankündigung, E-Mail, Termine):
         Du MUSST im Parameter 'nachricht' zwingend den gesamten Entwurfstext mit allen Angaben einfügen!
         Beispiel-Formatierung für 'nachricht':
         "📢 **Vorschau der Ankündigung:**\n**Titel:** <Titel>\n**Kanal:** #<Kanalname>\n**Pings/Rollen:** <Rollen/Pings>\n**Inhalt:**\n<Vollständiger Text der Ankündigung>\n\nSoll ich diese Ankündigung jetzt auf dem Discord-Server veröffentlichen?"
         Sag NIEMALS nur 'Ich habe einen Entwurf vorbereitet' ohne den Text zu zeigen! Der Benutzer muss den gesamten Text prüfen können, bevor er zustimmt!
       * typ: 'question'
       * buttons: Liste von interaktiven Buttons für den Benutzer, z. B.:
         [
           { label: "Ja, abschicken", action: "reply", replyText: "Ja, bitte die Testankündigung abschicken!", style: "primary" },
           { label: "Nein, abbrechen", action: "dismiss", replyText: "Nein, bitte abbrechen.", style: "secondary" }
         ]
     Diese Benachrichtigung wird sowohl in der App auf dem Arbeitstisch als auch direkt im Discord-Kanal als interaktive Buttons gerendert!
   - WICHTIG: Gib die vollständige Vorschau der Ankündigung auch direkt in deinem Begleittext aus, damit der Benutzer den Text überall sofort sieht.

3. KEINE SCHEINERFOLGE:
   - Behaupte NIEMALS, etwas ausgeführt oder veröffentlicht zu haben, wenn das Tool nicht erfolgreich aufgerufen wurde.

4. ANTWORTEN:
   - Antworte stets auf Deutsch, präzise, hilfsbereit und freundlich.${agentConfig?.systemPrompt?.trim() ? `\n\nSPEZIELLE ROLLENANWEISUNGEN FÜR DIESEN AGENTEN:\n${agentConfig.systemPrompt.trim()}` : ""}`;

      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ functionDeclarations: pluginManager.getGeminiTools(conversation.triggerType || undefined) } as any],
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
          parts: [{ text: systemPrompt }]
        }
      });

      const chat = model.startChat({
        history: chatHistory
      });

      const initialResult = await chat.sendMessage(content);
      let currentResponse = initialResult.response;
      const executedTools: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string }[] = [];
      const createdNotifications: any[] = [];
      let step = 0;
      const MAX_STEPS = 6;
      let aiText = "";

      while (step < MAX_STEPS) {
        const cand = currentResponse.candidates?.[0];
        if (cand?.finishReason === "MALFORMED_FUNCTION_CALL") {
          console.warn("[AgentRunService.executeDiscordRun] MALFORMED_FUNCTION_CALL erkannt. Sende Korrekturaufforderung...");
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

        console.log(`[AgentRunService.executeDiscordRun] Agent führt ${calls.length} Werkzeug(e) aus:`, calls.map((c: any) => c.name));

        const functionResponses = [];
        for (const call of calls) {
          let toolResult: any;
          const toolLog: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string } = {
            name: call.name,
            args: call.args,
            status: "success"
          };

          if (step === MAX_STEPS - 1) {
            toolLog.status = "limit_reached";
            toolLog.message = "Limit erreicht";
            toolResult = { status: "limit_reached", message: "Limit erreicht. Bitte fasse das Ergebnis zusammen." };
          } else {
            try {
              let toolArgs = (call.args || {}) as any;
              if (call.name === "erstelle_benachrichtigung") {
                toolArgs.conversationId = conversation.id;
                toolArgs.sourceType = "discord";
                toolArgs.sourceId = triggerId;
              }
              toolResult = await pluginManager.executeTool(call.name, toolArgs);
              if (toolResult && toolResult.status === "error") {
                toolLog.status = "error";
                toolLog.message = toolResult.message || "Fehler";
              }

              if (call.name === "erstelle_benachrichtigung" && toolResult && toolResult.notificationId) {
                const notifRecord = await prisma.agentNotification.findUnique({
                  where: { id: toolResult.notificationId }
                });
                if (notifRecord) {
                  createdNotifications.push(notifRecord);
                }
              }
            } catch (err: any) {
              console.error("[AgentRunService.executeDiscordRun] Tool-Fehler:", err);
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
          aiText = "Anfrage verarbeitet.";
        }
      }

      if (executedTools.length > 0) {
        aiText = `${aiText.trim()}${AgentRunService.formatExecutedToolsSummary(executedTools)}`;
      }

      await prisma.chatMessage.create({
        data: {
          role: "ai",
          text: aiText,
          conversationId: conversation.id
        }
      });

      const hasPendingQuestion = createdNotifications.some(n => n.type === "question" || n.type === "action_required");
      const finalStatus = hasPendingQuestion ? "waiting_for_user" : "completed";

      const updatedConv = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: finalStatus,
          summary: aiText.slice(0, 500)
        }
      });

      const activeNotification = createdNotifications.length > 0
        ? createdNotifications[createdNotifications.length - 1]
        : null;

      console.log(`[AgentRunService] ✅ Agent Run ${conversation.id} beendet mit Status '${finalStatus}'!`);

      return {
        success: true,
        conversationId: conversation.id,
        status: finalStatus,
        text: aiText,
        notification: activeNotification,
        notifications: createdNotifications,
        executedTools,
        conversation: updatedConv
      };

    } catch (err: any) {
      console.error(`[AgentRunService] ❌ Fehler im Discord Agent Run ${conversation.id}:`, err);
      await prisma.chatMessage.create({
        data: {
          role: "ai",
          text: `❌ Fehler bei der Bearbeitung: ${err?.message || "Unbekannter Fehler"}`,
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

      return {
        success: false,
        conversationId: conversation.id,
        status: "error",
        text: `Fehler bei der Bearbeitung: ${err?.message || "Unbekannter Fehler"}`,
        notification: null,
        notifications: [],
        executedTools: [],
        conversation: updatedConv
      };
    }
  }

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

    // Verlauf validieren (muss zwingend mit 'user' beginnen und mit 'model' enden)
    const chatHistory = AgentRunService.formatGeminiChatHistory(messages.slice(0, -1), 14);

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

    const isDiscord = conversation.triggerType === "discord";
    const systemPrompt = isDiscord
      ? `Du bist ein autonomer persönlicher KI-Agent im System, verbunden mit dem Discord-Bot.
Du bearbeitest eine Rückmeldung oder Fortsetzung des Benutzers auf Discord.
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen.

OBERSTE REGELN:
- Wenn der Benutzer einer Aktion zugestimmt hat (z. B. 'Ja, bitte abschicken', 'Ja, erstelle die Aufgabe', 'Ja, trage den Termin ein'), führe das entsprechende Werkzeug (wie 'discord_send_announcement', 'fuege_termin_hinzu', 'erstelle_aufgabe') SOFORT per Function Call aus!
- Falls du weitere Rückfragen hast oder neue Optionen anbietest, rufe erneut 'erstelle_benachrichtigung' auf (typ='question' mit buttons).
- Melde NIEMALS Scheinerfolge.
- Antworte auf Deutsch, präzise und freundlich.`
      : `Du bist ein autonomer persönlicher KI-Agent im System. Du bearbeitest Anweisungen und Antworten des Benutzers zu einem vorherigen Vorgang (z.B. E-Mail).
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen.

OBERSTE REGELN:
- Wenn der Benutzer einer Aktion zugestimmt hat (z. B. 'Ja, trage den Termin bitte ein' oder 'Ja, erstelle die Aufgabe'), führe das entsprechende Werkzeug ('fuege_termin_hinzu', 'erstelle_aufgabe' etc.) SOFORT per Function Call aus!
- Melde NIEMALS Scheinerfolge.
- Antworte auf Deutsch, präzise und freundlich.`;

    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ functionDeclarations: pluginManager.getGeminiTools(conversation.triggerType || undefined) } as any],
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
        parts: [{ text: systemPrompt }]
      }
    });

    const chat = model.startChat({
      history: chatHistory
    });

    const initialResult = await chat.sendMessage(userMessage);
    let currentResponse = initialResult.response;
    const executedTools: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string }[] = [];
    const createdNotifications: any[] = [];
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
            if (conversation.triggerType) {
              toolArgs.sourceType = conversation.triggerType;
            }
            if (conversation.triggerId) {
              toolArgs.sourceId = conversation.triggerId;
            }
          }
          toolResult = await pluginManager.executeTool(call.name, toolArgs);
          if (call.name === "erstelle_benachrichtigung" && toolResult && toolResult.notificationId) {
            const notifRecord = await prisma.agentNotification.findUnique({
              where: { id: toolResult.notificationId }
            });
            if (notifRecord) {
              createdNotifications.push(notifRecord);
            }
          }
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
      aiText = `${aiText.trim()}${AgentRunService.formatExecutedToolsSummary(executedTools)}`;
    }

    // AI-Nachricht in DB speichern
    const aiMessage = await prisma.chatMessage.create({
      data: {
        role: "ai",
        text: aiText,
        conversationId
      }
    });

    const hasPendingQuestion = createdNotifications.some(n => n.type === "question" || n.type === "action_required");
    const finalStatus = hasPendingQuestion ? "waiting_for_user" : "completed";

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: finalStatus,
        summary: aiText.slice(0, 500)
      }
    });

    const activeNotification = createdNotifications.length > 0
      ? createdNotifications[createdNotifications.length - 1]
      : null;

    return {
      success: true,
      conversationId,
      status: finalStatus,
      aiMessage,
      executedTools,
      text: aiText,
      notification: activeNotification,
      notifications: createdNotifications
    };
  }

  /**
   * Führt einen flexiblen Agent Run basierend auf Agent-ID oder Trigger aus
   * (z. B. für Webhooks, Zeitpläne, Kalender-Events, Aufgaben oder manuelle Aufrufe)
   */
  static async executeTriggerRun(
    params: {
      agentId?: string;
      trigger?: string;
      prompt: string;
      title?: string;
      metadata?: any;
    },
    prisma: PrismaClient,
    pluginManager: PluginManager
  ): Promise<{
    success: boolean;
    conversationId?: string;
    text: string;
    executedTools: any[];
    notifications: any[];
    status?: string;
    error?: string;
  }> {
    const agentConfig = getAgentConfig(params.agentId || params.trigger || "manual");
    if (agentConfig && agentConfig.isEnabled === false) {
      return {
        success: false,
        text: `Der Agent '${agentConfig.name}' ist aktuell deaktiviert.`,
        executedTools: [],
        notifications: [],
        error: `Agent '${agentConfig.name}' ist deaktiviert.`
      };
    }

    const agentName = agentConfig?.name || "Autonomer Agent";
    const triggerType = agentConfig?.trigger || params.trigger || "manual";

    const conversation = await prisma.conversation.create({
      data: {
        title: (params.title || `🤖 ${agentName}: ${params.prompt}`).slice(0, 80),
        isAgentRun: true,
        triggerType,
        triggerId: params.agentId || undefined,
        status: "running"
      }
    });

    console.log(`[AgentRunService] 🚀 Starte Trigger Run ${conversation.id} (${agentName}, Trigger: ${triggerType})...`);

    await prisma.chatMessage.create({
      data: {
        role: "user",
        text: params.prompt,
        conversationId: conversation.id
      }
    });

    const now = new Date();
    const dateString = now.toLocaleDateString("de-DE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const timeString = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const todayIso = now.toISOString().split("T")[0];

    let systemPrompt = `Du bist ein autonomer KI-Agent '${agentName}' im System.
Auslöser: ${triggerType}.
Heute ist ${dateString}, ${todayIso}, es ist ${timeString} Uhr (deutsche Lokalzeit, UTC+2).
Nutze '${todayIso}' als Basis für alle Datumsberechnungen.

OBERSTE REGELN:
- Wenn Handlungsbedarf besteht, führe die benötigten Werkzeuge direkt per Function Call aus.
- Wenn eine Entscheidung oder Bestätigung vom Benutzer benötigt wird, rufe 'erstelle_benachrichtigung' auf (typ='question' mit passenden buttons).
- Melde NIEMALS Scheinerfolge.
- Antworte auf Deutsch, präzise und strukturiert.`;

    if (agentConfig?.description) {
      systemPrompt += `\n\nAUFGABENBESCHREIBUNG:\n${agentConfig.description}`;
    }
    if (agentConfig?.systemPrompt?.trim()) {
      systemPrompt += `\n\nSPEZIELLE ROLLENANWEISUNGEN FÜR DIESEN AGENTEN:\n${agentConfig.systemPrompt.trim()}`;
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
    const userModel = getSettings().aiModel;
    const modelName = userModel || process.env.GEMINI_MODEL || "gemini-3.5-flash";

    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ functionDeclarations: pluginManager.getGeminiTools(agentConfig?.id || triggerType) } as any],
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
        parts: [{ text: systemPrompt }]
      }
    });

    const chat = model.startChat({ history: [] });
    const initialResult = await chat.sendMessage(params.prompt);
    let currentResponse = initialResult.response;
    const executedTools: { name: string; args: any; status: "success" | "error" | "limit_reached"; message?: string }[] = [];
    const createdNotifications: any[] = [];
    let step = 0;
    const MAX_STEPS = 6;
    let aiText = "";

    while (step < MAX_STEPS) {
      const cand = currentResponse.candidates?.[0];
      const calls = cand?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall) || [];

      if (!calls || calls.length === 0) {
        aiText = cand?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join("\n") || "";
        break;
      }

      step++;
      const functionResponses: any[] = [];

      for (const call of calls) {
        try {
          const result = await pluginManager.executeTool(call.name, call.args || {}, agentConfig?.id || triggerType);
          executedTools.push({ name: call.name, args: call.args || {}, status: "success" });
          if (call.name === "erstelle_benachrichtigung" && result?.notification) {
            createdNotifications.push(result.notification);
          }
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { result: result !== undefined ? result : { success: true } }
            }
          });
        } catch (err: any) {
          executedTools.push({ name: call.name, args: call.args || {}, status: "error", message: err?.message });
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: err?.message || "Fehler bei Ausführung" }
            }
          });
        }
      }

      const nextResult = await chat.sendMessage(functionResponses as any);
      currentResponse = nextResult.response;
    }

    if (!aiText) {
      const finalCand = currentResponse.candidates?.[0];
      aiText = finalCand?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join("\n") || "";
    }

    if (executedTools.length > 0) {
      aiText = `${aiText.trim()}${AgentRunService.formatExecutedToolsSummary(executedTools)}`;
    }

    await prisma.chatMessage.create({
      data: {
        role: "ai",
        text: aiText || "Ausführung abgeschlossen.",
        conversationId: conversation.id
      }
    });

    const finalStatus = executedTools.some(t => t.status === "error") ? "completed_with_errors" : "completed";
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: finalStatus,
        summary: aiText.slice(0, 300)
      }
    });

    return {
      success: true,
      conversationId: conversation.id,
      text: aiText,
      executedTools,
      notifications: createdNotifications,
      status: finalStatus
    };
  }

}
