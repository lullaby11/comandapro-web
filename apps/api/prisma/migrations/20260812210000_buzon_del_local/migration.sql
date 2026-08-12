-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "email_outbox" ADD COLUMN     "replyTo" TEXT;

