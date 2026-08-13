-- AlterTable
ALTER TABLE "customer_accounts" ADD COLUMN     "acceptedTermsAt" TIMESTAMP(3),
ADD COLUMN     "anonymizedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "anonymizedAt" TIMESTAMP(3);

