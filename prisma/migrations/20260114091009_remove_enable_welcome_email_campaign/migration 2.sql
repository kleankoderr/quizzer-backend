/*
  Warnings:

  - You are about to drop the column `enableWelcomeEmailCampaign` on the `platform_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "platform_settings" DROP COLUMN "enableWelcomeEmailCampaign";
