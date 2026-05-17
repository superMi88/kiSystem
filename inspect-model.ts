import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function inspectModel() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" }, { apiVersion: "v1beta" });
  
  console.log("Verfügbare Methoden am Modell-Objekt:");
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(model));
  console.log(methods.join(", "));
  
  console.log("\nInstanz-Eigenschaften:");
  console.log(Object.keys(model).join(", "));
}

inspectModel();
