import fs from "fs";
import path from "path";

const settingsPath = path.join(process.cwd(), "settings.json");

export type PluginPermissionLevel = "allowed" | "ask" | "disabled";

export type PermissionActionLevel = "no" | "ask" | "yes";
export type PermissionReadLevel = "no" | "yes";

export interface PluginDetailedPermission {
  read: PermissionReadLevel;    // "no" | "yes"
  write: PermissionActionLevel; // "no" | "ask" | "yes"
}

export interface AgentPermissionConfig {
  id?: string;                        // Eindeutige ID / Key (z.B. "discord", "mail", "support-bot")
  name: string;                       // Anzeigename des Agenten
  description: string;                // Beschreibung seiner Aufgaben
  avatar?: string;                    // Profilbild / Avatar-Emoji (z. B. "✉️", "🌐", "🤖" oder Bild-URL)
  color?: string;                     // Akzentfarbe des Agenten (Hex, z. B. "#fab387", "#89b4fa")
  trigger: string;                    // Trigger: "mail" | "discord" | "manual" | "webhook" | "calendar" | "task" | "schedule"
  triggerDescription?: string;        // Spezifische Erläuterung zum Auslöser
  systemPrompt?: string;              // Optional: Eigene KI-Rollenanweisungen / Persona
  allowedPlugins: string[];           // z. B. ["Calendar", "Notifications"] oder ["*"]
  pluginPermissions?: Record<string, PluginPermissionLevel>; // Berechtigungsstufen pro Plugin: "allowed" (direkt), "ask" (nur auf Anfrage/Bestätigung), "disabled"
  detailedPermissions?: Record<string, PluginDetailedPermission>; // Granulare Berechtigungen: { read: "no"|"yes", write: "no"|"ask"|"yes" }
  allowedDynamicProviders?: string[]; // z. B. ["discord-bot"]
  allowAllDynamicTools?: boolean;     // default true
  isEnabled?: boolean;                // default true (Aktiv/Inaktiv)
  isSystem?: boolean;                 // default false (System-Agenten sind vor Löschung geschützt)
  createdAt?: string;
  updatedAt?: string;
}

export interface AvailableTrigger {
  id: string;
  name: string;
  badge: string;
  color: string;
  bg: string;
  icon: string;
  description: string;
}

export const AVAILABLE_TRIGGERS: AvailableTrigger[] = [
  {
    id: "mail",
    name: "E-Mail empfangen",
    badge: "E-MAIL",
    color: "#fab387",
    bg: "rgba(250, 179, 135, 0.15)",
    icon: "✉️",
    description: "Startet automatisch bei jeder neu synchronisierten oder übergebenen E-Mail."
  },
  {
    id: "discord",
    name: "Discord Bot Ping / Erwähnung",
    badge: "DISCORD",
    color: "#89b4fa",
    bg: "rgba(137, 180, 250, 0.15)",
    icon: "🌐",
    description: "Startet automatisch, wenn der Discord-Bot auf dem Discord-Server erwähnt oder angeschrieben wird."
  },
  {
    id: "manual",
    name: "Manueller Start / Chat-App",
    badge: "MANUELL",
    color: "#cba6f7",
    bg: "rgba(203, 166, 247, 0.15)",
    icon: "💬",
    description: "Wird vom Benutzer manuell im Chat-Fenster oder über die Web-Oberfläche aufgerufen."
  },
  {
    id: "webhook",
    name: "Externer Webhook / REST-API",
    badge: "WEBHOOK",
    color: "#a6e3a1",
    bg: "rgba(166, 227, 161, 0.15)",
    icon: "⚡",
    description: "Wird über HTTP POST an /api/agent-runs/trigger mit frei wählbaren Parametern ausgelöst."
  },
  {
    id: "calendar",
    name: "Kalender & Termine",
    badge: "KALENDER",
    color: "#94e2d5",
    bg: "rgba(148, 226, 213, 0.15)",
    icon: "📅",
    description: "Wird bei anstehenden Kalenderterminen oder Erinnerungen ausgelöst."
  },
  {
    id: "task",
    name: "Aufgaben & Fälligkeiten",
    badge: "AUFGABEN",
    color: "#f9e2af",
    bg: "rgba(249, 226, 175, 0.15)",
    icon: "✅",
    description: "Wird bei fälligen Aufgaben oder Statusänderungen von To-Dos aufgerufen."
  },
  {
    id: "schedule",
    name: "Zeitplan / Intervall (Cron)",
    badge: "ZEITPLAN",
    color: "#f5c2e7",
    bg: "rgba(245, 194, 231, 0.15)",
    icon: "⏱️",
    description: "Wird zyklisch in vordefinierten Zeitabständen im Hintergrund gestartet."
  }
];

