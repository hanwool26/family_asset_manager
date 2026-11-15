"use client";

import { useState, useTransition } from "react";
import { saveCashflows } from "@/app/assets/goals/actions";
import AmountInput from "./AmountInput";
import { formatKrw, formatSignedKrw } from "@/lib/format";
import type { CashflowDirection, CashflowFrequency } from "@/lib/goal-plan";

export interface CashflowRow {
  label: string;
  direction: CashflowDirection;
  frequency: CashflowFrequency;
  amount: string;
  startDate: string; // MONTHLY: "YYYY-MM", ONCE: "YYYY-MM-DD", 없으면 ""
  endDate: string; // MONTHLY만 사용, "YYYY-MM"
  note: string;
}

const cellCls = "rounded-md border border-slate-300 px-2 py-1.5 text-xs";

/** 월 입력값("YYYY-MM")은 그 달 1일로 저장한다. 계산은 월 단위로만 비교한다. */
function toDateString(row: CashflowRow, value: string): string | null {
  if (!value) return null;
  return row.frequency === "MONTHLY" ? `${value.slice(0, 7)}-01` : value;
}

export default function HouseholdCashflowEditor({ initial, currentMonth }: { initial: CashflowRow[]; currentMonth: string }) {
  const [rows, setRows] = useState<CashflowRow[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(next: CashflowRow[]) {
    setRows(next);
    setDirty(true);
  }
  function updateRow<K extends keyof CashflowRow>(i: number, field: K, value: CashflowRow[K]) {
    update(
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, [field]: value };
        // 반복/일회성을 바꾸면 날짜 입력 형식이 달라지므로 날짜를 맞춰준다
        if (field === "frequency") {
          next.startDate = value === "ONCE" ? (r.startDate ? `${r.startDate.slice(0, 7)}-01` : "") : r.startDate.slice(0, 7);
          next.endDate = "";
        }
        return next;
      })
    );
  }

  // 이번 달 기준으로 유효한 매월 항목의 합계
  const active = rows.filter(
    (r) =>
      r.frequency === "MONTHLY" &&
      (!r.startDate || r.startDate.slice(0, 7) <= currentMonth) &&
      (!r.endDate || r.endDate.slice(0, 7) >= currentMonth)
  );
  const monthlyIncome = active.filter((r) => r.direction === "INCOME").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const monthlyExpense = active.filter((r) => r.direction === "EXPENSE").reduce((s, r) => s + (Number(r.amount) || 0), 0);

  function handleSave() {
    setError(null);
    const payload = rows
      .filter((r) => r.label.trim())
      .map((r) => ({
        label: r.label,
        direction: r.direction,
        frequency: r.frequency,
        amount: Number(r.amount) || 0,
        startDate: toDateString(r, r.startDate),
        endDate: toDateString(r, r.endDate),
        note: r.note,
      }));
    startTransition(async () => {
      try {
        await saveCashflows(payload);
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 py-2">
          <div className="text-[11px] text-slate-400">월 수입</div>
          <div className="text-sm font-bold tabular-nums text-slate-900">{formatKrw(monthlyIncome)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <div className="text-[11px] text-slate-400">월 지출</div>
          <div className="text-sm font-bold tabular-nums text-slate-900">{formatKrw(monthlyExpense)}</div>
        </div>
        <div className="rounded-lg bg-blue-50 py-2">
          <div className="text-[11px] text-blue-500">월 순저축</div>
          <div className="text-sm font-bold tabular-nums text-blue-700">{formatSignedKrw(monthlyIncome - monthlyExpense)}</div>
        </div>
      </div>

      <div className="space-y-3 sm:space-y-1.5">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-1.5 items-center border-b border-slate-100 pb-3 sm:grid-cols-12 sm:border-0 sm:pb-0"
          >
            <select
              value={row.direction}
              onChange={(e) => updateRow(i, "direction", e.target.value as CashflowDirection)}
              className={cellCls + (row.direction === "INCOME" ? " text-blue-700" : " text-red-600")}
            >
              <option value="INCOME">수입</option>
              <option value="EXPENSE">지출</option>
            </select>
            <select
              value={row.frequency}
              onChange={(e) => updateRow(i, "frequency", e.target.value as CashflowFrequency)}
              className={cellCls}
            >
              <option value="MONTHLY">매월</option>
              <option value="ONCE">일회성</option>
            </select>
            <input
              placeholder={row.direction === "INCOME" ? "예: 월급(합산)" : "예: 생활비"}
              value={row.label}
              onChange={(e) => updateRow(i, "label", e.target.value)}
              className={cellCls + " col-span-2 sm:col-span-3"}
            />
            <AmountInput
              value={row.amount}
              onChange={(raw) => updateRow(i, "amount", raw)}
              placeholder="금액"
              className={cellCls + " col-span-2 text-right tabular-nums sm:col-span-2"}
            />
            {row.frequency === "MONTHLY" ? (
              <>
                <input
                  type="month"
                  title="시작월 (비우면 지금부터)"
                  value={row.startDate.slice(0, 7)}
                  onChange={(e) => updateRow(i, "startDate", e.target.value)}
                  className={cellCls + " sm:col-span-2"}
                />
                <input
                  type="month"
                  title="종료월 (비우면 계속)"
                  value={row.endDate.slice(0, 7)}
                  onChange={(e) => updateRow(i, "endDate", e.target.value)}
                  className={cellCls + " sm:col-span-2"}
                />
              </>
            ) : (
              <input
                type="date"
                title="날짜"
                value={row.startDate}
                onChange={(e) => updateRow(i, "startDate", e.target.value)}
                className={cellCls + " col-span-2 sm:col-span-4"}
              />
            )}
            <button
              type="button"
              onClick={() => update(rows.filter((_, idx) => idx !== i))}
              className="col-span-2 justify-self-end text-xs text-red-500 hover:underline sm:col-span-1"
            >
              삭제
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-xs text-slate-400">
            월급, 생활비, 성과급, 전세보증금 반환 등 앞으로 들어오고 나갈 돈을 입력하면 모든 목표 계산에 함께 쓰입니다.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() =>
              update([...rows, { label: "", direction: "INCOME", frequency: "MONTHLY", amount: "", startDate: "", endDate: "", note: "" }])
            }
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            + 수입 추가
          </button>
          <button
            type="button"
            onClick={() =>
              update([...rows, { label: "", direction: "EXPENSE", frequency: "MONTHLY", amount: "", startDate: "", endDate: "", note: "" }])
            }
            className="text-xs font-medium text-red-500 hover:underline"
          >
            + 지출 추가
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {pending ? "저장 중..." : dirty ? "저장" : "저장됨"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        매월 항목의 시작월·종료월은 비워두면 각각 &ldquo;지금부터&rdquo;, &ldquo;계속&rdquo;입니다. 이번 달 수입/지출은 이미 스냅샷 잔액에
        반영된 것으로 보고 다음 달부터 계산합니다.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
