-- CreateTable
CREATE TABLE "InvestorSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalValueKrw" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InvestorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestorSnapshot_date_key" ON "InvestorSnapshot"("date");
