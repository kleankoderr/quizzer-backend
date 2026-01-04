/*
  Warnings:

  - You are about to drop the `highlights` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('FREE', 'PREMIUM');

-- DropForeignKey
ALTER TABLE "highlights" DROP CONSTRAINT "highlights_contentId_fkey";

-- DropForeignKey
ALTER TABLE "highlights" DROP CONSTRAINT "highlights_userId_fkey";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "paymentChannel" TEXT,
ADD COLUMN     "paymentMethod" JSONB;

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "pendingPlanId" TEXT;

-- AlterTable
ALTER TABLE "user_quotas" ADD COLUMN     "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyWeakAreaAnalysisCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plan" "UserPlan" NOT NULL DEFAULT 'FREE';

-- DropTable
DROP TABLE "highlights";

-- CreateTable
CREATE TABLE "summaries" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "studyMaterialId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_reactions" (
    "id" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summary_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_views" (
    "id" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summary_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "summaries_shortCode_key" ON "summaries"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "summaries_studyMaterialId_key" ON "summaries"("studyMaterialId");

-- CreateIndex
CREATE INDEX "summaries_shortCode_idx" ON "summaries"("shortCode");

-- CreateIndex
CREATE INDEX "summaries_studyMaterialId_idx" ON "summaries"("studyMaterialId");

-- CreateIndex
CREATE INDEX "summaries_isPublic_idx" ON "summaries"("isPublic");

-- CreateIndex
CREATE INDEX "summary_reactions_summaryId_idx" ON "summary_reactions"("summaryId");

-- CreateIndex
CREATE INDEX "summary_reactions_userId_idx" ON "summary_reactions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "summary_reactions_summaryId_userId_type_key" ON "summary_reactions"("summaryId", "userId", "type");

-- CreateIndex
CREATE INDEX "summary_views_summaryId_idx" ON "summary_views"("summaryId");

-- CreateIndex
CREATE INDEX "summary_views_userId_idx" ON "summary_views"("userId");

-- CreateIndex
CREATE INDEX "summary_views_ip_idx" ON "summary_views"("ip");

-- CreateIndex
CREATE INDEX "payments_paymentChannel_idx" ON "payments"("paymentChannel");

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_studyMaterialId_fkey" FOREIGN KEY ("studyMaterialId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary_reactions" ADD CONSTRAINT "summary_reactions_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary_reactions" ADD CONSTRAINT "summary_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary_views" ADD CONSTRAINT "summary_views_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
