import fs from "fs";
import path from "path";

const settingsPath = path.join(process.cwd(), "settings.json");

export interface Settings {
  hotkey: string;
  disabledPlugins: string[];
}

export function getSettings(): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch (e) {
    console.error("Fehler beim Lesen der Einstellungen:", e);
  }
  
  // Standard-Einstellungen falls keine Datei vorhanden ist
  const defaultSettings: Settings = {
    hotkey: "Ctrl+Shift+Space",
    disabledPlugins: []
  };
  
  // Datei erstellen, falls sie nicht existiert
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
