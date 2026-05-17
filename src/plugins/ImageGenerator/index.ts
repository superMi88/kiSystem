import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plugin } from "../types.js";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export const imageGeneratorPlugin: Plugin = {
  name: "ImageGenerator",
  description: "Erzeugt extrem hochwertige Bilder mit Google Imagen 4.0.",
  tools: [
    {
      definition: {
        name: "generiere_bild",
        description: "Erzeugt ein Bild mit dem neuesten Google Imagen 4.0 Modell.",
        parameters: {
          type: "object",
          properties: {
            prompt: { 
              type: "string", 
              description: "Eine detaillierte Beschreibung des gewünschten Bildes." 
            }
          },
          required: ["prompt"]
        } as any
      },
      handler: async (args) => {
        const { prompt } = args;
        
        try {
          console.log("Starte Generierung mit Imagen 4.0...");
          
          // Imagen 4.0 über den REST-Weg, da das SDK 'predict' oft noch nicht direkt unterstützt
          const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GOOGLE_API_KEY}`;
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              instances: [
                { prompt: prompt }
              ],
              parameters: {
                sampleCount: 1
              }
            })
          });

          const data = await response.json();
          
          if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
            const base64Image = data.predictions[0].bytesBase64Encoded;
            const imageUrl = `data:image/png;base64,${base64Image}`;

            return {
              type: "image_widget",
              url: imageUrl,
              prompt: prompt,
              status: "success",
              message: "Bild wurde mit Google Imagen 4.0 generiert."
            };
          } else {
            console.error("Unerwartete API Antwort:", JSON.stringify(data));
            throw new Error(data.error?.message || "Bilddaten konnten nicht empfangen werden.");
          }

        } catch (error: any) {
          console.error("Fehler bei Imagen 4.0:", error.message);
          return {
            type: "text",
            text: "Fehler bei der Bildgenerierung mit Imagen 4.0: " + error.message
          };
        }
      }
    }
  ]
};
