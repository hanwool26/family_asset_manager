import { formatDateOnlyISO } from "./date";

export type GoalKind = "APARTMENT" | "CAR" | "OTHER";
export type GoalStatus = "ACTIVE" | "ACHIEVED" | "PAUSED";
export type CashflowDirection = "INCOME" | "EXPENSE";
export type CashflowFrequency = "MONTHLY" | "ONCE";

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  APARTMENT: "아파트",
  CAR: "자동차",
  OTHER: "기타",
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  ACTIVE: "진행중",
  ACHIEVED: "달성",
  PAUSED: "보류",
};

/** 목표 생성 시 미리 채워주는 필요금액 항목. 금액은 0으로 만들고 사용자가 채우거나 지운다. */
export const COST_ITEM_TEMPLATES: Record<GoalKind, string[]> = {
  APARTMENT: ["계약금", "중도금", "잔금", "취득세", "중개수수료", "인테리어", "가전", "가구", "이사 비용"],
  CAR: ["차량가", "취등록세", "보험료", "용품"],
  OTHER: [],
};

export interface CostItemLike {
  name: string;
  amount: number;
  dueDate: Date | null;
}

export interface CashflowLike {
  label: string;
  direction: string;
  frequency: string;
  amount: number;
  startDate: Date | null;
  endDate: Date | null;
}

// --- 월 단위 계산 헬퍼: 2026-11 -> 2026*12+10 같은 정수 인덱스로 다룬다 ---

function monthIndexOfISO(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return y * 12 + (m - 1);
}

function monthIndex(date: Date): number {
  return monthIndexOfISO(formatDateOnlyISO(date));
}

