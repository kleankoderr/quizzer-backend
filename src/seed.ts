import { PlanType, PrismaClient, UserRole } from '@prisma/client';
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

  // 🔥 Always recreate
  await prisma.user.deleteMany({
    where: { email: adminEmail },
  });

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      password: hashedPassword,
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      emailVerified: true,
      profile: {
        create: {
          schoolName: 'Quizzer HQ',
          grade: 'Admin',
        },
      },
    },
  });

  console.log('✅ Super Admin created:', admin.email);
}

async function seedPlans() {
  // 🔥 Use upsert to avoid foreign key errors (so we don't delete plans users are subscribed to)
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
        summaries: 3,
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
        summaries: 15,
        filesPerMonth: 100,
        storageLimitMB: 1000,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
    console.log(`✅ ${plan.name} Plan upserted: ₦${plan.price}/month`);
  }
}

async function seedPlatformSettings() {
  await prisma.platformSettings.upsert({
    where: { id: 'platform-settings-id' },
    update: {
      allowRegistration: true,
      maintenanceMode: false,
    },
    create: {
      allowRegistration: true,
      maintenanceMode: false,
    },
  });

  console.log('✅ Platform Settings created');
}

async function main() {
  console.log('🌱 Seeding database...\n');

  await seedSuperAdmin();
  await Promise.all([seedPlans(), seedPlatformSettings()]);

  console.log('\n🎉 Seeding completed!');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
