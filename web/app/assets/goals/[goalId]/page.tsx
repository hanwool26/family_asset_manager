import Link from "next/link";
import { notFound } from "next/navigation";
import AssetsSubNav from "@/components/AssetsSubNav";
import BlurGate from "@/components/BlurGate";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import GoalFormDialog from "@/components/GoalFormDialog";
import GoalCostItemsEditor from "@/components/GoalCostItemsEditor";
import GoalFundingSelector from "@/components/GoalFundingSelector";
import GoalPlanChart from "@/components/GoalPlanChart";
import { deleteGoal, deleteLoanScenario } from "../actions";
import { loadGoalsContext, overlappingFunding } from "@/lib/goal-data";
import { GOAL_KIND_LABELS, GOAL_STATUS_LABELS, type GoalKind, type GoalStatus } from "@/lib/goal-plan";
import { buildSchedule, summarize, REPAYMENT_METHOD_LABELS, type RepaymentMethod } from "@/lib/loan";
import { formatDateOnlyISO, formatDateOnlyKorean } from "@/lib/date";
import { formatKrw, formatKrwEok, formatSignedKrw } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "good" }) {
  const color = tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={"mt-1 text-lg font-bold tabular-nums " + color}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400 tabular-nums">{sub}</div>}
    </div>
  );
}

function termLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
}

