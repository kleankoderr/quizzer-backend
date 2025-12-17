import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // Define Free Plan
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'free-plan-id' },
    update: {},
    create: {
      id: 'free-plan-id',
      name: 'Free',
      price: 0,
      interval: 'monthly',
      isActive: true,
      quotas: {
        quizzes: 2,
        flashcards: 2,
        learningGuides: 1,
        explanations: 5,
        filesPerMonth: 5,
        storageLimitMB: 50,
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
    update: {},
    create: {
      id: 'premium-plan-id',
      name: 'Premium',
      price: 200000, // 200000 kobo = ₦2000
      interval: 'monthly',
      isActive: true,
      quotas: {
        quizzes: 15,
        flashcards: 15,
        learningGuides: 10,
        explanations: 20,
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