export interface Settings {
  hotkey: string;
  disabledPlugins: string[];
  disabledTools?: string[];
  autostart?: boolean;
  aiModel?: string;
  agentSettings?: Record<string, AgentPermissionConfig>;
}

export const DEFAULT_AGENT_SETTINGS: Record<string, AgentPermissionConfig> = {
  discord: {
    id: "discord",
    name: "Discord Bot Agent",
    description: "Betreut Discord-Server. Zugriff nur auf Discord-Tools & Terminkalender (schützt persönliche Daten).",
    avatar: "🌐",
    color: "#89b4fa",
    trigger: "discord",
    triggerDescription: "Startet automatisch bei Erwähnung des Bots im Discord-Kanal.",
    allowedPlugins: ["Calendar", "Notifications", "Instructions"],
    pluginPermissions: {
      Calendar: "ask",
      Notifications: "allowed",
      Instructions: "allowed"
    },
    detailedPermissions: {
      Calendar: { read: "yes", write: "ask" },
      Mail: { read: "no", write: "no" },
      Tasks: { read: "no", write: "no" },
      Memory: { read: "no", write: "no" },
      Journal: { read: "no", write: "no" },
      Projects: { read: "no", write: "no" },
      AppLauncher: { read: "no", write: "no" },
      Timer: { read: "no", write: "no" },
      Notifications: { read: "yes", write: "yes" },
      Instructions: { read: "yes", write: "yes" }
    },
    allowedDynamicProviders: ["discord-bot"],
    allowAllDynamicTools: true,
    isEnabled: true,
    isSystem: true
  },
  mail: {
    id: "mail",
    name: "E-Mail Agent",
    description: "Analysiert eingehende E-Mails automatisch und fragt vor Terminen, Aufgaben oder Antworten erst nach.",
    avatar: "✉️",
    color: "#fab387",
    trigger: "mail",
    triggerDescription: "Startet automatisch bei jeder neu empfangenen E-Mail.",
    allowedPlugins: ["Calendar", "Tasks", "Notifications", "Memory", "Instructions", "Mail"],
    pluginPermissions: {
      Calendar: "ask",
      Tasks: "ask",
      Mail: "ask",
      Notifications: "allowed",
      Memory: "allowed",
      Instructions: "allowed"
    },
    detailedPermissions: {
      Mail: { read: "yes", write: "ask" },
      Calendar: { read: "yes", write: "ask" },
      Tasks: { read: "yes", write: "ask" },
      Memory: { read: "yes", write: "no" },
      Journal: { read: "no", write: "no" },
      Projects: { read: "no", write: "no" },
      AppLauncher: { read: "no", write: "no" },
      Timer: { read: "no", write: "no" },
      Notifications: { read: "yes", write: "yes" },
      Instructions: { read: "yes", write: "yes" }
    },
    allowAllDynamicTools: false,
    isEnabled: true,
    isSystem: true
  },
  routenplaner: {
    id: "routenplaner",
    name: "Routenplaner Agent",
    description: "Überwacht Termine und Standorte, berechnet Fahr- und Gehzeiten mit Google Maps und sorgt dafür, dass Termine pünktlich erreicht werden.",
    avatar: "🗺️",
    color: "#a6e3a1",
    trigger: "calendar",
    triggerDescription: "Prüft Termine an unterschiedlichen Standorten und plant optimale Wegezeiten.",
    allowedPlugins: ["Calendar", "Notifications", "Instructions"],
    pluginPermissions: {
      Calendar: "allowed",
      Notifications: "allowed",
      Instructions: "allowed"
    },
    detailedPermissions: {
      Calendar: { read: "yes", write: "yes" },
      Mail: { read: "no", write: "no" },
      Tasks: { read: "yes", write: "no" },
      Memory: { read: "no", write: "no" },
      Journal: { read: "no", write: "no" },
      Projects: { read: "no", write: "no" },
      AppLauncher: { read: "no", write: "no" },
      Timer: { read: "yes", write: "yes" },
      Notifications: { read: "yes", write: "yes" },
      Instructions: { read: "yes", write: "yes" }
    },
    allowAllDynamicTools: true,
    isEnabled: true,
    isSystem: true
  },
  default: {
    id: "default",
    name: "Haupt-Assistent (Web / App)",
    description: "Persönlicher Assistent mit Vollzugriff auf alle aktiven Plugins.",
    avatar: "🤖",
    color: "#cba6f7",
    trigger: "manual",
    triggerDescription: "Startet bei manueller Eingabe im Chat / Desktop.",
    allowedPlugins: ["*"],
    pluginPermissions: {
      "*": "allowed"
    },
    detailedPermissions: {
      Mail: { read: "yes", write: "yes" },
      Calendar: { read: "yes", write: "yes" },
      Tasks: { read: "yes", write: "yes" },
      Memory: { read: "yes", write: "yes" },
      Journal: { read: "yes", write: "yes" },
      Projects: { read: "yes", write: "yes" },
      AppLauncher: { read: "yes", write: "yes" },
      Timer: { read: "yes", write: "yes" },
      Notifications: { read: "yes", write: "yes" },
      Instructions: { read: "yes", write: "yes" }
    },
    allowAllDynamicTools: true,
    isEnabled: true,
    isSystem: true
  }
};

