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
  type: "light_control" | "calendar_overview" | "timer_list" | "custom";
  data: any;
}

export interface Plugin {
  name: string;
  description: string;
  tools: PluginTool[];
  getAlerts?: (context: { prisma: PrismaClient }) => Promise<PluginAlert[]>;
  getTopWidgets?: (context: { prisma: PrismaClient }) => Promise<PluginWidget[]>;
}
