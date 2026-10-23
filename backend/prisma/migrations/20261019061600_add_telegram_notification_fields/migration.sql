-- Persist which information is included in Telegram patrol issue notifications.
-- Defaults preserve the current full-detail notification for existing channels.
ALTER TABLE "SiteCommunicationChannel"
  ADD COLUMN "includeDate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "includeTime" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "includeSite" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "includePatrolRoute" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "includeComment" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "includeScreenshot" BOOLEAN NOT NULL DEFAULT true;