export function getSettings(): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (!parsed.agentSettings || Object.keys(parsed.agentSettings).length === 0) {
        parsed.agentSettings = { ...DEFAULT_AGENT_SETTINGS };
        saveSettings(parsed);
      } else {
        // Normalisierung / Migration für bestehende Agenten
        let changed = false;
        for (const [key, agent] of Object.entries(parsed.agentSettings as Record<string, AgentPermissionConfig>)) {
          if (!agent.id) { agent.id = key; changed = true; }
          if (agent.isEnabled === undefined) { agent.isEnabled = true; changed = true; }
          if (!agent.avatar) {
            if (key === "mail") agent.avatar = "✉️";
            else if (key === "discord") agent.avatar = "🌐";
            else if (key === "default") agent.avatar = "🤖";
            else agent.avatar = "🤖";
            changed = true;
          }
          if (!agent.color) {
            if (key === "mail") agent.color = "#fab387";
            else if (key === "discord") agent.color = "#89b4fa";
            else if (key === "default") agent.color = "#cba6f7";
            else agent.color = "#89b4fa";
            changed = true;
          }
          if (!agent.trigger) {
            if (key === "discord") agent.trigger = "discord";
            else if (key === "mail") agent.trigger = "mail";
            else agent.trigger = "manual";
            changed = true;
          }
          if (!agent.pluginPermissions || Object.keys(agent.pluginPermissions).length === 0) {
            if (key === "mail") {
              agent.pluginPermissions = {
                Calendar: "ask",
                Tasks: "ask",
                Mail: "ask",
                Notifications: "allowed",
                Memory: "allowed",
                Instructions: "allowed"
              };
            } else if (agent.allowedPlugins?.includes("*")) {
              agent.pluginPermissions = { "*": "allowed" };
            } else {
              agent.pluginPermissions = {};
              (agent.allowedPlugins || []).forEach(p => {
                agent.pluginPermissions![p] = (key === "discord" && p === "Calendar") ? "ask" : "allowed";
              });
            }
            changed = true;
          }
          if (!agent.detailedPermissions || Object.keys(agent.detailedPermissions).length === 0) {
            if (key === "mail") {
              agent.detailedPermissions = {
                Mail: { read: "yes", write: "ask" },
                Calendar: { read: "yes", write: "ask" },
                Tasks: { read: "yes", write: "ask" },
                Memory: { read: "yes", write: "no" },
                Journal: { read: "no", write: "no" },
                Projects: { read: "no", write: "no" },
                AppLauncher: { read: "no", write: "no" },
                Timer: { read: "no", write: "no" },
                Notifications: { read: "yes", write: "yes" },
                Instructions: { read: "yes", write: "yes" }
              };
            } else if (key === "discord") {
              agent.detailedPermissions = {
                Calendar: { read: "yes", write: "ask" },
                Mail: { read: "no", write: "no" },
                Tasks: { read: "no", write: "no" },
                Memory: { read: "no", write: "no" },
                Journal: { read: "no", write: "no" },
                Projects: { read: "no", write: "no" },
                AppLauncher: { read: "no", write: "no" },
                Timer: { read: "no", write: "no" },
                Notifications: { read: "yes", write: "yes" },
                Instructions: { read: "yes", write: "yes" }
              };
            } else {
              const hasWildcard = agent.allowedPlugins?.includes("*");
              agent.detailedPermissions = {
                Mail: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                Calendar: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                Tasks: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                Memory: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                Journal: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                Projects: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                AppLauncher: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                Timer: hasWildcard ? { read: "yes", write: "yes" } : { read: "no", write: "no" },
                Notifications: { read: "yes", write: "yes" },
                Instructions: { read: "yes", write: "yes" }
              };
            }
            changed = true;
          }
          if (agent.allowAllDynamicTools === undefined) {
            agent.allowAllDynamicTools = key === "mail" ? false : true;
            changed = true;
          }
          if (key === "default") {
            agent.isSystem = true;
          }
        }
        if (!parsed.disabledTools) {
          parsed.disabledTools = [];
          changed = true;
        }
        // Plugins sind immer aktiv
        if (parsed.disabledPlugins && parsed.disabledPlugins.length > 0) {
          parsed.disabledPlugins = [];
          changed = true;
        }
        if (changed) {
          saveSettings(parsed);
        }
      }
      return parsed;
    }
  } catch (e) {
    console.error("Fehler beim Lesen der Einstellungen:", e);
  }
  
  // Standard-Einstellungen falls keine Datei vorhanden ist
  const defaultSettings: Settings = {
    hotkey: "Ctrl+Shift+Space",
    disabledPlugins: [],
    disabledTools: [],
    autostart: false,
    aiModel: "gemini-3.5-flash",
    agentSettings: { ...DEFAULT_AGENT_SETTINGS }
  };
  
  saveSettings(defaultSettings);
  return defaultSettings;
}

