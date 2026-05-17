import { PrismaClient } from "@prisma/client";
import { Plugin, PluginTool } from "./types.js";
import { lightPlugin } from "./LightControl/index.js";
import { appLauncherPlugin } from "./AppLauncher/index.js";
import { memoryPlugin } from "./Memory/index.js";
import { calendarPlugin } from "./Calendar/index.js";
import { imageGeneratorPlugin } from "./ImageGenerator/index.js";

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

  getGeminiTools() {
    return Array.from(this.toolsMap.values()).map(t => t.definition);
  }

  getMCPTools() {
    return Array.from(this.toolsMap.values()).map(t => ({
      name: t.definition.name,
      description: t.definition.description,
      inputSchema: t.definition.parameters || { type: "object", properties: {} }
    }));
  }

  async executeTool(name: string, args: any) {
    const tool = this.toolsMap.get(name);
    if (!tool) throw new Error(`Tool ${name} nicht gefunden.`);
    return await tool.handler(args, { prisma: this.prisma });
  }

  async getAllAlerts() {
    const alerts = [];
    for (const plugin of this.plugins) {
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
    const widgets = [];
    for (const plugin of this.plugins) {
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

