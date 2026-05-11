import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";
import { exec } from "child_process";

export const appLauncherPlugin: Plugin = {
  name: "AppLauncher",
  description: "Starten und Scannen von System-Apps",
  tools: [
    {
      definition: {
        name: "starte_programm",
        description: "Startet ein registriertes Programm auf dem PC.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: "Der Name des Programms" }
          },
          required: ["name"]
        } as any
      },
      handler: async (args, { prisma }) => {
        const appEntry = await prisma.appLauncher.findUnique({ where: { name: args.name } });
        if (appEntry) {
          const isAbsolutePath = /^[a-zA-Z]:\\/.test(appEntry.path);
          const startCommand = isAbsolutePath 
            ? `cmd /c start "" "${appEntry.path}"`
            : `cmd /c start "" "shell:AppsFolder\\${appEntry.path}"`;
          
          exec(startCommand, (err) => { if (err) console.error("Start-Fehler:", err); });
          return { status: "success", message: `${args.name} gestartet.` };
        }
        return { status: "error", message: `Programm '${args.name}' unbekannt.` };
      }
    },
    {
      definition: {
        name: "liste_programme",
        description: "Gibt eine Liste aller bereits registrierten Programme zurück.",
      },
      handler: async (_, { prisma }) => {
        const apps = await prisma.appLauncher.findMany();
        return { apps: apps.map(a => a.name) };
      }
    },
    {
      definition: {
        name: "scanne_system_nach_apps",
        description: "Scannt den PC nach installierten Windows-Programmen und gibt deren Namen zurück.",
      },
      handler: async (_, { prisma }) => {
        const apps: any = await new Promise((resolve) => {
          exec('powershell -Command "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json"', (err, stdout) => {
            if (err) return resolve({ error: "Scan fehlgeschlagen" });
            try {
              const rawApps = JSON.parse(stdout);
              resolve(Array.isArray(rawApps) ? rawApps : [rawApps]);
            } catch { resolve({ error: "Fehler beim Parsen der Programme" }); }
          });
        });
        
        if (Array.isArray(apps)) {
          for (const app of apps) {
            if (app.Name && app.AppID) {
              await prisma.appLauncher.upsert({
                where: { name: app.Name },
                update: { path: app.AppID },
                create: { name: app.Name, path: app.AppID }
              });
            }
          }
          return { status: "success", message: `Scan abgeschlossen. ${apps.length} Programme gefunden.` };
        }
        return { status: "error", message: "Scan fehlgeschlagen." };
      }
    }
  ]
};
