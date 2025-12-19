import { PrismaClient } from '@prisma/client';

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // Define Free Plan
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'free-plan-id' },
    update: {
      name: 'Free',
      price: 0,
      interval: 'monthly',
      isActive: true,
      quotas: {
        quizzes: 5,
        flashcards: 5,
        studyMaterials: 2,
        conceptExplanations: 5,
        smartRecommendations: 5,
        smartCompanions: 5,
        filesPerMonth: 10,
        storageLimitMB: 20,
      },
    },
    create: {
      id: 'free-plan-id',
      name: 'Free',
      price: 0,
      interval: 'monthly',
      isActive: true,
      quotas: {
        quizzes: 5,
        flashcards: 5,
        studyMaterials: 2,
        conceptExplanations: 5,
        smartRecommendations: 5,
        smartCompanions: 5,
        filesPerMonth: 10,
        storageLimitMB: 20,
      },
    },
  });

  console.log('✅ Free Plan created/updated:', {
    id: freePlan.id,
    name: freePlan.name,
    price: freePlan.price,
    quotas: freePlan.quotas,
  });

  // Define Premium Plan
  const premiumPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'premium-plan-id' },
    update: {
      name: 'Premium',
      price: 2000,
      interval: 'monthly',
      isActive: true,
      quotas: {
        quizzes: 15,
        flashcards: 15,
        studyMaterials: 10,
        conceptExplanations: 20,
        smartRecommendations: 20,
        smartCompanions: 20,
        filesPerMonth: 100,
        storageLimitMB: 1000,
      },
    },
    create: {
      id: 'premium-plan-id',
      name: 'Premium',
      price: 2000, // ₦2000 per month
      interval: 'monthly',
      isActive: true,
      quotas: {
        quizzes: 15,
        flashcards: 15,
        studyMaterials: 10,
        conceptExplanations: 20,
        smartRecommendations: 20,
        smartCompanions: 20,
        filesPerMonth: 100,
        storageLimitMB: 1000,
      },
    },
  });

  console.log('✅ Premium Plan created/updated:', {
    id: premiumPlan.id,
    name: premiumPlan.name,
    price: premiumPlan.price,
    quotas: premiumPlan.quotas,
  });

  console.log('\n🎉 Database seeding completed successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
