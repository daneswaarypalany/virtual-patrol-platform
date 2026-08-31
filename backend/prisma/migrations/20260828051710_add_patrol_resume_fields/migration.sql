/*
  Warnings:

  - A unique constraint covering the columns `[jobId,checkpointId]` on the table `CheckpointResult` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `lastUpdatedAt` to the `CheckpointResult` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "PatrolJobStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "CheckpointResult" ADD COLUMN "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- AlterTable
ALTER TABLE "PatrolJob" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastCheckpointId" TEXT;

-- CreateTable
CREATE TABLE "ActivePatrol" (
    "siteId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivePatrol_pkey" PRIMARY KEY ("siteId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivePatrol_jobId_key" ON "ActivePatrol"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckpointResult_jobId_checkpointId_key" ON "CheckpointResult"("jobId", "checkpointId");

-- CreateIndex
CREATE INDEX "PatrolJob_status_idx" ON "PatrolJob"("status");

-- AddForeignKey
ALTER TABLE "ActivePatrol" ADD CONSTRAINT "ActivePatrol_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivePatrol" ADD CONSTRAINT "ActivePatrol_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PatrolJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
