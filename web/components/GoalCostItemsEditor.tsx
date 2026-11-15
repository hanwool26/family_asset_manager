"use client";

import { useState, useTransition } from "react";
import { saveCostItems } from "@/app/assets/goals/actions";
import AmountInput from "./AmountInput";
import { formatKrw, formatKrwEok } from "@/lib/format";

export interface CostItemRow {
  name: string;
  amount: string; // 콤마 없는 원시 숫자 문자열
  dueDate: string; // "YYYY-MM-DD" 또는 ""
  note: string;
}

const cellCls = "rounded-md border border-slate-300 px-2 py-1.5 text-xs";

export default function GoalCostItemsEditor({ goalId, initial }: { goalId: string; initial: CostItemRow[] }) {
  const [rows, setRows] = useState<CostItemRow[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(next: CostItemRow[]) {
    setRows(next);
    setDirty(true);
  }
  function updateRow(i: number, field: keyof CostItemRow, value: string) {
    update(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  function handleSave() {
    setError(null);
    const items = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name, amount: Number(r.amount) || 0, dueDate: r.dueDate || null, note: r.note }));
    startTransition(async () => {
      try {
        await saveCostItems(goalId, items);
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="hidden sm:grid grid-cols-12 gap-1.5 px-0.5 pb-1.5 text-[11px] font-medium text-slate-400">
        <span className="col-span-3">항목</span>
        <span className="col-span-3 text-right">금액</span>
        <span className="col-span-2">지출 예정일 (선택)</span>
        <span className="col-span-2">메모</span>
      </div>
      <div className="space-y-3 sm:space-y-1.5">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-1.5 items-center border-b border-slate-100 pb-3 sm:grid-cols-12 sm:border-0 sm:pb-0"
          >
            <input
              placeholder="항목명 (예: 인테리어)"
              value={row.name}
              onChange={(e) => updateRow(i, "name", e.target.value)}
              className={cellCls + " col-span-2 sm:col-span-3"}
            />
            <AmountInput
              value={row.amount}
              onChange={(raw) => updateRow(i, "amount", raw)}
              placeholder="금액"
              className={cellCls + " col-span-2 text-right tabular-nums sm:col-span-3"}
            />
            <input
              type="date"
              value={row.dueDate}
              onChange={(e) => updateRow(i, "dueDate", e.target.value)}
              className={cellCls + " sm:col-span-2"}
            />
            <input
              placeholder="메모"
              value={row.note}
              onChange={(e) => updateRow(i, "note", e.target.value)}
              className={cellCls + " sm:col-span-2"}
            />
            <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => move(i, -1)} className="text-xs text-slate-400 hover:text-slate-700" aria-label="위로">
                ▲
              </button>
              <button type="button" onClick={() => move(i, 1)} className="text-xs text-slate-400 hover:text-slate-700" aria-label="아래로">
                ▼
              </button>
              <button
                type="button"
                onClick={() => update(rows.filter((_, idx) => idx !== i))}
                className="text-xs text-red-500 hover:underline"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-400">항목이 없습니다. &quot;+ 항목 추가&quot;로 입력하세요.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => update([...rows, { name: "", amount: "", dueDate: "", note: "" }])}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          + 항목 추가
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            <span className="text-slate-400 mr-1.5">필요 금액 합계</span>
            <span className="font-bold tabular-nums text-slate-900" title={formatKrw(total)}>
              {formatKrwEok(total)}
            </span>
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !dirty}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {pending ? "저장 중..." : dirty ? "저장" : "저장됨"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        지출 예정일을 비워두면 목표일에 지출되는 것으로 계산합니다. 계약금처럼 먼저 나가는 돈은 날짜를 넣으면 중간 자금 공백까지 확인할 수 있습니다.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
