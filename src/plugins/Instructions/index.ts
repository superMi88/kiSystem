import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

export function createInstructionsPlugin(getPluginManager: () => any): Plugin {
  return {
    name: "Instructions",
    description: "Bietet Werkzeuge zum Abrufen ausführlicher Anweisungen, Vorgaben, Richtlinien und Templates für Werkzeuge.",
    tools: [
      {
        definition: {
          name: "get_instructions",
          description: "Ruft ausführliche Anweisungen, Vorgaben, Formatierungsregeln und Templates für ein bestimmtes Tool ab.",
          detailedInstructions: `[GET_INSTRUCTIONS - UNIVERSAL-DOKUMENTATION & VORGABEN FÜR WERKZEUGE]
Nutze dieses zentrale Werkzeug, um vor der Ausführung anderer Tools genaue Anweisungen abzurufen:
- toolName: Name des Werkzeugs (z. B. 'discord_send_announcement', 'erstelle_benachrichtigung', 'create_event' etc.).
- category: Optionale Kategorie oder Vorlagen-Name (z. B. für Ankündigungen wie 'Servernews' oder 'Spielevents').
Du erhältst die vollständigen Formatierungsrichtlinien, Pflichtfelder, Entwurfs- und Bestätigungsregeln sowie serverspezifische Templates.`,
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              toolName: {
                type: SchemaType.STRING,
                description: "Name des Werkzeugs (z. B. 'discord_send_announcement', 'erstelle_benachrichtigung', etc.)."
              },
              category: {
                type: SchemaType.STRING,
                description: "Optionale Kategorie oder Vorlagen-Name (z. B. 'Servernews' oder 'Spielevents' für Discord-Ankündigungen)."
              },
              guildId: {
                type: SchemaType.STRING,
                description: "Optionale Discord Server-ID (Snowflake), falls zutreffend."
              }
            },
            required: ["toolName"]
          }
        },
        handler: async (args: any, context) => {
          let rawName = String(args?.toolName || args?.name || "").trim();
          const category = args?.category ? String(args.category).trim() : "";
          const guildId = args?.guildId ? String(args.guildId).trim() : "";
          const pluginManager = getPluginManager();

          if (!rawName) {
            return {
              success: false,
              message: "Bitte gib mit 'toolName' den Namen des Werkzeugs an (z. B. 'discord_send_announcement')."
            };
          }

          // Alias-Normalisierung für Ankündigungstools
          if (rawName.includes("announcement")) {
            rawName = "discord_send_announcement";
          }

          // 1. Suche in dynamischen Tools
          let dynTool = pluginManager?.dynamicTools?.getTool(rawName, true);
          if (!dynTool && rawName.startsWith("discord_")) {
            dynTool = pluginManager?.dynamicTools?.getTool(rawName.replace("discord_", ""), true);
          } else if (!dynTool && !rawName.startsWith("discord_")) {
            dynTool = pluginManager?.dynamicTools?.getTool(`discord_${rawName}`, true);
          }

          if (dynTool) {
            let liveTemplateInfo = null;
            // Falls es sich um ein Announcement-Tool handelt, live Templates vom Discord-Bot abrufen
            if (dynTool.endpointUrl && dynTool.name.includes("announcement")) {
              try {
                const instructionsUrl = dynTool.endpointUrl.includes("/instructions")
                  ? dynTool.endpointUrl
                  : dynTool.endpointUrl.replace("/send", "/instructions");

                const queryParams = new URLSearchParams();
                if (category) queryParams.set("category", category);
                if (guildId) queryParams.set("guildId", guildId);

                const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
                const resp = await fetch(instructionsUrl + queryString, {
                  headers: {
                    "Content-Type": "application/json",
                    ...(dynTool.authentication?.token ? { [dynTool.authentication.header || "x-api-key"]: dynTool.authentication.token } : {})
                  }
                });
                if (resp.ok) {
                  liveTemplateInfo = await resp.json();
                }
              } catch (e) {
                // Netzwerkfehler ignorieren, Standard-Instructions liefern
              }
            }

            let combinedInstructions = dynTool.detailedInstructions || "Keine zusätzlichen Richtlinien hinterlegt.";
            if (liveTemplateInfo) {
              if (liveTemplateInfo.instructions || liveTemplateInfo.template) {
                combinedInstructions += `\n\n[AKTUELLE SERVER-VORLAGE & GUIDELINES]:\n${liveTemplateInfo.instructions || liveTemplateInfo.template}`;
              } else if (liveTemplateInfo.overview) {
                combinedInstructions += `\n\n[VERFÜGBARE ANKÜNDIGUNGS-VORLAGEN AUF DEM SERVER]:\n${liveTemplateInfo.overview}\n\nHinweis: Rufe get_instructions mit category="<Name>" auf, um ein bestimmtes Template abzurufen.`;
              }
            }

            return {
              success: true,
              toolName: dynTool.name,
              shortDescription: dynTool.description,
              detailedInstructions: combinedInstructions,
              templateData: liveTemplateInfo || undefined
            };
          }

          // 2. Suche in internen Plugin-Tools
          if (pluginManager?.plugins) {
            for (const p of pluginManager.plugins) {
              const matched = p.tools.find((t: any) => t.definition.name.toLowerCase() === rawName.toLowerCase());
              if (matched) {
                return {
                  success: true,
                  toolName: matched.definition.name,
                  plugin: p.name,
                  shortDescription: matched.definition.description,
                  detailedInstructions: (matched as any).detailedInstructions || (matched.definition as any).detailedInstructions || "Keine zusätzlichen Richtlinien für dieses Werkzeug hinterlegt."
                };
              }
            }
          }

          return {
            success: false,
            message: `Tool '${rawName}' wurde nicht gefunden.`
          };
        }
      }
    ]
  };
}
