import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function findImagenModels() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  
  try {
    console.log("Rufe Liste aller verfügbaren Modelle ab...");
    // Hinweis: listModels ist oft nicht direkt im GenerativeAI Objekt, 
    // aber wir können die v1beta REST API abfragen oder bekannte Namen testen.
    
    // Wir probieren eine andere Methode: Wir fragen die API direkt nach Modellen.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_API_KEY}`);
    const data = await response.json();
    
    if (data.models) {
      const imagenModels = data.models.filter((m: any) => m.name.toLowerCase().includes("imagen"));
      if (imagenModels.length > 0) {
        console.log("Gefundene Imagen Modelle:");
        imagenModels.forEach((m: any) => console.log(`- ${m.name} (${m.supportedGenerationMethods.join(", ")})`));
      } else {
        console.log("Keine Imagen-Modelle in der Liste gefunden.");
        console.log("Verfügbare Modelle (Auszug):", data.models.slice(0, 10).map((m: any) => m.name).join(", "));
      }
    } else {
      console.log("Keine Modelle in der Antwort gefunden.");
    }
  } catch (e: any) {
    console.error("Fehler beim Abrufen der Liste:", e.message);
  }
}

findImagenModels();
