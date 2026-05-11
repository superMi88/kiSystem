import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Lösche alle lokalen Kalender-Einträge...');
  const deleted = await prisma.calendarEvent.deleteMany({});
  console.log(`Erfolgreich gelöscht: ${deleted.count} Einträge.`);
}

main()
  .catch((e) => {
    console.error('Fehler beim Löschen:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
