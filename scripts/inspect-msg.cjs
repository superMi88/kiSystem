const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const msgs = await prisma.chatMessage.findMany({
    where: { conversationId: '74868f49-d8dd-484e-a3b7-fce67c33a105' }
  });
  console.log(`Found ${msgs.length} msgs:`);
  for (const m of msgs) {
    console.log(`ID: ${m.id}, role: ${m.role}`);
    console.log(m.text);
    console.log('---');
  }
}

main().then(() => prisma.$disconnect());
