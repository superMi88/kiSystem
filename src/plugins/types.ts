import { PrismaClient } from "@prisma/client";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: any;
}

export interface PluginTool {
  definition: ToolDefinition;
  handler: (args: any, context: { prisma: PrismaClient }) => Promise<any>;
}

export interface PluginAlert {
  id: string;
  type: "info" | "warning" | "error" | "auth";
  message: string;
  actionLabel?: string;
  actionUrl?: string;
}

export interface PluginWidget {
  pluginName: string;
  type: "calendar_overview" | "timer_list" | "custom";
  data: any;
}

export interface EntityConfig {
  type: string;        // e.g., 'person', 'note', 'task', 'timer', 'event'
  prefix: string;      // e.g., 'app://person/'
  color: string;       // Background style (CSS, e.g. 'rgba(137, 180, 250, 0.15)')
  borderColor: string; // Border style (CSS, e.g. '#89b4fa')
  icon: string;        // Emoji/icon representing entity (e.g. '👤')
  displayName: string; // German name (e.g. 'Person')
}

export interface Plugin {
  name: string;
  description: string;
  tools: PluginTool[];
  getAlerts?: (context: { prisma: PrismaClient }) => Promise<PluginAlert[]>;
  getTopWidgets?: (context: { prisma: PrismaClient }) => Promise<PluginWidget[]>;
  
  // Extension hooks for Entity system
  entityConfig?: EntityConfig;
  resolveEntity?: (id: number, context: { prisma: PrismaClient }) => Promise<any>;
}