export function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (e) {
    console.error("Fehler beim Schreiben der Einstellungen:", e);
  }
}

/**
 * Ermittelt die granularen Berechtigungen { read: "no"|"yes", write: "no"|"ask"|"yes" } eines Agenten für ein Plugin
 */
export function getAgentDetailedPluginPermission(
  agentConfig: AgentPermissionConfig | null,
  pluginName: string
): PluginDetailedPermission {
  if (!agentConfig) return { read: "yes", write: "yes" };
  if (agentConfig.isEnabled === false) return { read: "no", write: "no" };

  if (agentConfig.detailedPermissions && agentConfig.detailedPermissions[pluginName]) {
    return agentConfig.detailedPermissions[pluginName];
  }

  // Fallback auf pluginPermissions
  if (agentConfig.pluginPermissions) {
    const perm = agentConfig.pluginPermissions[pluginName] || agentConfig.pluginPermissions["*"];
    if (perm === "allowed") return { read: "yes", write: "yes" };
    if (perm === "ask") return { read: "yes", write: "ask" };
    if (perm === "disabled") return { read: "no", write: "no" };
  }

  // Fallback auf allowedPlugins
  const allowed = agentConfig.allowedPlugins || [];
  if (allowed.includes("*") || allowed.includes(pluginName)) {
    if (agentConfig.id === "mail" && ["Calendar", "Tasks", "Mail"].includes(pluginName)) {
      return { read: "yes", write: "ask" };
    }
    return { read: "yes", write: "yes" };
  }

  return { read: "no", write: "no" };
}

