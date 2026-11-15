"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveLoanScenario } from "@/app/assets/goals/actions";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import AmountInput from "./AmountInput";
import {
  aggregateByYear,
  buildSchedule,
  summarize,
  REPAYMENT_METHOD_LABELS,
  type LoanInput,
  type RepaymentMethod,
} from "@/lib/loan";
import {
  computeDsr,
  effectiveStressRatePct,
  DSR_LIMITS,
  RATE_TYPE_PRESETS,
  STRESS_PRESETS,
  type DsrResult,
  type LenderTier,
  type LoanPurpose,
  type RateType,
  type StressPreset,
} from "@/lib/dsr";
import { formatKrw, formatKrwEok } from "@/lib/format";

const inputCls = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm";
const amountCls = inputCls + " text-right tabular-nums";

function num(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            "rounded px-2.5 py-1 text-xs font-medium transition-colors " +
            (value === o.value ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={"mt-1 text-lg font-bold tabular-nums " + (accent ? "text-blue-600" : "text-slate-900")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400 tabular-nums">{sub}</div>}
    </div>
  );
}

interface ExistingDebtRow {
  name: string;
  annual: string;
}

export default function LoanCalculator({
  initialPrincipal,
  goal,
}: {
  initialPrincipal?: number;
  /** 목표 상세에서 넘어온 경우, 현재 조건을 그 목표의 대출 시나리오로 저장할 수 있다. */
  goal?: { id: string; name: string };
}) {
  // --- 대출 조건 ---
  const [principal, setPrincipal] = useState(initialPrincipal ? String(Math.round(initialPrincipal)) : "300000000");
  const [rate, setRate] = useState("4.0");
  const [termValue, setTermValue] = useState("30");
  const [termUnit, setTermUnit] = useState<"YEAR" | "MONTH">("YEAR");
  const [method, setMethod] = useState<RepaymentMethod>("EQUAL_PAYMENT");
  const [grace, setGrace] = useState("0");
  const [scheduleView, setScheduleView] = useState<"YEAR" | "MONTH">("YEAR");

  // --- DSR ---
  const [income, setIncome] = useState("");
  const [tier, setTier] = useState<LenderTier>("BANK");
  const [purpose, setPurpose] = useState<LoanPurpose>("MORTGAGE");
  const [preset, setPreset] = useState<StressPreset>("METRO_MORTGAGE");
  const [rateType, setRateType] = useState<RateType>("VARIABLE");
  const [stressRate, setStressRate] = useState(String(STRESS_PRESETS.METRO_MORTGAGE.stressRatePct));
  const [baseRatio, setBaseRatio] = useState(String(STRESS_PRESETS.METRO_MORTGAGE.baseRatioPct));
  const [rateTypeRatio, setRateTypeRatio] = useState(String(RATE_TYPE_PRESETS.VARIABLE.ratioPct));
  const [existing, setExisting] = useState<ExistingDebtRow[]>([]);

  const termMonths = termUnit === "YEAR" ? Math.round(num(termValue) * 12) : Math.round(num(termValue));
  const loanInput = {
    principal: num(principal),
    annualRatePct: num(rate),
    termMonths,
    method,
    graceMonths: method === "BULLET" ? 0 : num(grace),
  };

  const schedule = buildSchedule(loanInput);
  const summary = summarize(schedule);
  const yearly = aggregateByYear(schedule);

  function applyPreset(p: StressPreset) {
    setPreset(p);
    setStressRate(String(STRESS_PRESETS[p].stressRatePct));
    setBaseRatio(String(STRESS_PRESETS[p].baseRatioPct));
  }
  function applyPurpose(p: LoanPurpose) {
    setPurpose(p);
    applyPreset(p === "CREDIT" ? "CREDIT" : "METRO_MORTGAGE");
  }
  function applyRateType(t: RateType) {
    setRateType(t);
    setRateTypeRatio(String(RATE_TYPE_PRESETS[t].ratioPct));
  }

  const stress = { stressRatePct: num(stressRate), baseRatioPct: num(baseRatio), rateTypeRatioPct: num(rateTypeRatio) };
  const existingAnnual = existing.reduce((s, e) => s + num(e.annual), 0);
  const annualIncome = num(income);
  const limitPct = DSR_LIMITS[tier].limitPct;
  const dsrLoan = { ...loanInput, purpose };
  const plainDsr = computeDsr({
    loan: dsrLoan,
    stress: { stressRatePct: 0, baseRatioPct: 0, rateTypeRatioPct: 0 },
    annualIncome,
    existingAnnualDebtService: existingAnnual,
    limitPct,
  });
  const stressDsr = computeDsr({ loan: dsrLoan, stress, annualIncome, existingAnnualDebtService: existingAnnual, limitPct });

  const presetOptions: StressPreset[] =
    purpose === "MORTGAGE" ? ["METRO_MORTGAGE", "NON_METRO_MORTGAGE", "NONE"] : ["CREDIT", "NONE"];

  const isEqualPrincipal = method === "EQUAL_PRINCIPAL";
  const lastRegular = schedule.length > 1 ? schedule[schedule.length - 1] : undefined;

  return (
    <div className="space-y-8">
      {/* 대출 조건 */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">대출 조건</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="대출 원금" hint={num(principal) > 0 ? formatKrwEok(num(principal)) : undefined}>
              <AmountInput value={principal} onChange={setPrincipal} placeholder="예: 300,000,000" className={amountCls} />
            </Field>
            <Field label="연 금리 (%)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={amountCls}
              />
            </Field>
            <Field label="대출 기간" hint={termMonths > 0 ? `총 ${termMonths}개월` : undefined}>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={termValue}
                  onChange={(e) => setTermValue(e.target.value)}
                  className={amountCls}
                />
                <Segmented
                  value={termUnit}
                  onChange={(u) => {
                    // 단위를 바꿔도 같은 기간이 유지되도록 숫자를 환산한다
                    if (u === termUnit) return;
                    setTermValue(u === "MONTH" ? String(termMonths) : String(+(termMonths / 12).toFixed(2)));
                    setTermUnit(u);
                  }}
                  options={[
                    { value: "YEAR", label: "년" },
                    { value: "MONTH", label: "개월" },
                  ]}
                />
              </div>
            </Field>
            <Field label="상환 방식">
              <Segmented
                value={method}
                onChange={setMethod}
                options={(Object.keys(REPAYMENT_METHOD_LABELS) as RepaymentMethod[]).map((m) => ({
                  value: m,
                  label: REPAYMENT_METHOD_LABELS[m],
                }))}
              />
            </Field>
            {method !== "BULLET" && (
              <Field label="거치기간 (개월)" hint="거치기간 동안은 이자만 내고, 이후 남은 기간에 원금을 나눠 갚습니다.">
                <input
                  type="number"
                  min="0"
                  value={grace}
                  onChange={(e) => setGrace(e.target.value)}
                  className={amountCls}
                />
              </Field>
            )}
          </div>
        </div>

        {goal && <SaveScenarioBar goal={goal} input={loanInput} />}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {method === "BULLET" ? (
            <>
              <Stat label="매월 이자" value={formatKrw(summary.firstPayment)} accent />
              <Stat label="만기 상환 원금" value={formatKrwEok(loanInput.principal)} />
            </>
          ) : isEqualPrincipal ? (
            <>
              <Stat
                label="월 상환액 (최대)"
                value={formatKrw(summary.maxPayment)}
                sub={lastRegular ? `마지막 달 ${formatKrw(lastRegular.payment)}` : undefined}
                accent
              />
              <Stat label="첫 달 상환액" value={formatKrw(summary.firstPayment)} />
            </>
          ) : (
            <>
              <Stat label="월 상환액" value={formatKrw(summary.maxPayment)} accent />
              <Stat
                label="첫 달 상환액"
                value={formatKrw(summary.firstPayment)}
                sub={num(grace) > 0 ? "거치기간 이자만" : undefined}
              />
            </>
          )}
          <Stat label="총 이자" value={formatKrwEok(summary.totalInterest)} sub={formatKrw(summary.totalInterest)} />
          <Stat label="총 상환액" value={formatKrwEok(summary.totalPayment)} sub={formatKrw(summary.totalPayment)} />
        </div>
      </section>

      {/* 상환 스케줄 */}
      {schedule.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900">상환 스케줄</h2>
            <Segmented
              value={scheduleView}
              onChange={setScheduleView}
              options={[
                { value: "YEAR", label: "연도별" },
                { value: "MONTH", label: "월별" },
              ]}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-3">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={yearly.map((y) => ({ year: `${y.year}년`, 원금: y.principal, 이자: y.interest }))}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" fontSize={11} stroke="#94a3b8" />
                <YAxis
                  fontSize={11}
                  stroke="#94a3b8"
                  width={60}
                  tickFormatter={(v: number) => `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`}
                />
                <Tooltip formatter={(v) => formatKrw(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="원금" stackId="a" fill="#2563eb" />
                <Bar dataKey="이자" stackId="a" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="max-h-96 overflow-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-400">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium">{scheduleView === "YEAR" ? "연차" : "회차"}</th>
                    <th className="px-4 py-2.5 font-medium text-right">상환액</th>
                    <th className="px-4 py-2.5 font-medium text-right">원금</th>
                    <th className="px-4 py-2.5 font-medium text-right">이자</th>
                    <th className="px-4 py-2.5 font-medium text-right">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {(scheduleView === "YEAR"
                    ? yearly.map((y) => ({ key: y.year, label: `${y.year}년차`, ...y }))
                    : schedule.map((m) => ({ key: m.month, label: `${m.month}회`, ...m }))
                  ).map((r) => (
                    <tr key={r.key}>
                      <td className="px-4 py-2 text-slate-500">{r.label}</td>
                      <td className="px-4 py-2 text-right">{formatKrw(r.payment)}</td>
                      <td className="px-4 py-2 text-right">{formatKrw(r.principal)}</td>
                      <td className="px-4 py-2 text-right text-amber-600">{formatKrw(r.interest)}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{formatKrw(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* DSR */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-900">DSR · 스트레스 DSR</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            위 대출 조건에 연소득과 기존 대출을 더해 총부채원리금상환비율을 계산합니다. 스트레스 DSR은 한도 산정 시에만
            가산 금리를 적용하며, 실제 월 상환액은 바뀌지 않습니다.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="연소득 (세전)"
              hint={num(income) > 0 ? formatKrwEok(num(income)) + " · 부부 공동 차주라면 합산 소득" : "부부 공동 차주라면 합산 소득을 입력하세요."}
            >
              <AmountInput value={income} onChange={setIncome} placeholder="예: 80,000,000" className={amountCls} />
            </Field>
            <Field label="금융권" hint={`DSR 한도 ${limitPct}%`}>
              <Segmented
                value={tier}
                onChange={setTier}
                options={(Object.keys(DSR_LIMITS) as LenderTier[]).map((t) => ({ value: t, label: DSR_LIMITS[t].label }))}
              />
            </Field>
            <Field label="대출 용도" hint={purpose === "CREDIT" ? "신용대출은 DSR 산정 시 원금을 5년 분할상환하는 것으로 봅니다." : undefined}>
              <Segmented
                value={purpose}
                onChange={applyPurpose}
                options={[
                  { value: "MORTGAGE", label: "주택담보대출" },
                  { value: "CREDIT", label: "신용·기타대출" },
                ]}
              />
            </Field>
            <Field label="스트레스 DSR 기준" hint={STRESS_PRESETS[preset].note}>
              <select value={preset} onChange={(e) => applyPreset(e.target.value as StressPreset)} className={inputCls}>
                {presetOptions.map((p) => (
                  <option key={p} value={p}>
                    {STRESS_PRESETS[p].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="금리 유형" hint="혼합형·주기형 비율은 참고값입니다. 은행 안내 비율로 아래에서 수정하세요.">
              <Segmented
                value={rateType}
                onChange={applyRateType}
                options={(Object.keys(RATE_TYPE_PRESETS) as RateType[]).map((t) => ({
                  value: t,
                  label: RATE_TYPE_PRESETS[t].label,
                }))}
              />
            </Field>
          </div>

          <details className="rounded-md bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-600">
              스트레스 금리 세부값 · 실효 가산금리 {effectiveStressRatePct(stress).toFixed(2)}%p
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="스트레스 금리 (%p)">
                <input type="number" step="0.05" value={stressRate} onChange={(e) => setStressRate(e.target.value)} className={amountCls} />
              </Field>
              <Field label="단계별 적용비율 (%)">
                <input type="number" step="5" value={baseRatio} onChange={(e) => setBaseRatio(e.target.value)} className={amountCls} />
              </Field>
              <Field label="금리유형 적용비율 (%)">
                <input
                  type="number"
                  step="5"
                  value={rateTypeRatio}
                  onChange={(e) => setRateTypeRatio(e.target.value)}
                  className={amountCls}
                />
              </Field>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              실효 가산금리 = 스트레스 금리 × 단계별 적용비율 × 금리유형 적용비율
            </p>
          </details>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700">기존 대출</h4>
              <button
                type="button"
                onClick={() => setExisting([...existing, { name: "", annual: "" }])}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                + 기존 대출 추가
              </button>
            </div>
            {existing.length === 0 ? (
              <p className="text-xs text-slate-400">기존 대출이 없으면 비워두세요. 연간 원리금 상환액(월 상환액 × 12)을 입력합니다.</p>
            ) : (
              <div className="space-y-2">
                {existing.map((e, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <input
                      placeholder="대출명 (예: 자동차 할부)"
                      value={e.name}
                      onChange={(ev) => setExisting(existing.map((x, idx) => (idx === i ? { ...x, name: ev.target.value } : x)))}
                      className="col-span-5 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    />
                    <AmountInput
                      value={e.annual}
                      onChange={(raw) => setExisting(existing.map((x, idx) => (idx === i ? { ...x, annual: raw } : x)))}
                      placeholder="연간 원리금 상환액"
                      className="col-span-6 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-right tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setExisting(existing.filter((_, idx) => idx !== i))}
                      className="col-span-1 text-xs text-red-500 hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {annualIncome > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DsrCard title="일반 DSR" result={plainDsr} />
            <DsrCard title="스트레스 DSR" result={stressDsr} highlight />
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            연소득을 입력하면 DSR과 최대 대출 가능액을 계산합니다.
          </div>
        )}
        {purpose === "CREDIT" && preset === "CREDIT" && loanInput.principal <= 100_000_000 && (
          <p className="mt-2 text-xs text-amber-600">
            신용대출 스트레스 DSR은 총 신용대출 잔액이 1억원을 초과할 때만 적용됩니다. 기존 신용대출과 합쳐 1억원 이하라면
            &ldquo;스트레스 미적용&rdquo;을 선택하세요.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          참고용 추정치입니다. 실제 한도는 금융기관 심사, LTV, 소득 인정 방식에 따라 달라질 수 있습니다.
        </p>
      </section>
    </div>
  );
}

function SaveScenarioBar({ goal, input }: { goal: { id: string; name: string }; input: LoanInput }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setMessage(null);
    const scenarioName =
      name.trim() || `${formatKrwEok(input.principal)} · ${input.annualRatePct}% · ${REPAYMENT_METHOD_LABELS[input.method]}`;
    startTransition(async () => {
      try {
        await saveLoanScenario(goal.id, { ...input, name: scenarioName, graceMonths: Math.round(input.graceMonths) });
        setName("");
        setMessage({ ok: true, text: `"${scenarioName}" 저장됨` });
      } catch (err) {
        setMessage({ ok: false, text: err instanceof Error ? err.message : "저장에 실패했습니다." });
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
      <span className="text-xs text-blue-800">
        <Link href={`/assets/goals/${goal.id}`} className="font-semibold hover:underline">
          {goal.name}
        </Link>
        에 이 조건을 시나리오로 저장
      </span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="시나리오 이름 (선택)"
        className="min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
      {message && <span className={"w-full text-xs " + (message.ok ? "text-emerald-700" : "text-red-600")}>{message.text}</span>}
    </div>
  );
}

function DsrCard({ title, result, highlight }: { title: string; result: DsrResult; highlight?: boolean }) {
  const pct = Number.isFinite(result.dsrPct) ? result.dsrPct : 0;
  const barPct = Math.min(100, (pct / Math.max(result.limitPct, 1)) * 100);
  const over = !result.withinLimit;
  return (
    <div
      className={
        "rounded-xl border bg-white p-4 shadow-sm " + (highlight ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-200")
      }
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <span
          className={
            "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
            (over ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")
          }
        >
          {over ? "한도 초과" : "한도 이내"}
        </span>
      </div>
      <div className={"mt-2 text-2xl font-bold tabular-nums " + (over ? "text-red-600" : "text-slate-900")}>
        {pct.toFixed(1)}%
        <span className="ml-1 text-xs font-medium text-slate-400">/ {result.limitPct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
        <div className={"h-1.5 rounded-full " + (over ? "bg-red-500" : "bg-blue-500")} style={{ width: `${barPct}%` }} />
      </div>
      <dl className="mt-3 space-y-1 text-xs tabular-nums">
        <div className="flex justify-between">
          <dt className="text-slate-400">산정 금리</dt>
          <dd className="text-slate-700">{result.appliedRatePct.toFixed(2)}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">신규 대출 연 원리금 (DSR 기준)</dt>
          <dd className="text-slate-700">{formatKrw(result.newLoanAnnual)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">기존 대출 연 원리금</dt>
          <dd className="text-slate-700">{formatKrw(result.existingAnnual)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-1.5">
          <dt className="font-semibold text-slate-600">최대 대출 가능액</dt>
          <dd className="font-bold text-blue-600">{formatKrwEok(result.maxPrincipal)}</dd>
        </div>
      </dl>
    </div>
  );
}
