import { Plugin } from "../types.js";
import { SchemaType } from "@google/generative-ai";

export const lightPlugin: Plugin = {
  name: "LightControl",
  description: "Steuerung der Zimmerbeleuchtung",
  tools: [
    {
      definition: {
        name: "schalte_licht",
        description: "Schaltet das Licht ein oder aus.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            status: {
              type: SchemaType.STRING,
              description: "Der Status ('on' oder 'off')"
            }
          },
          required: ["status"],
        } as any,
      },
      handler: async (args, { prisma }) => {
        const status = args.status as string;
        await prisma.lichtStatus.upsert({
          where: { id: 1 },
          update: { status },
          create: { id: 1, status },
        });
        return { status: "success", message: `Licht ist jetzt ${status}` };
      }
    },
    {
      definition: {
        name: "pruefe_licht",
        description: "Gibt den aktuellen Status des Lichts zurück.",
      },
      handler: async (_, { prisma }) => {
        const entry = await prisma.lichtStatus.findUnique({ where: { id: 1 } });
        return { status: entry?.status || "off" };
      }
    }
  ],
  getTopWidgets: async ({ prisma }) => {
    const entry = await prisma.lichtStatus.findUnique({ where: { id: 1 } });
    return [
      {
        pluginName: "LightControl",
        type: "light_control",
        data: { status: entry?.status || "off" }
      }
    ];
  }
};
