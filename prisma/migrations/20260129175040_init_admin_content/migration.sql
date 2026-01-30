-- CreateEnum
CREATE TYPE "ContentScope" AS ENUM ('GLOBAL', 'SCHOOL');

-- CreateTable
CREATE TABLE "admin_quizzes" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "scope" "ContentScope" NOT NULL,
    "schoolId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_flashcard_sets" (
    "id" TEXT NOT NULL,
    "flashcardSetId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "scope" "ContentScope" NOT NULL,
    "schoolId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_flashcard_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_contents" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "scope" "ContentScope" NOT NULL,
    "schoolId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_study_packs" (
    "id" TEXT NOT NULL,
    "studyPackId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "scope" "ContentScope" NOT NULL,
    "schoolId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_study_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_study_pack_items" (
    "id" TEXT NOT NULL,
    "adminStudyPackId" TEXT NOT NULL,
    "adminQuizId" TEXT,
    "adminFlashcardSetId" TEXT,
    "adminContentId" TEXT,
    "order" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_study_pack_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_quizzes_quizId_key" ON "admin_quizzes"("quizId");

-- CreateIndex
CREATE INDEX "admin_quizzes_createdBy_idx" ON "admin_quizzes"("createdBy");

-- CreateIndex
CREATE INDEX "admin_quizzes_scope_schoolId_idx" ON "admin_quizzes"("scope", "schoolId");

-- CreateIndex
CREATE INDEX "admin_quizzes_isActive_idx" ON "admin_quizzes"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "admin_flashcard_sets_flashcardSetId_key" ON "admin_flashcard_sets"("flashcardSetId");

-- CreateIndex
CREATE INDEX "admin_flashcard_sets_createdBy_idx" ON "admin_flashcard_sets"("createdBy");

-- CreateIndex
CREATE INDEX "admin_flashcard_sets_scope_schoolId_idx" ON "admin_flashcard_sets"("scope", "schoolId");

-- CreateIndex
CREATE INDEX "admin_flashcard_sets_isActive_idx" ON "admin_flashcard_sets"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "admin_contents_contentId_key" ON "admin_contents"("contentId");

-- CreateIndex
CREATE INDEX "admin_contents_createdBy_idx" ON "admin_contents"("createdBy");

-- CreateIndex
CREATE INDEX "admin_contents_scope_schoolId_idx" ON "admin_contents"("scope", "schoolId");

-- CreateIndex
CREATE INDEX "admin_contents_isActive_idx" ON "admin_contents"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "admin_study_packs_studyPackId_key" ON "admin_study_packs"("studyPackId");

-- CreateIndex
CREATE INDEX "admin_study_packs_createdBy_idx" ON "admin_study_packs"("createdBy");

-- CreateIndex
CREATE INDEX "admin_study_packs_scope_schoolId_idx" ON "admin_study_packs"("scope", "schoolId");

-- CreateIndex
CREATE INDEX "admin_study_packs_isActive_idx" ON "admin_study_packs"("isActive");

-- CreateIndex
CREATE INDEX "admin_study_pack_items_adminStudyPackId_idx" ON "admin_study_pack_items"("adminStudyPackId");

-- CreateIndex
CREATE INDEX "admin_study_pack_items_adminQuizId_idx" ON "admin_study_pack_items"("adminQuizId");

-- CreateIndex
CREATE INDEX "admin_study_pack_items_adminFlashcardSetId_idx" ON "admin_study_pack_items"("adminFlashcardSetId");

-- CreateIndex
CREATE INDEX "admin_study_pack_items_adminContentId_idx" ON "admin_study_pack_items"("adminContentId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_study_pack_items_adminStudyPackId_order_key" ON "admin_study_pack_items"("adminStudyPackId", "order");

-- AddForeignKey
ALTER TABLE "admin_quizzes" ADD CONSTRAINT "admin_quizzes_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_quizzes" ADD CONSTRAINT "admin_quizzes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_quizzes" ADD CONSTRAINT "admin_quizzes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_flashcard_sets" ADD CONSTRAINT "admin_flashcard_sets_flashcardSetId_fkey" FOREIGN KEY ("flashcardSetId") REFERENCES "flashcard_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_flashcard_sets" ADD CONSTRAINT "admin_flashcard_sets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_flashcard_sets" ADD CONSTRAINT "admin_flashcard_sets_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_contents" ADD CONSTRAINT "admin_contents_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_contents" ADD CONSTRAINT "admin_contents_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_contents" ADD CONSTRAINT "admin_contents_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_study_packs" ADD CONSTRAINT "admin_study_packs_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "study_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_study_packs" ADD CONSTRAINT "admin_study_packs_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_study_packs" ADD CONSTRAINT "admin_study_packs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_study_pack_items" ADD CONSTRAINT "admin_study_pack_items_adminStudyPackId_fkey" FOREIGN KEY ("adminStudyPackId") REFERENCES "admin_study_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_study_pack_items" ADD CONSTRAINT "admin_study_pack_items_adminQuizId_fkey" FOREIGN KEY ("adminQuizId") REFERENCES "admin_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_study_pack_items" ADD CONSTRAINT "admin_study_pack_items_adminFlashcardSetId_fkey" FOREIGN KEY ("adminFlashcardSetId") REFERENCES "admin_flashcard_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_study_pack_items" ADD CONSTRAINT "admin_study_pack_items_adminContentId_fkey" FOREIGN KEY ("adminContentId") REFERENCES "admin_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
