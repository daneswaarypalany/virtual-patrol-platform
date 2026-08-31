/*
  Warnings:

  - You are about to drop the column `description` on the `Site` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `Site` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `Site` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Site" DROP COLUMN "description",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur';

-- CreateTable
CREATE TABLE "OperatorSiteAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorSiteAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorSiteAssignment_userId_idx" ON "OperatorSiteAssignment"("userId");

-- CreateIndex
CREATE INDEX "OperatorSiteAssignment_siteId_idx" ON "OperatorSiteAssignment"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorSiteAssignment_userId_siteId_key" ON "OperatorSiteAssignment"("userId", "siteId");

-- AddForeignKey
ALTER TABLE "OperatorSiteAssignment" ADD CONSTRAINT "OperatorSiteAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSiteAssignment" ADD CONSTRAINT "OperatorSiteAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
