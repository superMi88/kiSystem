import assert from "assert";
import express from "express";
import path from "path";
import fs from "fs";

import { DynamicToolManager } from "./plugins/dynamic/DynamicToolManager.js";
import { PluginManager } from "./plugins/index.js";
import { createDynamicToolsRouter } from "./routes/dynamicToolsRouter.js";

const TEST_STORE = path.join(process.cwd(), "test-crossproject-tools.json");

async function runCrossProjectTest() {
  console.log("===============================================================");
  console.log("=== CROSS-PROJECT TEST: Discord-Bot Push -> KI-System =====");
  console.log("===============================================================\n");

  if (fs.existsSync(TEST_STORE)) {
    fs.unlinkSync(TEST_STORE);
  }

  // 1. Starte kiSystem REST-Server auf Port 4777
  const kiPort = 4777;
  const app = express();
  app.use(express.json());

  const mockPrisma = {} as any;
  const pluginManager = new PluginManager(mockPrisma);
  pluginManager.dynamicTools = new DynamicToolManager(undefined, TEST_STORE);
  await pluginManager.init();

  app.use("/api/tools", createDynamicToolsRouter(pluginManager.dynamicTools));

  const kiServer = app.listen(kiPort);
  console.log(`[kiSystem] Test-Server läuft auf http://localhost:${kiPort}`);

  // 2. Lade den echten Discord-Bot ToolRegistrar aus dem servernew-Projekt
  const discordBotPath = "C:\\Users\\ttezlowa\\Documents\\discord\\servernew\\discordBot";
  const toolRegistrar = (await import(`file:///${discordBotPath.replace(/\\/g, "/")}/libIndex/toolRegistrar.js`)).default;
  const toolManager = (await import(`file:///${discordBotPath.replace(/\\/g, "/")}/lib/ai/toolManager.js`)).default;

  // Lade die Tools im Discord Bot
  toolManager.loadPluginTools();
  console.log(`[Discord Bot] Geladene Tools: ${toolManager.getTools().map((t: any) => t.name).join(", ")}`);

  // Konfiguriere Ziel-URL der Push-Registrierung auf unseren kiSystem-Server
  process.env.AI_REGISTRATION_URL = `http://localhost:${kiPort}/api/tools/register`;
  process.env.BOT_PUBLIC_URL = "http://localhost:3001";
  process.env.BOT_API_KEY = "test_bot_api_key_8899";

  // 3. Führe den aktiven Push aus dem Discord-Bot aus
  console.log("[Discord Bot] Starte toolRegistrar.registerAll()...");
  const pushResult = await toolRegistrar.registerAll();
  console.log("[Discord Bot] Push-Ergebnis:", pushResult);

  assert.ok(pushResult.registered.length > 0, "Mindestens ein Tool muss registriert worden sein");
  assert.ok(
    pushResult.registered.includes("discord_send_announcement"),
    "'discord_send_announcement' muss erfolgreich registriert sein"
  );

  // 4. Prüfe, ob kiSystem die Tools nun in DynamicToolManager und PluginManager hat
  const registeredInKi = pluginManager.dynamicTools.getTools();
  console.log(`[kiSystem] Registrierte Tools in kiSystem: ${registeredInKi.map(t => t.name).join(", ")}`);

  assert.ok(
    registeredInKi.some(t => t.name === "discord_send_announcement"),
    "kiSystem muss 'discord_send_announcement' enthalten"
  );

  // 5. Prüfe, ob Gemini Function Declarations und MCP Tools vorhanden sind
  const geminiTools = pluginManager.getGeminiTools();
  const announceGemini = geminiTools.find((t: any) => t.name === "discord_send_announcement");
  assert.ok(announceGemini, "Gemini muss die Function Declaration von 'discord_send_announcement' erhalten");
  assert.deepStrictEqual(announceGemini.parameters.required, ["title", "description"]);
  console.log("[kiSystem] ✅ Gemini Function Declaration erfolgreich generiert.");

  // 6. Teste den REST-Abruf von kiSystem über GET /api/tools
  const getToolsRes = await fetch(`http://localhost:${kiPort}/api/tools`);
  const getToolsData = await getToolsRes.json();
  assert.strictEqual(getToolsRes.status, 200);
  assert.ok(getToolsData.tools.some((t: any) => t.name === "discord_send_announcement"));
  const storedTool = getToolsData.tools.find((t: any) => t.name === "discord_send_announcement");
  assert.strictEqual(storedTool.authentication.token, "********", "Token darf nicht im Klartext ausgegeben werden");
  console.log("[kiSystem] ✅ GET /api/tools liefert bereinigte Tools ohne Klartext-Secrets.");

  // Beenden & Aufräumen
  toolRegistrar.stop();
  kiServer.close();

  if (fs.existsSync(TEST_STORE)) {
    fs.unlinkSync(TEST_STORE);
  }

  console.log("\n===============================================================");
  console.log("🎉 CROSS-PROJECT INTEGRATIONSTEST ERFOLGREICH BESTANDEN!");
  console.log("===============================================================\n");
}

runCrossProjectTest().catch((err) => {
  console.error("❌ Cross-Project Test fehlgeschlagen:", err);
  if (fs.existsSync(TEST_STORE)) {
    fs.unlinkSync(TEST_STORE);
  }
  process.exit(1);
});