export default async function GoalDetailPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const { members, memberItems, planned } = await loadGoalsContext();
  const entry = planned.find((p) => p.goal.id === goalId);
  if (!entry) notFound();

  const { goal, funding, plan } = entry;
  const otherActive = planned.filter((p) => p.goal.id !== goal.id && p.goal.status === "ACTIVE");
  const targetMonth = formatDateOnlyISO(goal.targetDate).slice(0, 7);
  const midGap = plan.lowestBalance < 0 && plan.lowestMonth < targetMonth && -plan.lowestBalance > plan.shortfall;

  return (
    <BlurGate>
    <div>
      <div className="mb-1">
        <h1 className="text-xl font-bold text-slate-900">가계자산</h1>
        <p className="text-sm text-slate-500 mt-0.5">아파트·자동차처럼 큰 돈이 드는 가족 목표의 예산을 계획합니다.</p>
      </div>

      <AssetsSubNav members={members.map((m) => ({ id: m.id, name: m.name }))} />

      <div className="mb-6">
        <Link href="/assets/goals" className="text-xs text-slate-400 hover:text-slate-600">
          ← 목표 목록
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {GOAL_KIND_LABELS[goal.kind as GoalKind] ?? goal.kind}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {GOAL_STATUS_LABELS[goal.status as GoalStatus] ?? goal.status}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{goal.name}</h2>
            <p className="text-xs text-slate-500">
              목표일 {formatDateOnlyKorean(goal.targetDate)} · {plan.monthsLeft}개월 남음
            </p>
            {goal.memo && <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap">{goal.memo}</p>}
          </div>
          <div className="flex items-center gap-3">
            <ConfirmDeleteButton
              action={deleteGoal.bind(null, goal.id)}
              label="목표 삭제"
              confirmMessage={`"${goal.name}" 목표를 삭제할까요? 필요 금액 항목과 대출 시나리오가 함께 삭제되며 되돌릴 수 없습니다.`}
            />
            <GoalFormDialog
              initial={{
                id: goal.id,
                name: goal.name,
                kind: goal.kind as GoalKind,
                targetDate: formatDateOnlyISO(goal.targetDate),
                status: goal.status as GoalStatus,
                memo: goal.memo ?? "",
              }}
            />
          </div>
        </div>
      </div>

      {/* 요약 */}
      <section className="mb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="필요 금액" value={formatKrwEok(plan.totalRequired)} sub={formatKrw(plan.totalRequired)} />
          <Stat label="가용 현금" value={formatKrwEok(plan.availableCash)} sub="연결한 스냅샷 항목 합계" />
          <Stat
            label="목표일까지 순저축"
            value={formatKrwEok(plan.futureNet)}
            sub={`월 ${formatSignedKrw(plan.monthlyNet)}`}
          />
          {plan.shortfall > 0 ? (
            <Stat
              label="부족액"
              value={formatKrwEok(plan.shortfall)}
              sub={plan.monthsLeft > 0 ? `매월 ${formatKrw(plan.extraMonthlySaving)} 더 모아야 함` : undefined}
              tone="warn"
            />
          ) : (
            <Stat label="여유액" value={formatKrwEok(plan.surplus)} tone="good" />
          )}
        </div>

        <div className="mt-3 space-y-2">
          {midGap && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {plan.lowestMonth}에 자금이 {formatKrwEok(-plan.lowestBalance)} 부족해집니다. 지출 예정일이 목표일보다 이른 항목(계약금 등)
              때문이며, 목표일 기준 부족액보다 큽니다. 이 시점의 자금 조달 계획도 필요합니다.
            </p>
          )}
          {otherActive.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              진행중인 다른 목표({otherActive.map((p) => p.goal.name).join(", ")})도 같은 가계 수입/지출을 사용합니다. 이 화면의 순저축은
              다른 목표에 쓰일 돈을 빼지 않은 금액입니다.
            </p>
          )}
        </div>
      </section>

      {/* 필요 금액 */}
      <section className="mb-8">
        <div className="mb-3">
          <h3 className="text-base font-bold text-slate-900">필요 금액</h3>
          <p className="text-xs text-slate-400 mt-0.5">잔금, 인테리어, 가전, 가구, 이사 비용 등 필요한 항목을 자유롭게 추가하세요.</p>
        </div>
        <GoalCostItemsEditor
          key={goal.id}
          goalId={goal.id}
          initial={goal.costItems.map((c) => ({
            name: c.name,
            amount: c.amount ? String(c.amount) : "",
            dueDate: c.dueDate ? formatDateOnlyISO(c.dueDate) : "",
            note: c.note ?? "",
          }))}
        />
      </section>

      {/* 가용 현금 */}
      <section className="mb-8">
        <div className="mb-3">
          <h3 className="text-base font-bold text-slate-900">가용 현금</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            이 목표에 쓸 자산 항목을 선택하세요. 금액은 각 구성원의 최신 스냅샷 기준으로 자동 반영됩니다.
          </p>
        </div>
        <GoalFundingSelector
          key={goal.id}
          goalId={goal.id}
          members={memberItems}
          initialSelected={goal.fundingSources.map((s) => ({
            memberId: s.memberId,
            type: s.type,
            category: s.category,
            name: s.name,
          }))}
          missing={funding.filter((f) => f.amount === null)}
          usedByOtherGoals={overlappingFunding(planned, goal.id)}
        />
      </section>

      {/* 월별 흐름 */}
      <section className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 className="text-base font-bold text-slate-900">월별 자금 흐름</h3>
          <Link href="/assets/goals#cashflow" className="text-xs font-medium text-blue-600 hover:underline">
            가계 수입/지출 편집 →
          </Link>
        </div>
        <GoalPlanChart points={plan.points} targetMonth={targetMonth} />
      </section>

      {/* 대출 계획 */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">대출 계획</h3>
            <p className="text-xs text-slate-400 mt-0.5">대출 계산기에서 시나리오를 저장하면 여기서 비교할 수 있습니다.</p>
          </div>
          <Link
            href={`/assets/loan?goalId=${goal.id}${plan.shortfall > 0 ? `&principal=${Math.ceil(plan.shortfall / 1_000_000) * 1_000_000}` : ""}`}
            className="rounded-lg bg-slate-900 text-white text-sm font-semibold px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            {plan.shortfall > 0 ? `부족액 ${formatKrwEok(plan.shortfall)}으로 대출 계산` : "대출 계산기 열기"}
          </Link>
        </div>

        {goal.loanScenarios.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            저장된 대출 시나리오가 없습니다.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-400">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium">시나리오</th>
                    <th className="px-4 py-2.5 font-medium text-right">원금</th>
                    <th className="px-4 py-2.5 font-medium">조건</th>
                    <th className="px-4 py-2.5 font-medium text-right">월 상환액</th>
                    <th className="px-4 py-2.5 font-medium text-right">총 이자</th>
                    <th className="px-4 py-2.5 font-medium text-right">부족액 충당</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {goal.loanScenarios.map((s) => {
                    const method = s.method as RepaymentMethod;
                    const summary = summarize(buildSchedule({ ...s, method }));
                    const covered = s.principal - plan.shortfall;
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                        <td className="px-4 py-3 text-right">{formatKrwEok(s.principal)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {s.annualRatePct}% · {termLabel(s.termMonths)} · {REPAYMENT_METHOD_LABELS[method] ?? s.method}
                          {s.graceMonths > 0 && ` · 거치 ${s.graceMonths}개월`}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-600">
                          {method === "BULLET"
                            ? `이자 ${formatKrw(summary.firstPayment)}`
                            : method === "EQUAL_PRINCIPAL"
                            ? `최대 ${formatKrw(summary.maxPayment)}`
                            : formatKrw(summary.maxPayment)}
                        </td>
                        <td className="px-4 py-3 text-right">{formatKrwEok(summary.totalInterest)}</td>
                        <td className={"px-4 py-3 text-right text-xs " + (covered >= 0 ? "text-emerald-600" : "text-amber-600")}>
                          {covered >= 0 ? "충당" : `${formatKrwEok(-covered)} 모자람`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ConfirmDeleteButton
                            action={deleteLoanScenario.bind(null, s.id)}
                            confirmMessage={`"${s.name}" 시나리오를 삭제할까요?`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {plan.monthlyNet > 0 && goal.loanScenarios.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400">
            참고: 현재 월 순저축은 {formatKrw(plan.monthlyNet)}입니다. 월 상환액이 이보다 크면 대출 후 가계 현금흐름이 마이너스가 됩니다.
          </p>
        )}
      </section>
    </div>
    </BlurGate>
  );
}
