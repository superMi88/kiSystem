import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function testImagen() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  // WICHTIG: Manche Modelle brauchen v1beta für Imagen
  const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" }, { apiVersion: "v1beta" });
  
  try {
    console.log("Versuche Bildgenerierung via generateContent...");
    const result = await model.generateContent("A cute cat");
    const response = await result.response;
    
    console.log("Antwort erhalten!");
    console.log("Anzahl der Parts:", response.candidates?.[0].content.parts.length);
    
    const parts = response.candidates?.[0].content.parts;
    parts?.forEach((part, i) => {
      console.log(`Part ${i} Typ:`, Object.keys(part).join(", "));
      if (part.inlineData) {
        console.log(`Part ${i} MimeType:`, part.inlineData.mimeType);
        console.log(`Part ${i} Data Länge:`, part.inlineData.data.length);
      }
      if (part.text) {
        console.log(`Part ${i} Text:`, part.text);
      }
    });
  } catch (e: any) {
    console.error("Fehler beim Test:", e.message);
  }
}

testImagen();
