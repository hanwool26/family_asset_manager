"use client";

import { useState, useTransition } from "react";
import { saveFundingSources } from "@/app/assets/goals/actions";
import { groupByCategory } from "@/lib/finance";
import { fundingKey, type FundingSourceRef } from "@/lib/goal-plan";
import { formatKrw, formatKrwEok } from "@/lib/format";

export interface FundingMember {
  memberId: string;
  memberName: string;
  latestDateLabel: string | null;
  items: { type: string; category: string; name: string; amount: number }[];
}

export default function GoalFundingSelector({
  goalId,
  members,
  initialSelected,
  missing,
  usedByOtherGoals,
}: {
  goalId: string;
  members: FundingMember[];
  initialSelected: FundingSourceRef[];
  /** 저장돼 있지만 최신 스냅샷에서 찾을 수 없는 항목 (이름 변경/삭제). */
  missing: (FundingSourceRef & { memberName: string })[];
  /** 다른 진행중 목표에도 연결된 항목 key -> 목표 이름들. */
  usedByOtherGoals: Record<string, string[]>;
}) {
  const [selected, setSelected] = useState<Map<string, FundingSourceRef>>(
    () => new Map(initialSelected.map((s) => [fundingKey(s), s]))
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(ref: FundingSourceRef) {
    const key = fundingKey(ref);
    const next = new Map(selected);
    if (next.has(key)) next.delete(key);
    else next.set(key, ref);
    setSelected(next);
    setDirty(true);
  }

  const total = members
    .flatMap((m) => m.items.map((i) => ({ ...i, memberId: m.memberId })))
    .filter((i) => selected.has(fundingKey(i)))
    .reduce((s, i) => s + i.amount, 0);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await saveFundingSources(goalId, Array.from(selected.values()));
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {missing.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          연결된 항목 중 최신 스냅샷에서 찾을 수 없는 항목이 있어 0원으로 계산됩니다:{" "}
          {missing.map((m) => `${m.memberName} · ${m.category} · ${m.name}`).join(", ")}. 항목명이 바뀌었다면 아래에서 다시
          선택해주세요.
          <button
            type="button"
            onClick={() => {
              const next = new Map(selected);
              missing.forEach((m) => next.delete(fundingKey(m)));
              setSelected(next);
              setDirty(true);
            }}
            className="ml-2 font-semibold underline"
          >
            연결 해제
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {members.map((m) => {
          const groups = groupByCategory(m.items, "ASSET");
          return (
            <div key={m.memberId}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-900">{m.memberName}</span>
                <span className="text-[11px] text-slate-400">{m.latestDateLabel ?? "스냅샷 없음"}</span>
              </div>
              {groups.length === 0 && <p className="text-xs text-slate-400">자산 항목이 없습니다.</p>}
              <div className="space-y-2.5">
                {groups.map((g) => (
                  <div key={g.category}>
                    <div className="text-[11px] text-slate-400 mb-1">{g.category}</div>
                    <div className="space-y-1">
                      {g.items.map((item, idx) => {
                        const ref = { memberId: m.memberId, type: item.type, category: item.category, name: item.name };
                        const key = fundingKey(ref);
                        const isSelected = selected.has(key);
                        const others = usedByOtherGoals[key];
                        return (
                          <button
                            key={key + idx}
                            type="button"
                            onClick={() => toggle(ref)}
                            className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                              isSelected
                                ? "bg-blue-100 text-blue-900 ring-1 ring-inset ring-blue-300"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span>
                              {item.name}
                              {isSelected && others && (
                                <span className="ml-1.5 text-[10px] font-semibold text-amber-600">
                                  ⚠ {others.join(", ")}에도 연결됨
                                </span>
                              )}
                            </span>
                            <span className="tabular-nums">{formatKrw(item.amount)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
        <span className="text-sm">
          <span className="text-slate-400 mr-1.5">선택한 가용 현금</span>
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
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
