-- CreateTable
CREATE TABLE "InvestorHolding" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorTransaction" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "proposalItemId" TEXT,
    "tossOrderId" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestorTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorProposal" (
    "id" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "marketContext" TEXT NOT NULL,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "InvestorProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorProposalItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetWeightPct" DOUBLE PRECISION NOT NULL,
    "currentWeightPct" DOUBLE PRECISION NOT NULL,
    "convictionScore" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orderStatus" TEXT NOT NULL DEFAULT 'NOT_EXECUTED',

    CONSTRAINT "InvestorProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestorHolding_ticker_key" ON "InvestorHolding"("ticker");

-- AddForeignKey
ALTER TABLE "InvestorTransaction" ADD CONSTRAINT "InvestorTransaction_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "InvestorHolding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorProposalItem" ADD CONSTRAINT "InvestorProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "InvestorProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
