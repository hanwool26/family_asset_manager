-- AlterTable
ALTER TABLE "InvestorHolding" ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'KR';

-- AlterTable
ALTER TABLE "InvestorProposal" ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'KR';

-- CreateTable
CREATE TABLE "InvestorFxConversion" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "krwAmount" DOUBLE PRECISION NOT NULL,
    "usdAmount" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "proposalId" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestorFxConversion_pkey" PRIMARY KEY ("id")
);
