/*
  Warnings:

  - You are about to alter the column `contentPreview` on the `analyses` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.

*/
-- DropIndex
DROP INDEX "analyses_userId_idx";

-- AlterTable
ALTER TABLE "analyses" ADD COLUMN     "aiSteps" TEXT,
ADD COLUMN     "approxLat" DOUBLE PRECISION,
ADD COLUMN     "approxLng" DOUBLE PRECISION,
ADD COLUMN     "approxRegion" VARCHAR(100),
ADD COLUMN     "storedReason" VARCHAR(200),
ALTER COLUMN "contentPreview" DROP NOT NULL,
ALTER COLUMN "contentPreview" SET DATA TYPE VARCHAR(120);

-- CreateTable
CREATE TABLE "scam_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "contentHash" VARCHAR(64),
    "scamCategory" TEXT NOT NULL,
    "platformUsed" VARCHAR(100),
    "amountLost" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "language" TEXT NOT NULL DEFAULT 'en',
    "recoverySteps" TEXT NOT NULL,
    "approxLat" DOUBLE PRECISION,
    "approxLng" DOUBLE PRECISION,
    "approxRegion" VARCHAR(100),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scam_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scam_reports_scamCategory_idx" ON "scam_reports"("scamCategory");

-- CreateIndex
CREATE INDEX "scam_reports_createdAt_idx" ON "scam_reports"("createdAt");

-- CreateIndex
CREATE INDEX "scam_reports_approxRegion_idx" ON "scam_reports"("approxRegion");

-- CreateIndex
CREATE INDEX "analyses_riskLevel_idx" ON "analyses"("riskLevel");

-- CreateIndex
CREATE INDEX "analyses_approxRegion_idx" ON "analyses"("approxRegion");

-- AddForeignKey
ALTER TABLE "scam_reports" ADD CONSTRAINT "scam_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