/**
 * Ermittelt die allgemeine Berechtigungsstufe ("allowed" | "ask" | "disabled") eines Agenten für ein Plugin
 */
export function getAgentPluginPermission(agentConfig: AgentPermissionConfig | null, pluginName: string): PluginPermissionLevel {
  const detailed = getAgentDetailedPluginPermission(agentConfig, pluginName);
  if (detailed.read === "no" && detailed.write === "no") return "disabled";
  if (detailed.write === "ask") return "ask";
  return "allowed";
}

/**
 * Sucht eine Agenten-Konfiguration anhand von ID, Key oder Trigger
 */
export function getAgentConfig(idOrTrigger?: string): AgentPermissionConfig | null {
  if (!idOrTrigger) return null;
  const settings = getSettings();
  const agents = settings.agentSettings || {};

  // 1. Direkter Key-Match
  if (agents[idOrTrigger]) {
    return agents[idOrTrigger];
  }

  // 2. ID-Match
  const byId = Object.values(agents).find(a => a.id === idOrTrigger);
  if (byId) return byId;

  // 3. Name- oder Alias-Match (z.B. "E-Mail-Agent" -> mail)
  const q = idOrTrigger.toLowerCase().trim();
  const byNameOrKeyword = Object.values(agents).find(a => 
    a.name?.toLowerCase() === q || 
    a.id?.toLowerCase() === q ||
    (q.includes("mail") && (a.trigger === "mail" || a.id === "mail")) ||
    (q.includes("discord") && (a.trigger === "discord" || a.id === "discord"))
  );
  if (byNameOrKeyword) return byNameOrKeyword;

  // 4. Trigger-Match (erster aktiver Agent mit diesem Trigger)
  const byTrigger = Object.values(agents).find(a => a.trigger === idOrTrigger && a.isEnabled !== false);
  if (byTrigger) return byTrigger;

  // 5. Fallback zu default
  return agents["default"] || null;
}

/**
 * Erstellt oder aktualisiert einen Agenten
 */
