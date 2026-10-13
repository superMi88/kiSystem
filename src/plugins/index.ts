import { createInstructionsPlugin } from "./Instructions/index.js";
import { PrismaClient } from "@prisma/client";
import { Plugin, PluginTool } from "./types.js";
import { appLauncherPlugin } from "./AppLauncher/index.js";
import { memoryPlugin } from "./Memory/index.js";
import { calendarPlugin } from "./Calendar/index.js";
import { imageGeneratorPlugin } from "./ImageGenerator/index.js";
import { timerPlugin } from "./Timer/index.js";
import { projectsPlugin } from "./Projects/index.js";
import { tasksPlugin } from "./Tasks/index.js";
import { journalPlugin } from "./Journal/index.js";
import { mailPlugin } from "./Mail/index.js";
import { notificationsPlugin } from "./Notifications/index.js";
import { locationsPlugin } from "./Locations/index.js";
import { MediaPlugin } from "./Media/index.js";
import { getSettings, getAgentConfig, getAgentPluginPermission, getAgentDetailedPluginPermission, PluginPermissionLevel } from "../settings.js";

import { DynamicToolManager } from "./dynamic/DynamicToolManager.js";

export const MUTATING_PLUGIN_TOOLS: Record<string, string[]> = {
  Calendar: ["fuege_termin_hinzu", "bearbeite_termin", "loesche_termin", "wiederherstellen_termin"],
  Tasks: ["erstelle_aufgabe", "aktualisiere_aufgabe", "loesche_aufgabe", "erledige_aufgabe", "wiedereroeffnen_aufgabe", "wiederherstellen_aufgabe"],
  Mail: ["sende_mail", "antworte_mail"],
  Projects: ["erstelle_projekt", "bearbeite_projekt", "loesche_projekt", "erstelle_notiz", "bearbeite_notiz", "loesche_notiz"],
  Journal: ["eintrag_ins_tagebuch"],
  AppLauncher: ["starte_programm"],
  Timer: ["erstelle_timer", "loesche_timer", "bearbeite_timer"],
  Memory: ["merke_ueber_mich", "merke_ueber_person", "bearbeite_erinnerung", "loesche_erinnerung", "loesche_person", "wiederherstellen_person", "setze_person_geburtstag", "aktualisiere_person_biografie", "fuege_person_fakt_hinzu", "loesche_person_fakt", "wiederherstellen_person_fakt", "setze_person_favorit", "verwalte_person_alias"],
  Locations: ["erstelle_ort", "bearbeite_ort", "loesche_ort", "verknuepfe_person_ort", "entferne_person_ort_verknuepfung", "erstelle_wegzeit_termin"],
  Media: ["verknuepfe_datei", "aktualisiere_datei_beschreibung"]
};

export const PROPOSAL_PLUGIN_TOOLS: Record<string, string> = {
  schlage_mail_antwort_vor: "Mail",
  schlage_termin_vor: "Calendar",
  schlage_aufgabe_vor: "Tasks"
};

export class PluginManager {
  private plugins: Plugin[] = [];
  private toolsMap: Map<string, PluginTool> = new Map();
  public dynamicTools: DynamicToolManager;

  constructor(private prisma: PrismaClient) {
    this.dynamicTools = new DynamicToolManager(prisma);

    // Hier werden die Plugins registriert
    this.registerPlugin(createInstructionsPlugin(() => this));
    this.registerPlugin(appLauncherPlugin);
    this.registerPlugin(memoryPlugin);
    this.registerPlugin(calendarPlugin);
    this.registerPlugin(imageGeneratorPlugin);
    this.registerPlugin(timerPlugin);
    this.registerPlugin(projectsPlugin);
    this.registerPlugin(tasksPlugin);
    this.registerPlugin(journalPlugin);
    this.registerPlugin(mailPlugin);
    this.registerPlugin(notificationsPlugin);
    this.registerPlugin(locationsPlugin);
    this.registerPlugin(MediaPlugin);
  }

  async init(): Promise<void> {
    await this.dynamicTools.init();
  }

