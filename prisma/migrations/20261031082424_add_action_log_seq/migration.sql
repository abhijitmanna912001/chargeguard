-- DropIndex
DROP INDEX "ActionLog_disputeId_timestamp_idx";

-- AlterTable
ALTER TABLE "ActionLog" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "ActionLog_disputeId_timestamp_seq_idx" ON "ActionLog"("disputeId", "timestamp", "seq");
