ALTER TABLE "Route"
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Route_archivedAt_idx"
ON "Route"("archivedAt");