  registerPlugin(plugin: Plugin) {
    this.plugins.push(plugin);
    for (const tool of plugin.tools) {
      if (this.toolsMap.has(tool.definition.name)) {
        console.warn(`Tool Konflikt: ${tool.definition.name} existiert bereits.`);
      }
      this.toolsMap.set(tool.definition.name, tool);
    }
    console.log(`Plugin geladen: ${plugin.name} (${plugin.tools.length} Tools)`);
  }

  /**
   * Prüft, ob ein Tool ein internes Plugin-Tool ist
   */
  hasInternalTool(name: string): boolean {
    return this.plugins.some(p => p.tools.some(t => t.definition.name === name));
  }

  getPluginsInfo() {
    const internalPlugins = this.plugins.map(p => ({
      name: p.name,
      description: p.description,
      enabled: true,
      isDynamic: false
    }));

    // Dynamische Tools als Übersicht anfügen
    const dynamicTools = this.dynamicTools.getTools();
    if (dynamicTools.length > 0) {
      internalPlugins.push({
        name: "Externe Tools",
        description: `${dynamicTools.length} dynamisch registrierte(s) Remote-Tool(s)`,
        enabled: true,
        isDynamic: true
      });
    }

    return internalPlugins;
  }

  getGeminiTools(agentType?: string) {
    const settings = getSettings();
    const disabledTools = settings.disabledTools || [];
    const agentConfig = agentType ? getAgentConfig(agentType) : null;
    if (agentConfig && agentConfig.isEnabled === false) return [];
    
    const activeTools: any[] = [];
    for (const plugin of this.plugins) {
      const detailed = agentConfig
        ? getAgentDetailedPluginPermission(agentConfig, plugin.name)
        : { read: "yes" as const, write: "yes" as const };

      // Wenn sowohl Lesen als auch Schreiben für dieses Plugin gesperrt sind, komplett überspringen
      // (Notifications und Instructions bleiben als Basisfunktionen erhalten)
      if (detailed.read === "no" && detailed.write === "no" && plugin.name !== "Notifications" && plugin.name !== "Instructions") {
        continue;
      }

      const mutatingForPlugin = MUTATING_PLUGIN_TOOLS[plugin.name] || [];

      for (const tool of plugin.tools) {
        if (disabledTools.includes(tool.definition.name)) continue;

        // Prüfen, ob es sich um ein Vorschlag-Tool für ein bestimmtes Ziel-Plugin handelt
        if (plugin.name === "Notifications" && PROPOSAL_PLUGIN_TOOLS[tool.definition.name]) {
          const targetPlugin = PROPOSAL_PLUGIN_TOOLS[tool.definition.name];
          const targetDetailed = agentConfig
            ? getAgentDetailedPluginPermission(agentConfig, targetPlugin)
            : { read: "yes" as const, write: "yes" as const };
          // Wenn Aktionen für das Zielplugin auf "nein" stehen, darf der Agent auch keine Vorschläge machen
          if (targetDetailed.write === "no") {
            continue;
          }
        }

        const isMutating = mutatingForPlugin.includes(tool.definition.name);

        // Mutierende Tools prüfen:
        if (isMutating) {
          // Bei "no" oder "ask" werden direkte Ausführungstools dem Agenten NIEMALS übergeben!
          if (detailed.write === "no" || detailed.write === "ask") {
            continue;
          }
        } else {
          // Lese-Tools prüfen (für Nicht-Basisfunktionen):
          if (detailed.read === "no" && plugin.name !== "Notifications" && plugin.name !== "Instructions") {
            continue;
          }
        }

        activeTools.push({
          name: tool.definition.name,
          description: tool.definition.description,
          parameters: tool.definition.parameters
        });
      }
    }

    // Dynamische Tools für Gemini anfügen
    if (!agentConfig || agentConfig.allowAllDynamicTools || (agentConfig.allowedDynamicProviders && agentConfig.allowedDynamicProviders.length > 0)) {
      const dynamicDeclarations = this.dynamicTools.getGeminiDeclarations();
      if (agentConfig && agentConfig.allowedDynamicProviders && !agentConfig.allowAllDynamicTools) {
        const allowedProviders = agentConfig.allowedDynamicProviders;
        const filteredDeclarations = dynamicDeclarations.filter((d: any) => {
          const toolDef = this.dynamicTools.getTool(d.name);
          return toolDef && toolDef.provider && allowedProviders.includes(toolDef.provider);
        });
        const enabledFiltered = filteredDeclarations.filter((d: any) => !disabledTools.includes(d.name));
        activeTools.push(...enabledFiltered);
      } else {
        const enabledDeclarations = dynamicDeclarations.filter((d: any) => !disabledTools.includes(d.name));
        activeTools.push(...enabledDeclarations);
      }
    }

    return activeTools;
  }

