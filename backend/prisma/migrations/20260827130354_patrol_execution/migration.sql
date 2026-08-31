-- CreateEnum
CREATE TYPE "PatrolJobStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "PatrolJob" (
    "id" TEXT NOT NULL,
    "status" "PatrolJobStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "routeId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PatrolJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "allClear" BOOLEAN NOT NULL DEFAULT false,
    "checklistState" JSONB,
    "screenshotPath" TEXT,
    "comment" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckpointResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatrolJob_routeId_idx" ON "PatrolJob"("routeId");

-- CreateIndex
CREATE INDEX "PatrolJob_operatorId_idx" ON "PatrolJob"("operatorId");

-- CreateIndex
CREATE INDEX "CheckpointResult_jobId_idx" ON "CheckpointResult"("jobId");

-- CreateIndex
CREATE INDEX "CheckpointResult_checkpointId_idx" ON "CheckpointResult"("checkpointId");

-- AddForeignKey
ALTER TABLE "PatrolJob" ADD CONSTRAINT "PatrolJob_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolJob" ADD CONSTRAINT "PatrolJob_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointResult" ADD CONSTRAINT "CheckpointResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PatrolJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointResult" ADD CONSTRAINT "CheckpointResult_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "RouteCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
