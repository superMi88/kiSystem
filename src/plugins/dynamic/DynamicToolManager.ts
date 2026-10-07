import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  DynamicToolDefinition,
  validateDynamicToolDefinition,
  toGeminiDeclaration,
  toMcpTool,
  sanitizeTool
} from "./dynamicToolSchema.js";

const DEFAULT_STORE_PATH = path.join(process.cwd(), "dynamic-tools.json");
const DEFAULT_TIMEOUT_MS = 15000;

export class DynamicToolManager {
  private tools: Map<string, DynamicToolDefinition> = new Map();
  private filePath: string;
  private prisma: PrismaClient | null = null;
  private initialized = false;

  constructor(prisma?: PrismaClient, storageFilePath?: string) {
    this.prisma = prisma || null;
    this.filePath = storageFilePath || DEFAULT_STORE_PATH;
  }

  /**
   * Initialisiert den Manager und lädt gespeicherte Tools aus Datei und Datenbank
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // 1. Zuerst aus JSON-Datei laden (offline-resilient)
    this.loadFromFile();

    // 2. Falls Prisma verfügbar ist, Tools aus der Datenbank laden/abgleichen
    if (this.prisma) {
      await this.syncFromDatabase().catch((err) => {
        console.warn("[DynamicToolManager] Hinweis: DB-Sync nicht möglich, nutze Dateispeicher:", err.message);
      });
      await this.syncToDatabase().catch((err) => {
        console.warn("[DynamicToolManager] Hinweis: DB-Spiegelung nicht möglich:", err.message);
      });
    }

    this.initialized = true;
    console.log(`[DynamicToolManager] Initialisiert mit ${this.tools.size} Tool(s).`);
  }

  /**
   * Lädt die Tool-Definitionen aus der lokalen JSON-Datei
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          const outdated = ['send_announcement', 'get_announcement_template', 'get_announcement_instructions', 'discord_get_announcement_instructions'];
          for (const item of data) {
            if (outdated.includes(item.name)) continue;
            const validation = validateDynamicToolDefinition(item);
            if (validation.valid) {
              this.tools.set(item.name, item);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("[DynamicToolManager] Fehler beim Laden der dynamic-tools.json:", error.message);
    }
  }

  /**
   * Schreibt die aktuellen Tools persistent in die JSON-Datei
   */
  private saveToFile(): void {
    try {
      const data = Array.from(this.tools.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (error: any) {
      console.error("[DynamicToolManager] Fehler beim Speichern in dynamic-tools.json:", error.message);
    }
  }

  /**
   * Synchronisiert mit PostgreSQL / Prisma DynamicTool Tabelle (falls existent)
   */
  private async syncFromDatabase(): Promise<void> {
    if (!this.prisma) return;
    try {
      const dbClient = this.prisma as any;
      if (typeof dbClient.dynamicTool?.findMany === "function") {
        const dbTools = await dbClient.dynamicTool.findMany();
        for (const record of dbTools) {
          const toolDef: DynamicToolDefinition = {
            name: record.name,
            description: record.description,
            detailedInstructions: record.detailedInstructions || undefined,
            parameters: typeof record.parameters === "string" ? JSON.parse(record.parameters) : record.parameters,
            returnValues: record.returnValues
              ? (typeof record.returnValues === "string" ? JSON.parse(record.returnValues) : record.returnValues)
              : undefined,
            endpointUrl: record.endpointUrl,
            authentication: record.authType && record.authType !== "none"
              ? {
                  type: record.authType as any,
                  header: record.authHeader || undefined,
                  token: record.authToken || undefined
                }
              : undefined,
            provider: record.provider || undefined,
            isEnabled: record.isEnabled !== false,
            createdAt: record.createdAt?.toISOString(),
            updatedAt: record.updatedAt?.toISOString()
          };

          const val = validateDynamicToolDefinition(toolDef);
          if (val.valid) {
            this.tools.set(toolDef.name, toolDef);
          }
        }
      }
    } catch (e: any) {
      // Prisma-Tabelle existiert evtl. noch nicht
      console.warn("[DynamicToolManager] DB-Tabelle noch nicht verfügbar:", e.message);
    }
  }

  /**
   * Spiegelt alle im Arbeitsspeicher/Dateispeicher vorhandenen Tools in die PostgreSQL-Datenbank
   */
  private async syncToDatabase(): Promise<void> {
    if (!this.prisma || this.tools.size === 0) return;
    try {
      const dbClient = this.prisma as any;
      if (typeof dbClient.dynamicTool?.upsert === "function") {
        for (const tool of this.tools.values()) {
          await dbClient.dynamicTool.upsert({
            where: { name: tool.name },
            update: {
              description: tool.description,
              detailedInstructions: tool.detailedInstructions || null,
              parameters: tool.parameters as any,
              returnValues: (tool.returnValues || null) as any,
              endpointUrl: tool.endpointUrl,
              authType: tool.authentication?.type || "none",
              authHeader: tool.authentication?.header || null,
              authToken: tool.authentication?.token || null,
              provider: tool.provider || null,
              isEnabled: tool.isEnabled !== false
            },
            create: {
              name: tool.name,
              description: tool.description,
              detailedInstructions: tool.detailedInstructions || null,
              parameters: tool.parameters as any,
              returnValues: (tool.returnValues || null) as any,
              endpointUrl: tool.endpointUrl,
              authType: tool.authentication?.type || "none",
              authHeader: tool.authentication?.header || null,
              authToken: tool.authentication?.token || null,
              provider: tool.provider || null,
              isEnabled: tool.isEnabled !== false
            }
          });
        }
      }
    } catch (err: any) {
      console.warn("[DynamicToolManager] DB-Spiegelung fehlgeschlagen:", err.message);
    }
  }

  /**
   * Registriert oder aktualisiert ein dynamisches Tool
   */
  async registerTool(toolDef: any): Promise<{ success: boolean; tool?: DynamicToolDefinition; errors?: string[] }> {
    const validation = validateDynamicToolDefinition(toolDef);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const now = new Date().toISOString();
    const existing = this.tools.get(toolDef.name);

    const fullDef: DynamicToolDefinition = {
      name: toolDef.name,
      description: toolDef.description,
      detailedInstructions: toolDef.detailedInstructions || existing?.detailedInstructions,
      parameters: toolDef.parameters,
      returnValues: toolDef.returnValues || existing?.returnValues,
      endpointUrl: toolDef.endpointUrl,
      authentication: toolDef.authentication || existing?.authentication,
      provider: toolDef.provider || existing?.provider || "external",
      isEnabled: toolDef.isEnabled !== undefined ? !!toolDef.isEnabled : (existing?.isEnabled !== undefined ? existing.isEnabled : true),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    this.tools.set(fullDef.name, fullDef);
    this.saveToFile();

    // In DB spiegeln, falls aktiv
    if (this.prisma) {
      try {
        const dbClient = this.prisma as any;
        if (typeof dbClient.dynamicTool?.upsert === "function") {
          await dbClient.dynamicTool.upsert({
            where: { name: fullDef.name },
            update: {
              description: fullDef.description,
              parameters: fullDef.parameters as any,
              returnValues: (fullDef.returnValues || null) as any,
              endpointUrl: fullDef.endpointUrl,
              authType: fullDef.authentication?.type || "none",
              authHeader: fullDef.authentication?.header || null,
              authToken: fullDef.authentication?.token || null,
              provider: fullDef.provider || null,
              isEnabled: fullDef.isEnabled
            },
            create: {
              name: fullDef.name,
              description: fullDef.description,
              parameters: fullDef.parameters as any,
              returnValues: (fullDef.returnValues || null) as any,
              endpointUrl: fullDef.endpointUrl,
              authType: fullDef.authentication?.type || "none",
              authHeader: fullDef.authentication?.header || null,
              authToken: fullDef.authentication?.token || null,
              provider: fullDef.provider || null,
              isEnabled: fullDef.isEnabled
            }
          });
        }
      } catch (err: any) {
        console.warn(`[DynamicToolManager Warning] DB-Sync für '${fullDef.name}' übersprungen:`, err.message);
      }
    }

    console.log(`[DynamicToolManager] ✅ Tool '${fullDef.name}' von Provider '${fullDef.provider}' erfolgreich registriert.`);
    return { success: true, tool: sanitizeTool(fullDef) };
  }

  /**
   * Registriert mehrere Tools im Batch
   */
  async registerTools(toolDefs: any[]): Promise<{ registered: string[]; failed: { name: string; errors: string[] }[] }> {
    const registered: string[] = [];
    const failed: { name: string; errors: string[] }[] = [];

    for (const item of toolDefs) {
      const res = await this.registerTool(item);
      if (res.success && res.tool) {
        registered.push(res.tool.name);
      } else {
        failed.push({
          name: item?.name || "unbenannt",
          errors: res.errors || ["Unbekannter Fehler"]
        });
      }
    }

    return { registered, failed };
  }

  /**
   * Deregistriert ein Tool
   */
  async unregisterTool(name: string): Promise<boolean> {
    const existed = this.tools.delete(name);
    if (existed) {
      this.saveToFile();

      if (this.prisma) {
        try {
          const dbClient = this.prisma as any;
          if (typeof dbClient.dynamicTool?.delete === "function") {
            await dbClient.dynamicTool.delete({ where: { name } });
          }
        } catch (e) {
          // Ignorieren falls nicht in DB
        }
      }
      console.log(`[DynamicToolManager] 🗑️ Tool '${name}' erfolgreich deregistriert.`);
    }
    return existed;
  }

  /**
   * Aktiviert oder deaktiviert ein registriertes Tool
   */
  async toggleTool(name: string, isEnabled?: boolean): Promise<DynamicToolDefinition | null> {
    const tool = this.tools.get(name);
    if (!tool) return null;

    tool.isEnabled = isEnabled !== undefined ? isEnabled : !tool.isEnabled;
    tool.updatedAt = new Date().toISOString();
    this.saveToFile();

    if (this.prisma) {
      try {
        const dbClient = this.prisma as any;
        if (typeof dbClient.dynamicTool?.update === "function") {
          await dbClient.dynamicTool.update({
            where: { name },
            data: { isEnabled: tool.isEnabled }
          });
        }
      } catch (e) {}
    }

    return sanitizeTool(tool);
  }

  /**
   * Prüft, ob ein Tool registriert ist
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Gibt alle registrierten Tools zurück (sensible Auth-Tokens werden maskiert)
   */
  /**
   * Gibt alle eindeutigen Provider-Namen der registrierten Tools zurück
   */
  getProviders(): string[] {
    const set = new Set<string>();
    for (const tool of this.tools.values()) {
      if (tool.provider) set.add(tool.provider);
    }
    if (set.size === 0) set.add("discord-bot");
    return Array.from(set);
  }

  getTools(filter?: { provider?: string; enabledOnly?: boolean }): DynamicToolDefinition[] {
    let list = Array.from(this.tools.values());

    if (filter?.provider) {
      list = list.filter((t) => t.provider === filter.provider);
    }
    if (filter?.enabledOnly) {
      list = list.filter((t) => t.isEnabled !== false);
    }

    return list.map(sanitizeTool);
  }

  /**
   * Holt eine einzelne Tool-Definition (optional mit echtem Token für die Ausführung)
   */
  getTool(name: string, includeSecrets = false): DynamicToolDefinition | null {
    const tool = this.tools.get(name);
    if (!tool) return null;
    return includeSecrets ? tool : sanitizeTool(tool);
  }

  /**
   * Liefert Gemini Function Declarations für alle aktiven dynamischen Tools
   */
  getGeminiDeclarations(): any[] {
    return Array.from(this.tools.values())
      .filter((t) => t.isEnabled !== false)
      .map(toGeminiDeclaration);
  }

  /**
   * Liefert MCP-Tool-Definitionen für alle aktiven dynamischen Tools
   */
  getMCPTools(): any[] {
    return Array.from(this.tools.values())
      .filter((t) => t.isEnabled !== false)
      .map(toMcpTool);
  }

  /**
   * Führt ein registriertes Remote-Tool via HTTP POST aus
   */
  async executeTool(name: string, args: any = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Dynamisches Tool '${name}' wurde nicht gefunden.`);
    }

    if (tool.isEnabled === false) {
      throw new Error(`Das Tool '${name}' ist derzeit deaktiviert.`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "kiSystem-DynamicToolClient/1.0"
    };

    // Authentifizierung aufbauen
    if (tool.authentication) {
      const { type, header, token } = tool.authentication;
      if (token) {
        if (type === "apiKey") {
          const headerName = header || "x-api-key";
          headers[headerName] = token;
          headers["Authorization"] = `Bearer ${token}`; // Fallback für Endpunkte, die Bearer erwarten
        } else if (type === "bearer") {
          const headerName = header || "Authorization";
          headers[headerName] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
          headers["x-api-key"] = token;
        }
      }
    }

    console.log(`[DynamicToolManager] Sende Remote-Aufruf an '${name}' (${tool.endpointUrl})...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(tool.endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(args || {}),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[DynamicToolManager Error] HTTP ${response.status} von ${tool.endpointUrl}:`, errText);
        return {
          status: "error",
          message: `Fehler beim Ausführen von '${name}' (HTTP ${response.status}): ${errText || response.statusText}`
        };
      }

      const result = await response.json().catch(async () => {
        const text = await response.text();
        return { success: true, text };
      });

      console.log(`[DynamicToolManager] Remote-Antwort für '${name}' erhalten.`);
      return result;
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
      const errMsg = isTimeout
        ? `Timeout (${timeoutMs / 1000}s) beim Aufruf des Tools '${name}' unter ${tool.endpointUrl}.`
        : `Verbindungsfehler zu Tool '${name}' (${tool.endpointUrl}): ${err.message}`;

      console.error(`[DynamicToolManager Exception]`, errMsg);
      return {
        status: "error",
        message: errMsg
      };
    }
  }
}
