-- CreateTable
CREATE TABLE "FamilyGoal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "memo" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalCostItem" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GoalCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalFundingSource" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "GoalFundingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalLoanScenario" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL,
    "annualRatePct" DOUBLE PRECISION NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "graceMonths" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalLoanScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdCashflow" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdCashflow_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GoalCostItem" ADD CONSTRAINT "GoalCostItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FamilyGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalFundingSource" ADD CONSTRAINT "GoalFundingSource_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FamilyGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalFundingSource" ADD CONSTRAINT "GoalFundingSource_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalLoanScenario" ADD CONSTRAINT "GoalLoanScenario_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FamilyGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