export function saveAgentConfig(key: string, config: Partial<AgentPermissionConfig> & { name: string }): Record<string, AgentPermissionConfig> {
  const settings = getSettings();
  if (!settings.agentSettings) settings.agentSettings = { ...DEFAULT_AGENT_SETTINGS };

  const existing = settings.agentSettings[key];
  const now = new Date().toISOString();

  // Berechtigungen synchronisieren
  let detailedPermissions = config.detailedPermissions || existing?.detailedPermissions;
  let pluginPermissions = config.pluginPermissions || existing?.pluginPermissions;

  if (detailedPermissions) {
    if (!pluginPermissions) pluginPermissions = {};
    for (const [plug, det] of Object.entries(detailedPermissions)) {
      if (det.write === "yes") {
        pluginPermissions[plug] = "allowed";
      } else if (det.write === "ask" || det.read === "yes") {
        pluginPermissions[plug] = "ask";
      } else {
        pluginPermissions[plug] = "disabled";
      }
    }
  } else if (pluginPermissions) {
    detailedPermissions = {};
    for (const [plug, perm] of Object.entries(pluginPermissions)) {
      if (perm === "allowed") {
        detailedPermissions[plug] = { read: "yes", write: "yes" };
      } else if (perm === "ask") {
        detailedPermissions[plug] = { read: "yes", write: "ask" };
      } else {
        detailedPermissions[plug] = { read: "no", write: "no" };
      }
    }
  }

  // allowedPlugins als Liste aktiver Plugins ableiten
  let allowedPlugins = config.allowedPlugins;
  if (detailedPermissions) {
    allowedPlugins = Object.entries(detailedPermissions)
      .filter(([_, det]) => det.read === "yes" || det.write !== "no")
      .map(([plug]) => plug);
  } else if (pluginPermissions) {
    allowedPlugins = Object.entries(pluginPermissions)
      .filter(([_, perm]) => perm !== "disabled")
      .map(([plug]) => plug);
    if (allowedPlugins.length === 0 && pluginPermissions["*"] === "allowed") {
      allowedPlugins = ["*"];
    }
  }

  settings.agentSettings[key] = {
    id: key,
    name: config.name.trim(),
    description: config.description || "",
    avatar: config.avatar || existing?.avatar || (key === "mail" ? "✉️" : key === "discord" ? "🌐" : "🤖"),
    color: config.color || existing?.color || (key === "mail" ? "#fab387" : key === "discord" ? "#89b4fa" : "#cba6f7"),
    trigger: config.trigger || "manual",
    triggerDescription: config.triggerDescription,
    systemPrompt: config.systemPrompt,
    allowedPlugins: Array.isArray(allowedPlugins) ? allowedPlugins : ["*"],
    pluginPermissions: pluginPermissions || { "*": "allowed" },
    detailedPermissions: detailedPermissions || {
      Mail: { read: "yes", write: "ask" },
      Calendar: { read: "yes", write: "ask" },
      Tasks: { read: "yes", write: "ask" },
      Notifications: { read: "yes", write: "yes" },
      Instructions: { read: "yes", write: "yes" }
    },
    allowedDynamicProviders: Array.isArray(config.allowedDynamicProviders) ? config.allowedDynamicProviders : [],
    allowAllDynamicTools: config.allowAllDynamicTools ?? true,
    isEnabled: config.isEnabled ?? true,
    isSystem: key === "default" || existing?.isSystem || false,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  saveSettings(settings);
  return settings.agentSettings;
}

/**
 * Löscht einen Agenten (System-Hauptagent geschützt)
 */
export function deleteAgentConfig(key: string): boolean {
  const settings = getSettings();
  if (!settings.agentSettings || !settings.agentSettings[key]) return false;
  if (key === "default" || settings.agentSettings[key].isSystem) {
    throw new Error("Der System-Hauptagent kann nicht gelöscht werden.");
  }
  delete settings.agentSettings[key];
  saveSettings(settings);
  return true;
}

/**
 * Ändert den Aktiv-Status eines Agenten
 */
export function toggleAgentStatus(key: string, isEnabled?: boolean): boolean {
  const settings = getSettings();
  if (!settings.agentSettings || !settings.agentSettings[key]) return false;
  const current = settings.agentSettings[key].isEnabled !== false;
  const newStatus = isEnabled !== undefined ? isEnabled : !current;
  settings.agentSettings[key].isEnabled = newStatus;
  settings.agentSettings[key].updatedAt = new Date().toISOString();
  saveSettings(settings);
  return newStatus;
}

/**
 * Aktiviert oder deaktiviert ein internes Werkzeug systemweit
 */
export function toggleToolDisabled(name: string, isEnabled?: boolean): boolean {
  const settings = getSettings();
  if (!settings.disabledTools) settings.disabledTools = [];

  const currentlyDisabled = settings.disabledTools.includes(name);
  const shouldEnable = isEnabled !== undefined ? isEnabled : currentlyDisabled;

  if (shouldEnable) {
    settings.disabledTools = settings.disabledTools.filter(t => t !== name);
  } else {
    if (!settings.disabledTools.includes(name)) {
      settings.disabledTools.push(name);
    }
  }

  saveSettings(settings);
  return !settings.disabledTools.includes(name);
}
