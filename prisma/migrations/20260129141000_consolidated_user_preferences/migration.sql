-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingAssessmentCompleted" BOOLEAN NOT NULL DEFAULT false,
    "assessmentPopupShown" BOOLEAN NOT NULL DEFAULT false,
    "fcmTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: Move data from users to user_preferences
-- We use gen_random_uuid() for IDs. 
-- Note: pgcrypto extension might be needed for gen_random_uuid() in some PG versions, 
-- but most modern versions have it or provide a similar way. 
-- Alternatively, we can use userId as ID temporarily or just use a subquery for UUID if available.
INSERT INTO "user_preferences" (
    "id", 
    "userId", 
    "onboardingCompleted", 
    "onboardingAssessmentCompleted", 
    "assessmentPopupShown", 
    "fcmTokens", 
    "settings", 
    "updatedAt"
)
SELECT 
    "id", 
    "id", 
    "onboardingCompleted", 
    "onboardingAssessmentCompleted", 
    "assessmentPopupShown", 
    "fcmTokens", 
    "preferences", 
    NOW()
FROM "users";

-- AlterTable: Drop old columns from users
ALTER TABLE "users" DROP COLUMN "assessmentPopupShown",
DROP COLUMN "fcmTokens",
DROP COLUMN "onboardingAssessmentCompleted",
DROP COLUMN "onboardingCompleted",
DROP COLUMN "preferences";