  getMCPTools() {
    const settings = getSettings();
    const disabled = settings.disabledPlugins || [];
    
    const activeTools: any[] = [];
    for (const plugin of this.plugins) {
      if (disabled.includes(plugin.name)) continue;
      for (const tool of plugin.tools) {
        activeTools.push({
          name: tool.definition.name,
          description: tool.definition.description,
          inputSchema: tool.definition.parameters || { type: "object", properties: {} }
        });
      }
    }

    // Dynamische MCP Tools anfügen
    const dynamicMcp = this.dynamicTools.getMCPTools();
    activeTools.push(...dynamicMcp);

    return activeTools;
  }

  async executeTool(name: string, args: any, agentType?: string) {
    const settings = getSettings();
    const disabledTools = settings.disabledTools || [];
    const agentConfig = agentType ? getAgentConfig(agentType) : null;
    if (agentConfig && agentConfig.isEnabled === false) {
      throw new Error(`Zugriff verweigert: Der Agent '${agentConfig.name || agentType}' ist aktuell deaktiviert.`);
    }

    if (disabledTools.includes(name)) {
      throw new Error(`Zugriff verweigert: Das Werkzeug '${name}' ist aktuell systemweit deaktiviert.`);
    }

    // 1. Zuerst prüfen, ob es sich um ein dynamisches Remote-Tool handelt
    if (this.dynamicTools.hasTool(name)) {
      if (agentConfig && !agentConfig.allowAllDynamicTools) {
        const toolDef = this.dynamicTools.getTool(name);
        const allowedProviders = agentConfig.allowedDynamicProviders || [];
        if (toolDef && toolDef.provider && !allowedProviders.includes(toolDef.provider)) {
          throw new Error(`Zugriff verweigert: Tool '${name}' von Provider '${toolDef.provider}' ist für den Agenten '${agentType}' nicht freigegeben.`);
        }
      }
      return await this.dynamicTools.executeTool(name, args);
    }

    // 2. Ansonsten Standard-Plugin suchen
    const plugin = this.plugins.find(p => p.tools.some(t => t.definition.name === name));
    if (!plugin) throw new Error(`Tool ${name} nicht gefunden.`);

    // Agenten-Berechtigungsprüfung
    if (agentConfig) {
      const detailed = getAgentDetailedPluginPermission(agentConfig, plugin.name);

      // Vorschlag-Tool Prüfung
      if (plugin.name === "Notifications" && PROPOSAL_PLUGIN_TOOLS[name]) {
        const targetPlugin = PROPOSAL_PLUGIN_TOOLS[name];
        const targetDetailed = getAgentDetailedPluginPermission(agentConfig, targetPlugin);
        if (targetDetailed.write === "no") {
          throw new Error(
            `Zugriff verweigert: Der Agent '${agentConfig.name || agentType}' darf für '${targetPlugin}' keine Aktionen vorschlagen oder durchführen (Berechtigung: Nein).`
          );
        }
      }

      const mutatingForPlugin = MUTATING_PLUGIN_TOOLS[plugin.name] || [];
      const isMutating = mutatingForPlugin.includes(name);

      if (isMutating) {
        if (detailed.write === "ask") {
          throw new Error(
            `Zugriff verweigert: Der Agent '${agentConfig.name || agentType}' hat für '${plugin.name}' die Berechtigungsstufe 'Nur mit Abfrage'. ` +
            `Aktionen dürfen nicht eigenständig ausgeführt werden. Bitte nutze stattdessen das entsprechende Vorschlag-Werkzeug (z. B. schlage_termin_vor, schlage_aufgabe_vor, schlage_mail_antwort_vor).`
          );
        }
        if (detailed.write === "no") {
          throw new Error(
            `Zugriff verweigert: Der Agent '${agentConfig.name || agentType}' hat keine Berechtigung, Aktionen für '${plugin.name}' auszuführen (Berechtigung: Nein).`
          );
        }
      } else {
        if (detailed.read === "no" && plugin.name !== "Notifications" && plugin.name !== "Instructions") {
          throw new Error(
            `Zugriff verweigert: Das Lesen von Daten für '${plugin.name}' ist für den Agenten '${agentConfig.name || agentType}' gesperrt (Berechtigung: Nein).`
          );
        }
      }
    }

    const tool = plugin.tools.find(t => t.definition.name === name);
    if (!tool) throw new Error(`Tool ${name} nicht gefunden.`);
    return await tool.handler(args, { prisma: this.prisma });
  }

