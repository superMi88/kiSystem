import { SchemaType } from "@google/generative-ai";

/**
 * Standardisierte Tool-Definition für dynamische KI-Tools (Push-Registrierung)
 */
export interface DynamicToolAuth {
  type: "apiKey" | "bearer" | "none";
  header?: string; // Standard: "x-api-key" bei apiKey oder "Authorization" bei bearer
  token?: string;  // API-Key oder Bearer-Token
}

export interface DynamicToolParameters {
  type?: "OBJECT" | "object" | string;
  properties: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

export interface DynamicToolDefinition {
  name: string;
  description: string;
  parameters: DynamicToolParameters;
  returnValues?: any;
  endpointUrl: string;
  authentication?: DynamicToolAuth;
  provider?: string;
  isEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Validiert eine Tool-Definition anhand des definierten Standards
 */
export function validateDynamicToolDefinition(toolDef: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!toolDef || typeof toolDef !== "object" || Array.isArray(toolDef)) {
    return { valid: false, errors: ["Tool-Definition muss ein JSON-Objekt sein."] };
  }

  // 1. Name validieren (alphanumerisch, Bindestrich, Unterstrich)
  if (!toolDef.name || typeof toolDef.name !== "string") {
    errors.push("Feld 'name' ist erforderlich und muss ein String sein.");
  } else if (!/^[a-zA-Z0-9_-]+$/.test(toolDef.name)) {
    errors.push("Feld 'name' darf nur Buchstaben (a-z, A-Z), Ziffern (0-9), Bindestriche (-) und Unterstriche (_) enthalten.");
  }

  // 2. Beschreibung validieren
  if (!toolDef.description || typeof toolDef.description !== "string" || toolDef.description.trim().length === 0) {
    errors.push("Feld 'description' ist erforderlich und darf nicht leer sein.");
  }

  // 3. Parameter-Schema validieren
  if (!toolDef.parameters || typeof toolDef.parameters !== "object") {
    errors.push("Feld 'parameters' ist erforderlich und muss ein Objekt sein.");
  } else {
    if (!toolDef.parameters.properties || typeof toolDef.parameters.properties !== "object") {
      errors.push("'parameters.properties' ist erforderlich und muss ein Objekt sein.");
    }
  }

  // 4. Remote-Endpunkt validieren
  if (!toolDef.endpointUrl || typeof toolDef.endpointUrl !== "string") {
    errors.push("Feld 'endpointUrl' ist erforderlich.");
  } else if (!toolDef.endpointUrl.startsWith("http://") && !toolDef.endpointUrl.startsWith("https://")) {
    errors.push("Feld 'endpointUrl' muss eine absolute HTTP- oder HTTPS-URL sein (z.B. http://server:3001/api/...).");
  }

  // 5. Authentifizierung validieren (optional)
  if (toolDef.authentication) {
    if (typeof toolDef.authentication !== "object") {
      errors.push("'authentication' muss ein Objekt sein.");
    } else {
      const authType = toolDef.authentication.type;
      if (authType && !["apiKey", "bearer", "none"].includes(authType)) {
        errors.push("Ungültiger Authentifizierungstyp. Erlaubt sind 'apiKey', 'bearer' oder 'none'.");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalisiert Typ-Strings in SchemaType-Werte für Gemini
 */
export function normalizeSchemaType(typeStr: any): SchemaType {
  const normalized = String(typeStr || "").toUpperCase();
  switch (normalized) {
    case "STRING":
      return SchemaType.STRING;
    case "NUMBER":
      return SchemaType.NUMBER;
    case "INTEGER":
      return SchemaType.INTEGER;
    case "BOOLEAN":
      return SchemaType.BOOLEAN;
    case "ARRAY":
      return SchemaType.ARRAY;
    case "OBJECT":
      return SchemaType.OBJECT;
    default:
      return SchemaType.STRING;
  }
}

/**
 * Normalisiert ein Parameter-Eigenschafts-Schema rekursiv für Gemini
 */
function normalizeProperty(prop: any): any {
  if (!prop || typeof prop !== "object") {
    return { type: SchemaType.STRING };
  }

  const result: any = {
    type: normalizeSchemaType(prop.type),
    description: prop.description || ""
  };

  if (prop.enum && Array.isArray(prop.enum)) {
    result.enum = prop.enum;
  }

  if (prop.items) {
    result.items = normalizeProperty(prop.items);
  }

  if (prop.properties && typeof prop.properties === "object") {
    result.properties = {};
    for (const [key, subProp] of Object.entries(prop.properties)) {
      result.properties[key] = normalizeProperty(subProp);
    }
  }

  return result;
}

/**
 * Konvertiert eine DynamicToolDefinition in eine Google Gemini Function Declaration
 */
export function toGeminiDeclaration(toolDef: DynamicToolDefinition): any {
  const geminiProps: Record<string, any> = {};
  const rawProps = toolDef.parameters?.properties || {};

  for (const [key, prop] of Object.entries(rawProps)) {
    geminiProps[key] = normalizeProperty(prop);
  }

  return {
    name: toolDef.name,
    description: toolDef.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: geminiProps,
      required: Array.isArray(toolDef.parameters?.required) ? toolDef.parameters.required : []
    }
  };
}

/**
 * Konvertiert eine DynamicToolDefinition in ein MCP-kompatibles Tool-Format
 */
export function toMcpTool(toolDef: DynamicToolDefinition): any {
  return {
    name: toolDef.name,
    description: toolDef.description,
    inputSchema: {
      type: "object",
      properties: toolDef.parameters?.properties || {},
      required: Array.isArray(toolDef.parameters?.required) ? toolDef.parameters.required : []
    }
  };
}

/**
 * Bereinigt eine Tool-Definition für die öffentliche Ausgabe (entfernt Auth-Tokens)
 */
export function sanitizeTool(toolDef: DynamicToolDefinition): DynamicToolDefinition {
  const copy = { ...toolDef };
  if (copy.authentication) {
    copy.authentication = {
      type: copy.authentication.type,
      header: copy.authentication.header,
      token: copy.authentication.token ? "********" : undefined
    };
  }
  return copy;
}
