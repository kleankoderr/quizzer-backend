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
      quota: {
        create: {
          hasActivePaidPlan: true,
        },
      },
    },
  });

  console.log('✅ Super Admin created:', admin.email);
}

async function seedEntitlements() {
  const entitlements = [
    { key: 'quiz', name: 'Quiz Generation', type: 'COUNTER' },
    { key: 'flashcard', name: 'Flashcard Generation', type: 'COUNTER' },
    {
      key: 'studyMaterial',
      name: 'Study Material Generation',
      type: 'COUNTER',
    },
    { key: 'conceptExplanation', name: 'Concept Explanation', type: 'COUNTER' },
    {
      key: 'smartRecommendation',
      name: 'Smart Recommendation',
      type: 'COUNTER',
    },
    { key: 'smartCompanion', name: 'Smart Companion', type: 'COUNTER' },
    { key: 'fileUpload', name: 'File Upload Count', type: 'COUNTER' },
    { key: 'fileStorage', name: 'File Storage Limit', type: 'COUNTER' },
    { key: 'weakAreaAnalysis', name: 'Weak Area Analysis', type: 'COUNTER' },
  ];

  for (const ent of entitlements) {
    await prisma.entitlement.upsert({
      where: { key: ent.key },
      update: { name: ent.name, type: ent.type as any },
      create: { key: ent.key, name: ent.name, type: ent.type as any },
    });
  }
  console.log('✅ Base Entitlements seeded');
}

async function seedPlans() {
  const plans = [
    {
      id: 'free_plan',
      name: 'Free',
      price: 0,
      interval: 'monthly',
      isActive: true,
      quotas: {
        quiz: 5,
        flashcard: 5,
        studyMaterial: 2,
        conceptExplanation: 5,
        smartRecommendation: 5,
        smartCompanion: 5,
        fileUpload: 10,
        fileStorage: 20,
        weakAreaAnalysis: 1,
      },
    },
    {
      id: 'premium_plan',
      name: 'Premium',
      price: 2000,
      interval: 'monthly',
      isActive: true,
      quotas: {
        quiz: 50,
        flashcard: 50,
        studyMaterial: 20,
        conceptExplanation: 100,
        smartRecommendation: 100,
        smartCompanion: 100,
        fileUpload: 100,
        fileStorage: 1000,
        weakAreaAnalysis: 10,
      },
    },
  ];

  for (const planData of plans) {
    const { quotas, ...data } = planData;
    const plan = await prisma.subscriptionPlan.upsert({
      where: { name: data.name },
      update: { ...data, quotas: quotas as any },
      create: { ...data, quotas: quotas as any },
    });

    // Seed Plan Entitlements based on the quotas
    for (const [key, value] of Object.entries(quotas)) {
      const entitlement = await prisma.entitlement.findUnique({
        where: { key },
      });

      if (entitlement) {
        await prisma.planEntitlement.upsert({
          where: {
            planId_entitlementId: {
              planId: plan.id,
              entitlementId: entitlement.id,
            },
          },
          update: { value: { limit: value } as any },
          create: {
            planId: plan.id,
            entitlementId: entitlement.id,
            value: { limit: value } as any,
          },
        });
      }
    }
    console.log(`✅ ${plan.name} Plan & Entitlements seeded`);
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

  // Seed entitlements before plans
  await seedEntitlements();

  // Run plans and settings in parallel
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
