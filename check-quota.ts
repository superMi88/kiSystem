import dotenv from "dotenv";

dotenv.config();

async function checkModels() {
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json() as any;

    if (data.models) {
      console.log("Verfügbare Modelle für diesen Key:");
      data.models.forEach((m: any) => {
        console.log(`- ${m.name} (Support: ${m.supportedGenerationMethods.join(", ")})`);
      });
    } else {
      console.log("Keine Modelle gefunden oder Fehler:", data);
    }
  } catch (error) {
    console.error("Fehler beim Abruf:", error);
  }
}

checkModels();