function monthLabel(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export interface PlanPoint {
  month: string; // "YYYY-MM"
  inflow: number; // 수입 (매월 + 일회성)
  outflow: number; // 지출 (매월 + 일회성)
  cost: number; // 이 달에 나가는 목표 비용 항목
  balance: number; // 이 달 말 기준 목표 자금 잔액 (가용 현금 + 누적 순수입 - 누적 목표 비용)
}

export interface GoalPlan {
  totalRequired: number;
  availableCash: number;
  /** 지금부터 목표일까지 가계 수입 - 지출 누적. */
  futureNet: number;
  /** 가용 현금 + futureNet. 목표일에 확보될 것으로 예상되는 자금. */
  projectedFunds: number;
  /** 목표일 기준 부족액 (0이면 충분). */
  shortfall: number;
  /** 목표일 기준 여유액 (부족하면 0). */
  surplus: number;
  monthsLeft: number;
  /** 부족액을 남은 기간 동안 메우려면 매월 추가로 모아야 하는 금액. */
  extraMonthlySaving: number;
  /** 다음 달 기준 매월 반복되는 순수입 (수입 - 지출). */
  monthlyNet: number;
  /** 지출 예정일이 목표일보다 이른 항목(계약금 등) 때문에 중간에 자금이 바닥나는 경우의 최저 잔액과 시점. */
  lowestBalance: number;
  lowestMonth: string;
  points: PlanPoint[];
}

/**
 * 목표일까지 월별 자금 흐름을 시뮬레이션한다.
 * - 이번 달(오늘이 속한 달)의 매월 수입/지출은 이미 스냅샷 잔액에 반영된 것으로 보고, 다음 달부터 더한다.
 * - 일회성 수입/지출은 오늘 이후 ~ 계획 마지막 달 안에 있으면 그 달에 반영한다.
 * - 비용 항목은 지출 예정일이 있으면 그 달(이미 지났으면 이번 달), 없으면 목표일 달에 나간다.
 */
export function computeGoalPlan(params: {
  todayISO: string;
  targetDate: Date;
  availableCash: number;
  costItems: CostItemLike[];
  cashflows: CashflowLike[];
}): GoalPlan {
  const { todayISO, targetDate, availableCash, costItems, cashflows } = params;
  const current = monthIndexOfISO(todayISO);
  const target = Math.max(current, monthIndex(targetDate));

  const costMonth = (c: CostItemLike) => Math.max(current, c.dueDate ? monthIndex(c.dueDate) : target);
  const last = Math.max(target, ...costItems.map(costMonth));

  const points: PlanPoint[] = [];
  let balance = availableCash;
  for (let m = current; m <= last; m++) {
    let inflow = 0;
    let outflow = 0;
    for (const f of cashflows) {
      let applies: boolean;
      if (f.frequency === "ONCE") {
        applies = !!f.startDate && monthIndex(f.startDate) === m && formatDateOnlyISO(f.startDate) > todayISO;
      } else {
        applies =
          m > current &&
          (!f.startDate || m >= monthIndex(f.startDate)) &&
          (!f.endDate || m <= monthIndex(f.endDate));
      }
      if (!applies) continue;
      if (f.direction === "INCOME") inflow += f.amount;
      else outflow += f.amount;
    }
    const cost = costItems.filter((c) => costMonth(c) === m).reduce((s, c) => s + c.amount, 0);
    balance += inflow - outflow - cost;
    points.push({ month: monthLabel(m), inflow, outflow, cost, balance });
  }

  const totalRequired = costItems.reduce((s, c) => s + c.amount, 0);
  const atTarget = points[target - current];
  const costsByTarget = costItems.filter((c) => costMonth(c) <= target).reduce((s, c) => s + c.amount, 0);
  const projectedFunds = atTarget.balance + costsByTarget;
  const futureNet = projectedFunds - availableCash;
  // 목표일 이후로 예정된 비용 항목까지 포함해 판단한다
  const finalGap = projectedFunds - totalRequired;
  const monthsLeft = target - current;
  const shortfall = Math.max(0, -finalGap);

  const lowest = points.reduce((lo, p) => (p.balance < lo.balance ? p : lo), points[0]);
  const next = points[1];

  return {
    totalRequired,
    availableCash,
    futureNet,
    projectedFunds,
    shortfall,
    surplus: Math.max(0, finalGap),
    monthsLeft,
    extraMonthlySaving: monthsLeft > 0 ? shortfall / monthsLeft : shortfall,
    monthlyNet: next ? next.inflow - next.outflow : 0,
    lowestBalance: lowest.balance,
    lowestMonth: lowest.month,
    points,
  };
}

// --- 가용 현금: 목표에 연결한 스냅샷 항목을 각 구성원의 최신 스냅샷에서 찾아 합산 ---

export interface FundingSourceRef {
  memberId: string;
  type: string;
  category: string;
  name: string;
}

export interface MemberLatestItems {
  memberId: string;
  memberName: string;
  items: { type: string; category: string; name: string; amount: number }[];
}

export interface ResolvedFunding extends FundingSourceRef {
  memberName: string;
  /** 최신 스냅샷에서 항목을 못 찾으면 null (항목명을 바꿨거나 삭제한 경우). */
  amount: number | null;
}

export function fundingKey(s: FundingSourceRef): string {
  return `${s.memberId}::${s.type}::${s.category}::${s.name}`;
}

export function resolveFunding(sources: FundingSourceRef[], members: MemberLatestItems[]): ResolvedFunding[] {
  return sources.map((s) => {
    const member = members.find((m) => m.memberId === s.memberId);
    // 같은 분류/이름 항목이 여러 개면 합산한다 (스냅샷 폼은 중복 이름을 막지 않는다)
    const matches = member?.items.filter((i) => i.type === s.type && i.category === s.category && i.name === s.name) ?? [];
    return {
      ...s,
      memberName: member?.memberName ?? "(삭제된 구성원)",
      amount: matches.length > 0 ? matches.reduce((sum, i) => sum + i.amount, 0) : null,
    };
  });
}

export function sumFunding(resolved: ResolvedFunding[]): number {
  return resolved.reduce((s, r) => s + (r.amount ?? 0) * (r.type === "LIABILITY" ? -1 : 1), 0);
}
