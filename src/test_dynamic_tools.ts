import assert from "assert";
import http from "http";
import express from "express";
import path from "path";
import fs from "fs";

import {
  validateDynamicToolDefinition,
  toGeminiDeclaration,
  toMcpTool,
  sanitizeTool
} from "./plugins/dynamic/dynamicToolSchema.js";
import { DynamicToolManager } from "./plugins/dynamic/DynamicToolManager.js";
import { PluginManager } from "./plugins/index.js";
import { createDynamicToolsRouter } from "./routes/dynamicToolsRouter.js";

const TEST_STORE_PATH = path.join(process.cwd(), "test-dynamic-tools.json");

async function runTests() {
  console.log("=================================================");
  console.log("=== TEST SUITE: Dynamische KI-Tool-Registrierung ===");
  console.log("=================================================\n");

  // Bereinige Test-Datei falls vorhanden
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }

  // ----------------------------------------------------
  // TEST 1: Schema & Validierung
  // ----------------------------------------------------
  console.log("--- TEST 1: Schema-Validierung & Gemini-/MCP-Konverter ---");

  const validAnnouncementTool = {
    name: "discord_send_announcement",
    description: "Erstellt und veröffentlicht eine Ankündigung auf einem Discord-Server.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Titel der Ankündigung" },
        description: { type: "STRING", description: "Inhalt der Ankündigung" },
        channel: { type: "STRING", description: "Zielkanal" },
        roles: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Pings"
        }
      },
      required: ["title", "description"]
    },
    returnValues: {
      type: "OBJECT",
      properties: {
        success: { type: "BOOLEAN" },
        url: { type: "STRING" }
      }
    },
    endpointUrl: "http://localhost:3002/api/plugins/announcement/send",
    authentication: {
      type: "apiKey" as const,
      header: "x-api-key",
      token: "secret_bot_key_xyz123"
    },
    provider: "discord-bot"
  };

  const valResult = validateDynamicToolDefinition(validAnnouncementTool);
  assert.strictEqual(valResult.valid, true, "Gültiges Tool muss Validierung bestehen");
  assert.strictEqual(valResult.errors.length, 0);

  // Ungültige Tool-Definitionen
  const invalidTool1 = { name: "invalid name with spaces", description: "Test" };
  assert.strictEqual(validateDynamicToolDefinition(invalidTool1).valid, false, "Ungültiger Name muss fehlschlagen");

  const invalidTool2 = { name: "no_endpoint", description: "Desc", parameters: { properties: {} } };
  assert.strictEqual(validateDynamicToolDefinition(invalidTool2).valid, false, "Fehlende endpointUrl muss fehlschlagen");

  // Gemini-Konvertierung
  const geminiDecl = toGeminiDeclaration(validAnnouncementTool);
  assert.strictEqual(geminiDecl.name, "discord_send_announcement");
  assert.strictEqual(geminiDecl.description, validAnnouncementTool.description);
  assert.ok(geminiDecl.parameters.properties.title, "Gemini properties.title muss existieren");
  assert.deepStrictEqual(geminiDecl.parameters.required, ["title", "description"]);

  // MCP-Konvertierung
  const mcpTool = toMcpTool(validAnnouncementTool);
  assert.strictEqual(mcpTool.name, "discord_send_announcement");
  assert.strictEqual(mcpTool.inputSchema.type, "object");

  // Maskierung sensibler Tokens
  const sanitized = sanitizeTool(validAnnouncementTool);
  assert.strictEqual(sanitized.authentication?.token, "********", "Token muss maskiert sein");

  console.log("✅ TEST 1 bestanden.\n");

  // ----------------------------------------------------
  // TEST 2: DynamicToolManager (Speicherung & Lebenszyklus)
  // ----------------------------------------------------
  console.log("--- TEST 2: DynamicToolManager Registrierung & Persistenz ---");

  const manager = new DynamicToolManager(undefined, TEST_STORE_PATH);
  await manager.init();

  const regRes = await manager.registerTool(validAnnouncementTool);
  assert.strictEqual(regRes.success, true);
  assert.strictEqual(manager.hasTool("discord_send_announcement"), true);

  // Sicherstellen, dass getTools() keine Klartext-Secrets ausgibt
  const toolsList = manager.getTools();
  assert.strictEqual(toolsList.length, 1);
  assert.strictEqual(toolsList[0].authentication?.token, "********");

  // Persistenz prüfen (Neuer Manager lädt dieselbe Datei)
  const reloadedManager = new DynamicToolManager(undefined, TEST_STORE_PATH);
  await reloadedManager.init();
  assert.strictEqual(reloadedManager.hasTool("discord_send_announcement"), true, "Tool muss aus JSON-Datei geladen werden");

  // Toggle Test
  await reloadedManager.toggleTool("discord_send_announcement", false);
  assert.strictEqual(reloadedManager.getGeminiDeclarations().length, 0, "Deaktiviertes Tool darf nicht in Gemini-Tools sein");
  await reloadedManager.toggleTool("discord_send_announcement", true);
  assert.strictEqual(reloadedManager.getGeminiDeclarations().length, 1, "Reaktiviertes Tool muss in Gemini-Tools sein");

  console.log("✅ TEST 2 bestanden.\n");

  // ----------------------------------------------------
  // TEST 3: PluginManager Integration
  // ----------------------------------------------------
  console.log("--- TEST 3: PluginManager Integration ---");

  // Dummy Prisma-Client Mock
  const mockPrisma = {} as any;
  const pluginManager = new PluginManager(mockPrisma);
  // Verwende den vorherigen Manager für die Verifikation
  pluginManager.dynamicTools = manager;

  const geminiTools = pluginManager.getGeminiTools();
  const foundInGemini = geminiTools.some((t: any) => t.name === "discord_send_announcement");
  assert.ok(foundInGemini, "discord_send_announcement muss in pluginManager.getGeminiTools() enthalten sein");

  const mcpTools = pluginManager.getMCPTools();
  const foundInMcp = mcpTools.some((t: any) => t.name === "discord_send_announcement");
  assert.ok(foundInMcp, "discord_send_announcement muss in pluginManager.getMCPTools() enthalten sein");

  console.log("✅ TEST 3 bestanden.\n");

  // ----------------------------------------------------
  // TEST 4: REST API Endpunkte & Push-Registrierung
  // ----------------------------------------------------
  console.log("--- TEST 4: REST API Server (/api/tools) & Authentifizierung ---");

  const app = express();
  app.use(express.json());
  app.use("/api/tools", createDynamicToolsRouter(manager));

  const serverPort = 4889;
  const testServer = app.listen(serverPort);
  const baseUrl = `http://localhost:${serverPort}/api/tools`;

  // 4.1 GET /api/tools
  const listRes = await fetch(baseUrl);
  assert.strictEqual(listRes.status, 200);
  const listData = await listRes.json();
  assert.strictEqual(listData.success, true);
  assert.ok(listData.tools.some((t: any) => t.name === "discord_send_announcement"));

  // 4.2 POST /api/tools/register (Neues externes Tool)
  const newExternalTool = {
    name: "github_project_status",
    description: "Ruft den aktuellen Deployment- und Build-Status eines GitHub Projekts ab.",
    parameters: {
      type: "OBJECT",
      properties: {
        reponame: { type: "STRING", description: "Name des GitHub-Repositories" }
      },
      required: ["reponame"]
    },
    endpointUrl: "http://localhost:5000/api/github/status",
    authentication: { type: "apiKey", header: "x-api-key", token: "gh_token_123" },
    provider: "github-monitor"
  };

  const regHttpRes = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newExternalTool)
  });
  assert.strictEqual(regHttpRes.status, 201);
  const regHttpData = await regHttpRes.json();
  assert.strictEqual(regHttpData.success, true);
  assert.strictEqual(regHttpData.tool.name, "github_project_status");

  // 4.3 DELETE /api/tools/:name
  const delHttpRes = await fetch(`${baseUrl}/github_project_status`, { method: "DELETE" });
  assert.strictEqual(delHttpRes.status, 200);
  assert.strictEqual(manager.hasTool("github_project_status"), false);

  testServer.close();
  console.log("✅ TEST 4 bestanden.\n");

  // ----------------------------------------------------
  // TEST 5: End-to-End Remote Dispatch (Discord Bot Mock)
  // ----------------------------------------------------
  console.log("--- TEST 5: End-to-End Remote-Ausführung mit Discord Bot Mock ---");

  let receivedPayload: any = null;
  let receivedAuthHeader: string | null = null;

  // Starte Mock Discord-Bot Server
  const mockBotPort = 3987;
  const mockBotServer = http.createServer((req, res) => {
    receivedAuthHeader = req.headers["x-api-key"] as string;

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/api/plugins/announcement/send") {
        receivedPayload = JSON.parse(body);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: `Ankündigung '${receivedPayload.title}' erfolgreich in #ankündigungen gepostet!`,
            channelId: "1122334455",
            messageId: "9988776655",
            url: "https://discord.com/channels/123/1122334455/9988776655"
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise<void>((resolve) => mockBotServer.listen(mockBotPort, () => resolve()));

  // Tool auf den Mock-Port registrieren
  await manager.registerTool({
    ...validAnnouncementTool,
    endpointUrl: `http://localhost:${mockBotPort}/api/plugins/announcement/send`
  });

  // Ausführung über executeTool (wie Gemini es zur Laufzeit tun würde)
  const execResult = await pluginManager.executeTool("discord_send_announcement", {
    title: "Community Event am Freitag",
    description: "Kommt alle vorbei um 20:00 Uhr!",
    roles: ["everyone"]
  });

  assert.strictEqual(execResult.success, true);
  assert.ok(execResult.url.includes("1122334455"));
  assert.strictEqual(receivedAuthHeader, "secret_bot_key_xyz123", "Auth-Header x-api-key muss übermittelt worden sein");
  assert.strictEqual(receivedPayload.title, "Community Event am Freitag");
  assert.deepStrictEqual(receivedPayload.roles, ["everyone"]);

  mockBotServer.close();
  console.log("✅ TEST 5 bestanden.\n");

  // Bereinigen
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }

  console.log("=================================================");
  console.log("🎉 ALLE TESTS ERFOLGREICH BESTANDEN!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("❌ Test fehlgeschlagen:", err);
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }
  process.exit(1);
});
