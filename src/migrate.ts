import { PrismaClient } from "@prisma/client";

/**
 * Führt eine automatische Datenmigration für das Personengedächtnis aus,
 * falls noch alte 'name'-Spaltenwerte in der Datenbank vorhanden sind.
 */
export async function runAutomaticMigration(prisma: PrismaClient) {
  console.log("[Migration] Überprüfe, ob eine Datenmigration für das Personengedächtnis erforderlich ist...");
  
  try {
    // Suchen nach Personen, die noch einen Namen in der alten deprecated 'name'-Spalte haben
    const peopleToMigrate = await prisma.person.findMany({
      where: {
        name: { not: null }
      }
    });

    if (peopleToMigrate.length === 0) {
      console.log("[Migration] Keine veralteten Personendaten gefunden. Keine Migration erforderlich.");
      return;
    }

    console.log(`[Migration] Gefunden: ${peopleToMigrate.length} zu migrierende Personen.`);

    for (const person of peopleToMigrate) {
      const oldName = person.name;
      if (!oldName) continue;

      console.log(`[Migration] Migriere '${oldName}' (ID: ${person.id})...`);

      // 1. Prüfen, ob für diese Person bereits ein primärer Alias mit diesem Namen existiert
      const existingAlias = await prisma.personAlias.findUnique({
        where: { name: oldName }
      });

      if (!existingAlias) {
        await prisma.personAlias.create({
          data: {
            personId: person.id,
            name: oldName,
            isPrimary: true
          }
        });
        console.log(`[Migration] Primärer Alias '${oldName}' für Person ID ${person.id} wurde angelegt.`);
      } else {
        console.log(`[Migration] Alias '${oldName}' existiert bereits (ID: ${existingAlias.id}).`);
      }

      // 2. Biografie befüllen aus notes (falls notes vorhanden und biography leer ist)
      //    und die alten deprecated Spalten 'name' und 'notes' auf null setzen.
      await prisma.person.update({
        where: { id: person.id },
        data: {
          biography: person.biography || person.notes || "",
          name: null,
          notes: null
        }
      });
    }

    console.log("[Migration] Alle Personendaten wurden erfolgreich in das neue Alias-Schema migriert!");
  } catch (error: any) {
    console.error("[Migration] Fehler bei der automatischen Migration des Personengedächtnisses:", error);
  }
}
