-- Store new camera stream URLs as application-encrypted ciphertext.
ALTER TABLE "Camera"
  ADD COLUMN "streamUrlEncrypted" TEXT,
  ADD COLUMN "streamVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "CameraAgent" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "playbackBaseUrl" TEXT,
  "lastHeartbeatAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CameraProvisioningJob" (
  "id" TEXT NOT NULL,
  "cameraId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "agentId" TEXT,
  "action" TEXT NOT NULL,
  "streamPath" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraProvisioningJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CameraAgent_siteId_key" ON "CameraAgent"("siteId");
CREATE UNIQUE INDEX "CameraAgent_tokenHash_key" ON "CameraAgent"("tokenHash");
CREATE INDEX "CameraAgent_lastHeartbeatAt_idx" ON "CameraAgent"("lastHeartbeatAt");
CREATE INDEX "CameraProvisioningJob_siteId_status_createdAt_idx" ON "CameraProvisioningJob"("siteId", "status", "createdAt");
CREATE INDEX "CameraProvisioningJob_cameraId_version_idx" ON "CameraProvisioningJob"("cameraId", "version");

ALTER TABLE "CameraAgent"
  ADD CONSTRAINT "CameraAgent_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CameraProvisioningJob"
  ADD CONSTRAINT "CameraProvisioningJob_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CameraProvisioningJob"
  ADD CONSTRAINT "CameraProvisioningJob_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "CameraAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing streamUrl values are intentionally left in place for compatibility.
-- Run the documented encryption script before treating legacy credentials as migrated.
