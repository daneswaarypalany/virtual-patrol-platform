-- CreateEnum
CREATE TYPE "CommunicationChannelType" AS ENUM ('WHATSAPP', 'TELEGRAM', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CONFIGURATION_REQUIRED');

-- CreateTable
CREATE TABLE "SiteCommunicationChannel" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "channelType" "CommunicationChannelType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "destination" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCommunicationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channelType" "CommunicationChannelType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteCommunicationChannel_siteId_idx" ON "SiteCommunicationChannel"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteCommunicationChannel_siteId_channelType_key" ON "SiteCommunicationChannel"("siteId", "channelType");

-- CreateIndex
CREATE INDEX "NotificationLog_siteId_idx" ON "NotificationLog"("siteId");

-- CreateIndex
CREATE INDEX "NotificationLog_eventType_idx" ON "NotificationLog"("eventType");

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");

-- AddForeignKey
ALTER TABLE "SiteCommunicationChannel" ADD CONSTRAINT "SiteCommunicationChannel_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
