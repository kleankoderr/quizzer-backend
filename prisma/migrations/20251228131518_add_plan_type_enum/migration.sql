-- CreateEnum: Add PlanType enum for subscription plans
CREATE TYPE "PlanType" AS ENUM ('Free', 'Premium');

-- AlterTable: Change subscription_plans.name from text to PlanType enum
ALTER TABLE "subscription_plans" ALTER COLUMN "name" TYPE "PlanType" USING ("name"::"PlanType");
