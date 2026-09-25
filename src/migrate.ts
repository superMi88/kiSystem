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

  // Schema-Migration für isStarred (Project, Task) und status (Task)
  try {
    console.log("[Migration] Überprüfe Datenbankspalten für Projekte und Aufgaben (isStarred, status)...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'in_progress';`);
    
    // Bestehende Tasks mit passendem Status initialisieren falls noch nicht gesetzt
    await prisma.$executeRawUnsafe(`
      UPDATE "Task" SET "status" = 'done' WHERE "completed" = true AND ("status" IS NULL OR "status" = 'in_progress');
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "Task" SET "status" = 'suggestion' WHERE "isPlanned" = true AND "completed" = false AND ("status" IS NULL OR "status" = 'in_progress');
    `);
    console.log("[Migration] Spalten für Projekte und Aufgaben erfolgreich verifiziert/migriert.");
  } catch (colErr: any) {
    console.warn("[Migration] Hinweis: Spaltenmigration für Project/Task:", colErr.message);
  }

  // Schema-Migration für DynamicTool-Tabelle
  try {
    console.log("[Migration] Überprüfe Tabelle DynamicTool...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DynamicTool" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "description" TEXT NOT NULL,
        "parameters" JSONB NOT NULL,
        "returnValues" JSONB,
        "endpointUrl" TEXT NOT NULL,
        "authType" TEXT NOT NULL DEFAULT 'none',
        "authHeader" TEXT,
        "authToken" TEXT,
        "provider" TEXT,
        "isEnabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[Migration] Tabelle DynamicTool erfolgreich verifiziert/erstellt.");
  } catch (toolTableErr: any) {
    console.warn("[Migration] Hinweis: Tabelle DynamicTool:", toolTableErr.message);
  }

  // Schema-Migration für Agent Runs (Conversation & CachedEmail)
  try {
    console.log("[Migration] Überprüfe Spalten für Agent Runs...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "isAgentRun" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "triggerType" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "triggerId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'completed';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "summary" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "CachedEmail" ADD COLUMN IF NOT EXISTS "agentRunId" TEXT;`);
    console.log("[Migration] Agent Run Spalten erfolgreich verifiziert/migriert.");
  } catch (agentErr: any) {
    console.warn("[Migration] Hinweis: Spaltenmigration für Agent Runs:", agentErr.message);
  }

  // Schema-Migration für AgentNotification
  try {
    console.log("[Migration] Überprüfe Tabelle AgentNotification...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AgentNotification" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'info',
        "priority" TEXT NOT NULL DEFAULT 'normal',
        "sourceType" TEXT NOT NULL DEFAULT 'mail',
        "sourceId" TEXT,
        "conversationId" TEXT REFERENCES "Conversation"("id") ON DELETE CASCADE,
        "buttons" JSONB,
        "isRead" BOOLEAN NOT NULL DEFAULT false,
        "isDismissed" BOOLEAN NOT NULL DEFAULT false,
        "selectedButton" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[Migration] Tabelle AgentNotification erfolgreich verifiziert/erstellt.");
  } catch (notifErr: any) {
    console.warn("[Migration] Hinweis: Tabelle AgentNotification:", notifErr.message);
  }
}
