import { PrismaClient, UserPlan } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Migration script to backfill User.plan field based on current subscription status
 * Run this once after deploying the new changes to ensure existing data is in sync
 */
async function migrateUserPlans() {
  console.log('Starting User.plan migration...');

  try {
    // 1. Get all users with ACTIVE subscriptions
    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: {
          gt: new Date(), // Still active
        },
      },
      include: {
        user: true,
      },
    });

    console.log(
      `Found ${activeSubscriptions.length} users with active subscriptions`
    );

    // Update users with active subscriptions to PREMIUM
    let premiumCount = 0;
    for (const subscription of activeSubscriptions) {
      if (subscription.user.plan !== UserPlan.PREMIUM) {
        await prisma.user.update({
          where: { id: subscription.userId },
          data: { plan: UserPlan.PREMIUM },
        });
        premiumCount++;
        console.log(
          `Set ${subscription.user.email} to PREMIUM (had active subscription)`
        );
      }
    }

    // 2. Get all users with isPremium = true in UserQuota but no active subscription
    const premiumQuotaUsers = await prisma.userQuota.findMany({
      where: {
        isPremium: true,
      },
      include: {
        user: {
          include: {
            subscription: true,
          },
        },
      },
    });

    console.log(
      `Found ${premiumQuotaUsers.length} users with isPremium = true in quota`
    );

    for (const quota of premiumQuotaUsers) {
      const hasActiveSubscription =
        quota.user.subscription?.status === 'ACTIVE' &&
        quota.user.subscription.currentPeriodEnd > new Date();

      if (!hasActiveSubscription) {
        // This is inconsistent - they have isPremium but no active subscription
        // Reset both to free
        await prisma.$transaction([
          prisma.userQuota.update({
            where: { id: quota.id },
            data: { isPremium: false },
          }),
          prisma.user.update({
            where: { id: quota.userId },
            data: { plan: UserPlan.FREE },
          }),
        ]);
        console.log(
          `Reset ${quota.user.email} to FREE (had isPremium but no active subscription)`
        );
      } else if (quota.user.plan !== UserPlan.PREMIUM) {
        // Has active subscription and isPremium but plan is not PREMIUM
        await prisma.user.update({
          where: { id: quota.userId },
          data: { plan: UserPlan.PREMIUM },
        });
        premiumCount++;
        console.log(
          `Set ${quota.user.email} to PREMIUM (had isPremium and active subscription)`
        );
      }
    }

    // 3. Get all other users and ensure they are set to FREE
    const allUsers = await prisma.user.findMany({
      include: {
        subscription: true,
        quota: true,
      },
    });

    let freeCount = 0;
    for (const user of allUsers) {
      const hasActiveSubscription =
        user.subscription?.status === 'ACTIVE' &&
        user.subscription.currentPeriodEnd > new Date();

      if (!hasActiveSubscription && user.plan !== UserPlan.FREE) {
        await prisma.user.update({
          where: { id: user.id },
          data: { plan: UserPlan.FREE },
        });
        freeCount++;
        console.log(`Set ${user.email} to FREE (no active subscription)`);
      }
    }

    console.log('\nMigration Summary:');
    console.log(`- Set ${premiumCount} users to PREMIUM`);
    console.log(`- Set ${freeCount} users to FREE`);
    console.log('Migration completed successfully!');

    // 4. Verify consistency
    console.log('\nVerifying data consistency...');
    const inconsistentUsers = await prisma.$queryRaw`
      SELECT u.id, u.email, u.plan, uq."isPremium", s.status, s."currentPeriodEnd"
      FROM users u
      LEFT JOIN user_quotas uq ON u.id = uq."userId"
      LEFT JOIN subscriptions s ON u.id = s."userId"
      WHERE 
        (u.plan = 'PREMIUM' AND (uq."isPremium" = false OR s.status != 'ACTIVE' OR s."currentPeriodEnd" < NOW()))
        OR (u.plan = 'FREE' AND uq."isPremium" = true AND s.status = 'ACTIVE' AND s."currentPeriodEnd" > NOW())
    `;

    if (Array.isArray(inconsistentUsers) && inconsistentUsers.length > 0) {
      console.log(
        `⚠️  Warning: Found ${inconsistentUsers.length} inconsistent users:`
      );
      console.table(inconsistentUsers);
    } else {
      console.log('✅ No inconsistencies found!');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateUserPlans()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
