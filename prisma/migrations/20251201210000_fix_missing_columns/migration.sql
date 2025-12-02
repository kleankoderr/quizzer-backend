-- AlterTable
ALTER TABLE "attempts" ADD COLUMN "challengeId" TEXT;

-- AlterTable
ALTER TABLE "contents" ADD COLUMN "lastReadPosition" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "attempts_challengeId_idx" ON "attempts"("challengeId");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
