import Link from "next/link";
import AssetsSubNav from "@/components/AssetsSubNav";
import BlurGate from "@/components/BlurGate";
import GoalFormDialog from "@/components/GoalFormDialog";
import HouseholdCashflowEditor from "@/components/HouseholdCashflowEditor";
import { loadGoalsContext } from "@/lib/goal-data";
import { fundingKey, GOAL_KIND_LABELS, GOAL_STATUS_LABELS, type GoalKind, type GoalStatus } from "@/lib/goal-plan";
import { formatDateOnlyISO, formatDateOnlyKorean } from "@/lib/date";
import { formatKrwEok } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const { members, cashflows, planned, todayISO } = await loadGoalsContext();

  const active = planned.filter((p) => p.goal.status === "ACTIVE");
  // 여러 진행중 목표가 같은 스냅샷 항목을 가용 현금으로 잡고 있는지
  const keyCount = new Map<string, { label: string; count: number }>();
  for (const { funding } of active) {
    for (const f of funding) {
      const key = fundingKey(f);
      const prev = keyCount.get(key);
      keyCount.set(key, { label: `${f.memberName} ${f.name}`, count: (prev?.count ?? 0) + 1 });
    }
  }
  const sharedFunding = Array.from(keyCount.values()).filter((v) => v.count > 1);

  return (
    <BlurGate>
    <div>
      <div className="mb-1">
        <h1 className="text-xl font-bold text-slate-900">가계자산</h1>
        <p className="text-sm text-slate-500 mt-0.5">아파트·자동차처럼 큰 돈이 드는 가족 목표의 예산을 계획합니다.</p>
      </div>

      <AssetsSubNav members={members.map((m) => ({ id: m.id, name: m.name }))} />

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900">가족 목표</h2>
          <GoalFormDialog />
        </div>

        {active.length > 1 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-semibold">진행중 목표 {active.length}개가 같은 가계 수입/지출을 각각 전부 사용하는 것으로 계산됩니다.</p>
            <p className="mt-0.5">
              모든 진행중 목표의 필요 금액 합계는{" "}
              <b>{formatKrwEok(active.reduce((s, p) => s + p.plan.totalRequired, 0))}</b>입니다. 목표별 부족액을 단순 합산하지 말고
              전체 자금으로 함께 감당할 수 있는지 확인하세요.
            </p>
            {sharedFunding.length > 0 && (
              <p className="mt-0.5">
                여러 목표에 중복 연결된 가용 현금: {sharedFunding.map((s) => `${s.label}(${s.count}개 목표)`).join(", ")}
              </p>
            )}
          </div>
        )}

        {planned.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            아직 등록된 목표가 없습니다. &ldquo;+ 목표 추가&rdquo;로 아파트 매수, 자동차 구매 같은 목표를 만들어보세요.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {planned.map(({ goal, plan }) => {
              const progress = plan.totalRequired > 0 ? Math.min(100, (plan.projectedFunds / plan.totalRequired) * 100) : 0;
              const short = plan.shortfall > 0;
              const past = formatDateOnlyISO(goal.targetDate) < todayISO;
              return (
                <Link
                  key={goal.id}
                  href={`/assets/goals/${goal.id}`}
                  className={
                    "block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:shadow transition " +
                    (goal.status !== "ACTIVE" ? "opacity-60" : "")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {GOAL_KIND_LABELS[goal.kind as GoalKind] ?? goal.kind}
                        </span>
                        {goal.status !== "ACTIVE" && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            {GOAL_STATUS_LABELS[goal.status as GoalStatus] ?? goal.status}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 text-sm font-bold text-slate-900">{goal.name}</h3>
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      <div>{formatDateOnlyKorean(goal.targetDate)}</div>
                      <div>{past ? "목표일 지남" : `${plan.monthsLeft}개월 남음`}</div>
                    </div>
                  </div>

                  <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                    <div
                      className={"h-2 rounded-full " + (short ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-slate-400 tabular-nums">
                    <span>확보 예상 {formatKrwEok(plan.projectedFunds)}</span>
                    <span>필요 {formatKrwEok(plan.totalRequired)}</span>
                  </div>

                  <div className="mt-2 text-sm font-semibold tabular-nums">
                    {plan.totalRequired === 0 ? (
                      <span className="text-slate-400">필요 금액 항목을 입력하세요</span>
                    ) : short ? (
                      <span className="text-amber-600">부족 {formatKrwEok(plan.shortfall)}</span>
                    ) : (
                      <span className="text-emerald-600">여유 {formatKrwEok(plan.surplus)}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section id="cashflow" className="scroll-mt-24">
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-900">가계 공통 수입/지출</h2>
          <p className="text-xs text-slate-400 mt-0.5">모든 목표가 함께 쓰는 앞으로의 수입과 지출입니다.</p>
        </div>
        <HouseholdCashflowEditor
          key={cashflows.map((c) => c.id).join(",")}
          currentMonth={todayISO.slice(0, 7)}
          initial={cashflows.map((c) => ({
            label: c.label,
            direction: c.direction as "INCOME" | "EXPENSE",
            frequency: c.frequency as "MONTHLY" | "ONCE",
            amount: String(c.amount),
            startDate: c.startDate
              ? c.frequency === "MONTHLY"
                ? formatDateOnlyISO(c.startDate).slice(0, 7)
                : formatDateOnlyISO(c.startDate)
              : "",
            endDate: c.endDate ? formatDateOnlyISO(c.endDate).slice(0, 7) : "",
            note: c.note ?? "",
          }))}
        />
      </section>
    </div>
    </BlurGate>
  );
}
