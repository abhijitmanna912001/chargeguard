/*
  Warnings:

  - Added the required column `recommendationId` to the `ApprovalRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "recommendationId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ApprovalRequest_recommendationId_idx" ON "ApprovalRequest"("recommendationId");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
