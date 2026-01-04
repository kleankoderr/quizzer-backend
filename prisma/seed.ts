import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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

async function seedSuperAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log(
      '⚠️  Super Admin credentials not found in environment variables. Skipping...\n'
    );
    return;
  }

  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      console.log('✅ Super Admin account already exists:', adminEmail);

      // Ensure role is SUPER_ADMIN
      if (existingAdmin.role === UserRole.SUPER_ADMIN) {
        console.log('');
      } else {
        await prisma.user.update({
          where: { id: existingAdmin.id },
          data: {
            role: UserRole.SUPER_ADMIN,
            emailVerified: true,
          },
        });
        console.log('   ↳ Updated role to SUPER_ADMIN and verified email\n');
      }
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Super Admin',
        role: UserRole.SUPER_ADMIN,
        schoolName: 'Quizzer HQ',
        grade: 'Admin',
        emailVerified: true,
      },
    });

    console.log('✅ Super Admin account created:', {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    });
    console.log('');
  } catch (error: any) {
    console.error('❌ Failed to seed Super Admin:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // Seed Super Admin first
  await seedSuperAdmin();

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

  // Define Platform Settings
  const settings = await prisma.platformSettings.findFirst();
  const defaultAiConfig = {
    files: 'gemini',
    content: 'groq',
    explanation: 'groq',
    example: 'groq',
    recommendations: 'groq',
    summary: 'groq',
    // quiz, flashcards, learningGuide are OMITTED to allow dynamic fallback
  };

  if (settings) {
    await prisma.platformSettings.update({
      where: { id: settings.id },
      data: { aiProviderConfig: defaultAiConfig as any },
    });
    console.log('✅ Platform Settings updated with default AI config');
  } else {
    await prisma.platformSettings.create({
      data: {
        allowRegistration: true,
        maintenanceMode: false,
        aiProviderConfig: defaultAiConfig as any,
      },
    });
    console.log('✅ Platform Settings created with default AI config');
  }

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
