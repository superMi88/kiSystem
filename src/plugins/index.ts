import { PrismaClient } from "@prisma/client";
import { Plugin, PluginTool } from "./types.js";
import { lightPlugin } from "./LightControl/index.js";
import { appLauncherPlugin } from "./AppLauncher/index.js";
import { memoryPlugin } from "./Memory/index.js";
import { calendarPlugin } from "./Calendar/index.js";
import { imageGeneratorPlugin } from "./ImageGenerator/index.js";
import { getSettings } from "../settings.js";

export class PluginManager {
  private plugins: Plugin[] = [];
  private toolsMap: Map<string, PluginTool> = new Map();

  constructor(private prisma: PrismaClient) {
    // Hier werden die Plugins registriert
    this.registerPlugin(lightPlugin);
    this.registerPlugin(appLauncherPlugin);
    this.registerPlugin(memoryPlugin);
    this.registerPlugin(calendarPlugin);
    this.registerPlugin(imageGeneratorPlugin);
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

  getPluginsInfo() {
    const settings = getSettings();
    const disabled = settings.disabledPlugins || [];
    return this.plugins.map(p => ({
      name: p.name,
      description: p.description,
      enabled: !disabled.includes(p.name)
    }));
  }

  getGeminiTools() {
    const settings = getSettings();
    const disabled = settings.disabledPlugins || [];
    
    const activeTools: any[] = [];
    for (const plugin of this.plugins) {
      if (disabled.includes(plugin.name)) continue;
      for (const tool of plugin.tools) {
        activeTools.push(tool.definition);
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
    return activeTools;
  }

  async executeTool(name: string, args: any) {
    const settings = getSettings();
    const disabled = settings.disabledPlugins || [];
    
    const plugin = this.plugins.find(p => p.tools.some(t => t.definition.name === name));
    if (!plugin) throw new Error(`Tool ${name} nicht gefunden.`);
    if (disabled.includes(plugin.name)) {
      throw new Error(`Das Plugin '${plugin.name}' ist deaktiviert.`);
    }

    const tool = plugin.tools.find(t => t.definition.name === name);
    if (!tool) throw new Error(`Tool ${name} nicht gefunden.`);
    return await tool.handler(args, { prisma: this.prisma });
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

  async getAllTopWidgets() {
    const settings = getSettings();
    const disabled = settings.disabledPlugins || [];
    
    const widgets = [];
    for (const plugin of this.plugins) {
      if (disabled.includes(plugin.name)) continue;
      if (plugin.getTopWidgets) {
        try {
          const pluginWidgets = await plugin.getTopWidgets({ prisma: this.prisma });
          widgets.push(...pluginWidgets);
        } catch (e) {
          console.error(`Fehler beim Laden der Top-Widgets von ${plugin.name}:`, e);
        }
      }
    }
    return widgets;
  }
}


