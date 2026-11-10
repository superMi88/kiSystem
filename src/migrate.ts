import { PrismaClient } from "@prisma/client";

/**
 * Führt eine automatische Datenmigration für das Personengedächtnis und neue Datenbanktabellen/-spalten aus.
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
      console.log("[Migration] Keine veralteten Personendaten gefunden. Keine Personen-Migration erforderlich.");
    } else {
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
    }
  } catch (error: any) {
    console.error("[Migration] Fehler bei der automatischen Migration des Personengedächtnisses:", error);
  }

  // Schema-Migration für isStarred (Project, Task) und status (Task)
  try {
    console.log("[Migration] Überprüfe Datenbankspalten für Projekte und Aufgaben (isStarred, status)...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "categories" JSONB;`);
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
        "detailedInstructions" TEXT,
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
    await prisma.$executeRawUnsafe(`ALTER TABLE "DynamicTool" ADD COLUMN IF NOT EXISTS "detailedInstructions" TEXT;`);
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
        "reasoning" TEXT,
        "agentName" TEXT,
        "agentAvatar" TEXT,
        "agentColor" TEXT,
        "actionData" JSONB,
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
    await prisma.$executeRawUnsafe(`ALTER TABLE "AgentNotification" ADD COLUMN IF NOT EXISTS "reasoning" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "AgentNotification" ADD COLUMN IF NOT EXISTS "agentName" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "AgentNotification" ADD COLUMN IF NOT EXISTS "agentAvatar" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "AgentNotification" ADD COLUMN IF NOT EXISTS "agentColor" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "AgentNotification" ADD COLUMN IF NOT EXISTS "actionData" JSONB;`);
    console.log("[Migration] Tabelle AgentNotification erfolgreich verifiziert/erstellt.");
  } catch (notifErr: any) {
    console.warn("[Migration] Hinweis: Tabelle AgentNotification:", notifErr.message);
  }

  // Schema-Migration für Locations, Media & Verknüpfungstabellen
  try {
    console.log("[Migration] Überprüfe Tabellen für Locations & Media...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Location" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'address',
        "address" TEXT,
        "postalCode" TEXT,
        "city" TEXT,
        "state" TEXT,
        "country" TEXT DEFAULT 'Deutschland',
        "formattedAddress" TEXT,
        "notes" TEXT,
        "lat" DOUBLE PRECISION,
        "lng" DOUBLE PRECISION,
        "isFavorite" BOOLEAN NOT NULL DEFAULT false,
        "isDeleted" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PersonLocation" (
        "id" SERIAL PRIMARY KEY,
        "personId" INTEGER NOT NULL REFERENCES "Person"("id") ON DELETE CASCADE,
        "locationId" INTEGER NOT NULL REFERENCES "Location"("id") ON DELETE CASCADE,
        "relationType" TEXT NOT NULL DEFAULT 'residence',
        "label" TEXT,
        "isPrimary" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "PersonLocation_personId_locationId_relationType_key"
      ON "PersonLocation"("personId", "locationId", "relationType");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MediaItem" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "fileName" TEXT NOT NULL,
        "filePath" TEXT NOT NULL,
        "fileType" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'document',
        "fileSize" INTEGER NOT NULL DEFAULT 0,
        "description" TEXT,
        "extractedText" TEXT,
        "isFavorite" BOOLEAN NOT NULL DEFAULT false,
        "isDeleted" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MediaPerson" (
        "id" SERIAL PRIMARY KEY,
        "mediaId" INTEGER NOT NULL REFERENCES "MediaItem"("id") ON DELETE CASCADE,
        "personId" INTEGER NOT NULL REFERENCES "Person"("id") ON DELETE CASCADE,
        "role" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MediaPerson_mediaId_personId_key"
      ON "MediaPerson"("mediaId", "personId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MediaProject" (
        "id" SERIAL PRIMARY KEY,
        "mediaId" INTEGER NOT NULL REFERENCES "MediaItem"("id") ON DELETE CASCADE,
        "projectId" INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "tag" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MediaProject_mediaId_projectId_key"
      ON "MediaProject"("mediaId", "projectId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EventPerson" (
        "id" SERIAL PRIMARY KEY,
        "eventId" INTEGER NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
        "personId" INTEGER NOT NULL REFERENCES "Person"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "EventPerson_eventId_personId_key"
      ON "EventPerson"("eventId", "personId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TaskPerson" (
        "id" SERIAL PRIMARY KEY,
        "taskId" INTEGER NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
        "personId" INTEGER NOT NULL REFERENCES "Person"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TaskPerson_taskId_personId_key"
      ON "TaskPerson"("taskId", "personId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MediaEvent" (
        "id" SERIAL PRIMARY KEY,
        "mediaId" INTEGER NOT NULL REFERENCES "MediaItem"("id") ON DELETE CASCADE,
        "eventId" INTEGER NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MediaEvent_mediaId_eventId_key"
      ON "MediaEvent"("mediaId", "eventId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MediaTask" (
        "id" SERIAL PRIMARY KEY,
        "mediaId" INTEGER NOT NULL REFERENCES "MediaItem"("id") ON DELETE CASCADE,
        "taskId" INTEGER NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MediaTask_mediaId_taskId_key"
      ON "MediaTask"("mediaId", "taskId");
    `);

    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "locationId" INTEGER REFERENCES "Location"("id") ON DELETE SET NULL;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "locationId" INTEGER REFERENCES "Location"("id") ON DELETE SET NULL;`);
    console.log("[Migration] Locations & Media Tabellen erfolgreich verifiziert/erstellt.");
  } catch (locMediaErr: any) {
    console.warn("[Migration] Hinweis: Locations/Media Migration:", locMediaErr.message);
  }

  // Schema-Migration für Event Standort & Routenplanung
  try {
    console.log("[Migration] Überprüfe Spalten für Event-Standort & Routenplanung...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "location" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "travelMode" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "travelDurationMinutes" INTEGER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "travelDistanceText" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "travelOriginLocation" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "travelAiSuggestion" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "travelTransitDetails" JSONB;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "RecurrencePattern" ADD COLUMN IF NOT EXISTS "location" TEXT;`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RouteCache" (
        "id" SERIAL PRIMARY KEY,
        "origin" TEXT NOT NULL,
        "destination" TEXT NOT NULL,
        "travelMode" TEXT NOT NULL,
        "durationMinutes" INTEGER NOT NULL,
        "durationText" TEXT NOT NULL,
        "distanceMeters" INTEGER,
        "distanceText" TEXT,
        "summary" TEXT,
        "googleMapsUrl" TEXT,
        "rawDetails" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RouteCache_origin_destination_travelMode_key"
      ON "RouteCache"("origin", "destination", "travelMode");
    `);
    console.log("[Migration] Event-Standort & RouteCache Tabelle erfolgreich verifiziert/erstellt.");
  } catch (routeErr: any) {
    console.warn("[Migration] Hinweis: Spaltenmigration für Event/RouteCache:", routeErr.message);
  }
}
