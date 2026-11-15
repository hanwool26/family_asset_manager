"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/date";
import { COST_ITEM_TEMPLATES, type GoalKind, type GoalStatus } from "@/lib/goal-plan";
import type { RepaymentMethod } from "@/lib/loan";

function requireDate(value: string, label: string): Date {
  const date = parseDateOnly(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label}을(를) 확인해주세요.`);
  return date;
}

function optionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = parseDateOnly(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidateGoals(goalId?: string) {
  revalidatePath("/assets/goals");
  if (goalId) revalidatePath(`/assets/goals/${goalId}`);
}

export interface GoalInfoInput {
  name: string;
  kind: GoalKind;
  targetDate: string; // "YYYY-MM-DD"
  status?: GoalStatus;
  memo?: string;
}

export async function createGoal(input: GoalInfoInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("목표 이름을 입력해주세요.");
  const targetDate = requireDate(input.targetDate, "목표일");

  const count = await prisma.familyGoal.count();
  const goal = await prisma.familyGoal.create({
    data: {
      name,
      kind: input.kind,
      targetDate,
      memo: input.memo?.trim() || null,
      order: count,
      costItems: {
        create: COST_ITEM_TEMPLATES[input.kind].map((itemName, i) => ({ name: itemName, amount: 0, order: i })),
      },
    },
  });

  revalidateGoals();
  return goal.id;
}

export async function updateGoal(goalId: string, input: GoalInfoInput) {
  const name = input.name.trim();
  if (!name) throw new Error("목표 이름을 입력해주세요.");
  await prisma.familyGoal.update({
    where: { id: goalId },
    data: {
      name,
      kind: input.kind,
      targetDate: requireDate(input.targetDate, "목표일"),
      status: input.status ?? "ACTIVE",
      memo: input.memo?.trim() || null,
    },
  });
  revalidateGoals(goalId);
}

export async function deleteGoal(goalId: string) {
  await prisma.familyGoal.delete({ where: { id: goalId } });
  revalidateGoals();
  redirect("/assets/goals");
}

export interface CostItemInput {
  name: string;
  amount: number;
  dueDate: string | null; // "YYYY-MM-DD"
  note?: string;
}

export async function saveCostItems(goalId: string, items: CostItemInput[]) {
  for (const item of items) {
    if (!item.name.trim() || !Number.isFinite(item.amount)) throw new Error("항목 이름과 금액을 확인해주세요.");
  }
  await prisma.$transaction([
    prisma.goalCostItem.deleteMany({ where: { goalId } }),
    prisma.goalCostItem.createMany({
      data: items.map((item, i) => ({
        goalId,
        name: item.name.trim(),
        amount: item.amount,
        dueDate: optionalDate(item.dueDate),
        note: item.note?.trim() || null,
        order: i,
      })),
    }),
  ]);
  revalidateGoals(goalId);
}

export interface FundingSourceInput {
  memberId: string;
  type: string;
  category: string;
  name: string;
}

export async function saveFundingSources(goalId: string, sources: FundingSourceInput[]) {
  await prisma.$transaction([
    prisma.goalFundingSource.deleteMany({ where: { goalId } }),
    prisma.goalFundingSource.createMany({ data: sources.map((s) => ({ goalId, ...s })) }),
  ]);
  revalidateGoals(goalId);
}

export interface CashflowInput {
  label: string;
  direction: "INCOME" | "EXPENSE";
  frequency: "MONTHLY" | "ONCE";
  amount: number;
  startDate: string | null; // "YYYY-MM-DD"
  endDate: string | null;
  note?: string;
}

export async function saveCashflows(rows: CashflowInput[]) {
  for (const row of rows) {
    if (!row.label.trim() || !Number.isFinite(row.amount)) throw new Error("수입/지출 항목의 이름과 금액을 확인해주세요.");
    if (row.frequency === "ONCE" && !optionalDate(row.startDate)) {
      throw new Error(`"${row.label}"의 날짜를 입력해주세요. 일회성 항목은 날짜가 필요합니다.`);
    }
  }
  await prisma.$transaction([
    prisma.householdCashflow.deleteMany({}),
    prisma.householdCashflow.createMany({
      data: rows.map((row, i) => ({
        label: row.label.trim(),
        direction: row.direction,
        frequency: row.frequency,
        amount: row.amount,
        startDate: optionalDate(row.startDate),
        endDate: row.frequency === "MONTHLY" ? optionalDate(row.endDate) : null,
        note: row.note?.trim() || null,
        order: i,
      })),
    }),
  ]);
  // 모든 목표 계산에 쓰이므로 목표 상세 페이지 전체를 무효화한다
  revalidatePath("/assets/goals", "layout");
}

export interface LoanScenarioInput {
  name: string;
  principal: number;
  annualRatePct: number;
  termMonths: number;
  method: RepaymentMethod;
  graceMonths: number;
}

export async function saveLoanScenario(goalId: string, input: LoanScenarioInput) {
  const name = input.name.trim();
  if (!name) throw new Error("시나리오 이름을 입력해주세요.");
  if (!(input.principal > 0) || !(input.termMonths > 0)) throw new Error("대출 원금과 기간을 확인해주세요.");
  await prisma.goalLoanScenario.create({ data: { goalId, ...input, name } });
  revalidateGoals(goalId);
}

export async function deleteLoanScenario(scenarioId: string) {
  const scenario = await prisma.goalLoanScenario.delete({ where: { id: scenarioId } });
  revalidateGoals(scenario.goalId);
}
