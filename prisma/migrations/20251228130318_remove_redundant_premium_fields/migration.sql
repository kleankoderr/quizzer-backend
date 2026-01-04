-- AlterTable: Remove redundant premium status fields
-- This migration consolidates premium status to use Subscription table as single source of truth

-- Drop User.plan column
ALTER TABLE "users" DROP COLUMN IF EXISTS "plan";

-- Drop UserQuota.isPremium column  
ALTER TABLE "user_quotas" DROP COLUMN IF EXISTS "isPremium";

-- Drop UserPlan enum type
DROP TYPE IF EXISTS "UserPlan";
