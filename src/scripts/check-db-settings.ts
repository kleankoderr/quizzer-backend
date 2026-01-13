import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const settings = await prisma.platformSettings.findFirst();
    console.log('Current DB Settings:');
    console.log(JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error fetching settings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
