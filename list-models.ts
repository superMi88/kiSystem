import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  try {
    // Es gibt keine direkte listModels Funktion im generischen SDK für v1, 
    // aber wir versuchen einfach ein paar bekannte Namen.
    console.log("Teste Zugriff auf Modelle...");
    const models = ["gemini-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    
    for (const modelName of models) {
      try {
        console.log(`Versuche Aufruf für '${modelName}'...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hi");
        console.log(`✅ Modell '${modelName}' FUNKTIONIERT.`);
      } catch (e: any) {
        console.log(`❌ Modell '${modelName}' FEHLER: ${e.message}`);
      }
    }
  } catch (error) {
    console.error("Fehler beim Abrufen:", error);
  }
}

listModels();
