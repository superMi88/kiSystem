import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { DynamicToolManager } from "../plugins/dynamic/DynamicToolManager.js";
import { toggleToolDisabled } from "../settings.js";

/**
 * Erstellt den Express-Router für dynamische KI-Tools
 */
export function createDynamicToolsRouter(dynamicToolManager: DynamicToolManager, pluginManager?: any): Router {
  const router = Router();

  /**
   * Optionale Authentifizierungs-Middleware für geschützte Endpunkte
   */
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const expectedKey = process.env.AI_API_KEY || process.env.INTERNAL_API_KEY || "";

    // Wenn kein Schlüssel konfiguriert ist, erlauben wir im lokalen Dev-Betrieb die Anfrage
    if (!expectedKey) {
      return next();
    }

    const authHeader = (req.headers["authorization"] || "") as string;
    let token = (req.headers["x-api-key"] || "") as string;

    if (!token && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Fehlender API-Schlüssel. Bitte Header 'x-api-key' oder 'Authorization: Bearer <key>' mitsenden."
      });
    }

    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expectedKey);

    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Ungültiger API-Schlüssel."
      });
    }

    next();
  };

  // Alle Routen durchlaufen die Sicherheits-Middleware
  router.use(authMiddleware);

  /**
   * GET /api/tools/overview
   * Liefert alle registrierten Tools (sowohl dynamische Remote-Tools als auch interne Plugin-Tools)
   */
  router.get("/overview", (req: Request, res: Response) => {
    if (pluginManager && typeof pluginManager.getToolsOverview === "function") {
      return res.json(pluginManager.getToolsOverview());
    }

    const dynamicTools = dynamicToolManager.getTools();
    return res.json({
      success: true,
      totalCount: dynamicTools.length,
      dynamicCount: dynamicTools.length,
      internalCount: 0,
      dynamicTools,
      internalTools: []
    });
  });

  /**
   * POST /api/tools/register
   * Registriert ein einzelnes Tool oder ein Array von Tools
   */
  router.post("/register", async (req: Request, res: Response) => {
    try {
      const payload = req.body;

      if (Array.isArray(payload)) {
        const batchResult = await dynamicToolManager.registerTools(payload);
        const statusCode = batchResult.failed.length > 0 && batchResult.registered.length === 0 ? 400 : 201;
        return res.status(statusCode).json({
          success: batchResult.registered.length > 0,
          registeredCount: batchResult.registered.length,
          registered: batchResult.registered,
          failedCount: batchResult.failed.length,
          failed: batchResult.failed
        });
      }

      // Einzelnes Tool
      const result = await dynamicToolManager.registerTool(payload);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          errors: result.errors
        });
      }

      return res.status(201).json({
        success: true,
        tool: result.tool
      });
    } catch (error: any) {
      console.error("[DynamicTools API Error] Fehler bei Registrierung:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/tools
   * Ruft alle registrierten Tools ab (sensible Keys sind maskiert)
   */
  router.get("/", (req: Request, res: Response) => {
    const { provider, enabled } = req.query;
    const filter = {
      provider: provider ? String(provider) : undefined,
      enabledOnly: enabled === "true"
    };

    const tools = dynamicToolManager.getTools(filter);
    res.json({
      success: true,
      count: tools.length,
      tools
    });
  });

  /**
   * GET /api/tools/:name
   * Holt die Definition eines spezifischen Tools
   */
  router.get("/:name", (req: Request, res: Response) => {
    const tool = dynamicToolManager.getTool(req.params.name);
    if (!tool) {
      return res.status(404).json({ success: false, error: `Tool '${req.params.name}' nicht gefunden.` });
    }
    res.json({ success: true, tool });
  });

  /**
   * DELETE /api/tools/:name
   * Deregistriert ein Tool
   */
  router.delete("/:name", async (req: Request, res: Response) => {
    try {
      const deleted = await dynamicToolManager.unregisterTool(req.params.name);
      if (!deleted) {
        return res.status(404).json({ success: false, error: `Tool '${req.params.name}' nicht gefunden.` });
      }
      res.json({ success: true, message: `Tool '${req.params.name}' erfolgreich gelöscht.` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PATCH /api/tools/:name/toggle
   * Aktiviert oder deaktiviert ein Tool
   */
  router.patch("/:name/toggle", async (req: Request, res: Response) => {
    try {
      const { isEnabled } = req.body;
      const name = req.params.name;

      // 1. Zuerst prüfen, ob es ein dynamisches Tool ist
      if (dynamicToolManager.hasTool(name)) {
        const tool = await dynamicToolManager.toggleTool(name, isEnabled);
        return res.json({ success: true, tool });
      }

      // 2. Prüfen, ob es ein internes Plugin-Tool ist
      if (pluginManager && typeof pluginManager.hasInternalTool === "function" && pluginManager.hasInternalTool(name)) {
        const newStatus = toggleToolDisabled(name, isEnabled);
        return res.json({ success: true, tool: { name, isEnabled: newStatus, isDynamic: false } });
      }

      return res.status(404).json({ success: false, error: `Tool '${name}' nicht gefunden.` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/tools/:name/execute
   * Führt ein registriertes Tool direkt aus (Test- und Debugging-Zwecke)
   */
  router.post("/:name/execute", async (req: Request, res: Response) => {
    try {
      const result = await dynamicToolManager.executeTool(req.params.name, req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
