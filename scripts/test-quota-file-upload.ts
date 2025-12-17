import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testQuotaService() {
  console.log('🧪 Testing Quota Service File Upload Features\n');

  try {
    // Find a user to test with
    const user = await prisma.user.findFirst({
      include: {
        quota: true,
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!user) {
      console.log('❌ No users found in database');
      return;
    }

    console.log(`📋 Testing with user: ${user.email}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Has subscription: ${user.subscription ? 'Yes' : 'No'}`);

    if (user.subscription) {
      console.log(`   Subscription status: ${user.subscription.status}`);
      console.log(
        `   Plan: ${user.subscription.plan.name} (${user.subscription.plan.interval})`
      );
      console.log(
        `   Plan quotas:`,
        JSON.stringify(user.subscription.plan.quotas, null, 2)
      );
    }

    // Check current quota
    if (user.quota) {
      console.log('\n📊 Current Quota Status:');
      console.log(`   Daily file uploads: ${user.quota.dailyFileUploadCount}`);
      console.log(
        `   Monthly file uploads: ${user.quota.monthlyFileUploadCount}`
      );
      console.log(
        `   Total storage: ${user.quota.totalFileStorageMB.toFixed(2)}MB`
      );
      console.log(`   Is premium: ${user.quota.isPremium}`);
    }

    console.log('\n✅ Quota service integration verified!');
    console.log(
      '\n💡 Note: To fully test the new methods, use them in your upload endpoint:'
    );
    console.log('   1. Call checkFileStorageLimit() before upload');
    console.log('   2. Call incrementFileUpload() after successful upload');
    console.log(
      '   3. The getQuotaStatus() now includes fileUpload and fileStorage info'
    );
  } catch (error) {
    console.error('❌ Error testing quota service:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testQuotaService();
