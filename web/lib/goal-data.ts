import { prisma } from "./db";
import { formatDateOnlyKorean, todayKstISO } from "./date";
import { computeGoalPlan, fundingKey, resolveFunding, sumFunding, type MemberLatestItems } from "./goal-plan";

/** 목표 목록/상세 화면이 공통으로 쓰는 데이터: 구성원별 최신 스냅샷 항목, 가계 공통 수입/지출, 모든 목표. */
export async function loadGoalsContext() {
  const [members, cashflows, goals] = await Promise.all([
    prisma.familyMember.findMany({
      orderBy: { order: "asc" },
      include: { snapshots: { orderBy: { date: "desc" }, take: 1, include: { items: { orderBy: { order: "asc" } } } } },
    }),
    prisma.householdCashflow.findMany({ orderBy: { order: "asc" } }),
    prisma.familyGoal.findMany({
      orderBy: [{ targetDate: "asc" }, { order: "asc" }],
      include: {
        costItems: { orderBy: { order: "asc" } },
        fundingSources: true,
        loanScenarios: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  const memberItems: (MemberLatestItems & { latestDateLabel: string | null })[] = members.map((m) => ({
    memberId: m.id,
    memberName: m.name,
    latestDateLabel: m.snapshots[0] ? formatDateOnlyKorean(m.snapshots[0].date) : null,
    items: m.snapshots[0]?.items ?? [],
  }));

  const todayISO = todayKstISO();
  const planned = goals.map((goal) => {
    const funding = resolveFunding(goal.fundingSources, memberItems);
    const plan = computeGoalPlan({
      todayISO,
      targetDate: goal.targetDate,
      availableCash: sumFunding(funding),
      costItems: goal.costItems,
      cashflows,
    });
    return { goal, funding, plan };
  });

  return { members, memberItems, cashflows, planned, todayISO };
}

/** 진행중인 다른 목표들과 겹치는 가용 현금 항목: key -> 목표 이름들. */
export function overlappingFunding(
  planned: Awaited<ReturnType<typeof loadGoalsContext>>["planned"],
  goalId: string
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const { goal } of planned) {
    if (goal.id === goalId || goal.status !== "ACTIVE") continue;
    for (const s of goal.fundingSources) {
      const key = fundingKey(s);
      (result[key] ??= []).push(goal.name);
    }
  }
  return result;
}
