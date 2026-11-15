"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGoal, updateGoal } from "@/app/assets/goals/actions";
import {
  COST_ITEM_TEMPLATES,
  GOAL_KIND_LABELS,
  GOAL_STATUS_LABELS,
  type GoalKind,
  type GoalStatus,
} from "@/lib/goal-plan";

export interface GoalInfo {
  id: string;
  name: string;
  kind: GoalKind;
  targetDate: string; // "YYYY-MM-DD"
  status: GoalStatus;
  memo: string;
}

const inputCls = "mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm";

export default function GoalFormDialog({ initial }: { initial?: GoalInfo }) {
  const isEdit = Boolean(initial);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<GoalKind>(initial?.kind ?? "APARTMENT");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [status, setStatus] = useState<GoalStatus>(initial?.status ?? "ACTIVE");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { name, kind, targetDate, status, memo };
    startTransition(async () => {
      try {
        if (initial) {
          await updateGoal(initial.id, input);
          setOpen(false);
        } else {
          const id = await createGoal(input);
          router.push(`/assets/goals/${id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    });
  }

  return (
    <div>
      {isEdit ? (
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-blue-600 hover:underline">
          목표 수정
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-slate-900 text-white text-sm font-semibold px-4 py-2 hover:bg-slate-700 transition-colors"
        >
          + 목표 추가
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-4 sm:p-6 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">목표 {isEdit ? "수정" : "추가"}</h3>
            <label className="block text-xs text-slate-500">
              목표 이름
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 강동구 아파트 매수"
                className={inputCls}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-500">
                유형
                <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} className={inputCls}>
                  {(Object.keys(GOAL_KIND_LABELS) as GoalKind[]).map((k) => (
                    <option key={k} value={k}>
                      {GOAL_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-500">
                목표일
                <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
              </label>
            </div>
            {isEdit && (
              <label className="block text-xs text-slate-500">
                상태
                <select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)} className={inputCls}>
                  {(Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {GOAL_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-xs text-slate-500">
              메모
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={inputCls} />
            </label>
            {!isEdit && COST_ITEM_TEMPLATES[kind].length > 0 && (
              <p className="text-[11px] text-slate-400">
                필요 금액 항목이 미리 만들어집니다: {COST_ITEM_TEMPLATES[kind].join(", ")}. 상세 화면에서 금액을 채우거나 추가·삭제할 수
                있습니다.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "저장 중..." : isEdit ? "저장" : "추가"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