  getToolsOverview() {
    const settings = getSettings();
    const disabledTools = settings.disabledTools || [];

    const dynamicTools = this.dynamicTools.getTools().map(t => ({
      ...t,
      isDynamic: true,
      isEnabled: t.isEnabled !== false && !disabledTools.includes(t.name)
    }));

    const internalTools: any[] = [];
    for (const plugin of this.plugins) {
      for (const tool of plugin.tools) {
        internalTools.push({
          name: tool.definition.name,
          description: tool.definition.description,
          detailedInstructions: (tool as any).detailedInstructions || (tool.definition as any).detailedInstructions || undefined,
          parameters: tool.definition.parameters,
          pluginName: plugin.name,
          isEnabled: !disabledTools.includes(tool.definition.name),
          isDynamic: false
        });
      }
    }

    return {
      success: true,
      totalCount: dynamicTools.length + internalTools.length,
      dynamicCount: dynamicTools.length,
      internalCount: internalTools.length,
      dynamicTools,
      internalTools
    };
  }

  async getAllAlerts() {
    const settings = getSettings();
    const disabled = settings.disabledPlugins || [];
    
    const alerts = [];
    for (const plugin of this.plugins) {
      if (disabled.includes(plugin.name)) continue;
      if (plugin.getAlerts) {
        try {
          const pluginAlerts = await plugin.getAlerts({ prisma: this.prisma });
          alerts.push(...pluginAlerts);
        } catch (e) {
          console.error(`Fehler beim Laden der Alerts von ${plugin.name}:`, e);
        }
      }
    }
    return alerts;
  }

  async getAllTopWidgets(options?: { calendarDays?: number }) {
    const settings = getSettings();
    const disabled = settings.disabledPlugins || [];
    
    const widgets = [];
    for (const plugin of this.plugins) {
      if (disabled.includes(plugin.name)) continue;
      if (plugin.getTopWidgets) {
        try {
          const pluginWidgets = await plugin.getTopWidgets({ prisma: this.prisma, ...options } as any);
          widgets.push(...pluginWidgets);
        } catch (e) {
          console.error(`Fehler beim Laden der Top-Widgets von ${plugin.name}:`, e);
        }
      }
    }
    return widgets;
  }

  getEntityConfigs() {
    const activeConfigs: any[] = [];
    for (const plugin of this.plugins) {
      if (plugin.entityConfig) {
        activeConfigs.push(plugin.entityConfig);
      }
    }
    return activeConfigs;
  }

  async resolveEntity(type: string, id: number | string) {
    const plugin = this.plugins.find(p => p.entityConfig?.type === type);
    if (!plugin) throw new Error(`Plugin für Entity-Typ '${type}' nicht gefunden.`);
    if (!plugin.resolveEntity) throw new Error(`Plugin '${plugin.name}' unterstützt keine Entity-Auflösung.`);
    return await plugin.resolveEntity(id, { prisma: this.prisma });
  }
}


