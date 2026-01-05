import { PrismaClient, UserRole, PlanType } from '@prisma/client';
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
    console.log('⚠️  Super Admin credentials not found. Skipping...\n');
    return;
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log('✅ Super Admin exists:', adminEmail);

    if (existingAdmin.role !== UserRole.SUPER_ADMIN) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { role: UserRole.SUPER_ADMIN, emailVerified: true },
      });
      console.log('   ↳ Updated to SUPER_ADMIN\n');
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

  console.log('✅ Super Admin created:', admin.email);
}

async function seedPlans() {
  const plans = [
    {
      id: 'free-plan-id',
      name: PlanType.Free,
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
    {
      id: 'premium-plan-id',
      name: PlanType.Premium,
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
  ];

  for (const plan of plans) {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id: plan.id },
    });

    if (existing) {
      console.log(`✅ ${plan.name} Plan already exists`);
      continue;
    }

    await prisma.subscriptionPlan.create({ data: plan });
    console.log(`✅ ${plan.name} Plan created: ₦${plan.price}/month`);
  }
}

async function seedPlatformSettings() {
  const defaultAiConfig = {
    files: 'gemini',
    content: 'groq',
    explanation: 'groq',
    example: 'groq',
    recommendations: 'groq',
    summary: 'groq',
  };

  const existing = await prisma.platformSettings.findFirst();

  if (existing) {
    await prisma.platformSettings.update({
      where: { id: existing.id },
      data: { aiProviderConfig: defaultAiConfig as any },
    });
    console.log('✅ Platform Settings updated');
  } else {
    await prisma.platformSettings.create({
      data: {
        allowRegistration: true,
        maintenanceMode: false,
        aiProviderConfig: defaultAiConfig as any,
      },
    });
    console.log('✅ Platform Settings created');
  }
}

async function main() {
  console.log('🌱 Seeding database...\n');

  // Run super admin first
  await seedSuperAdmin();

  // Run plans and settings in parallel (independent operations)
  await Promise.all([seedPlans(), seedPlatformSettings()]);

  console.log('\n🎉 Seeding completed!');
}

main()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
