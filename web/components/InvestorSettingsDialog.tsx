"use client";

import { useState, useTransition } from "react";
import { updateInvestorSettings } from "@/app/investor/actions";
import type { InvestorSettings } from "@/lib/investor-settings";

export default function InvestorSettingsDialog({ settings }: { settings: InvestorSettings }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateInvestorSettings(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        운용 설정
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <form action={handleSubmit} className="space-y-2.5">
            <label className="block text-xs text-slate-500">
              시드 금액 (KRW)
              <input
                name="seedCapitalKrw"
                type="number"
                step="1"
                min="0"
                required
                defaultValue={settings.seedCapitalKrw}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              최대 종목 수
              <input
                name="maxPositions"
                type="number"
                step="1"
                min="1"
                required
                defaultValue={settings.maxPositions}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              종목당 최대 비중 (%)
              <input
                name="maxWeightPct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                required
                defaultValue={settings.maxWeightPct}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              최소 현금 버퍼 (%)
              <input
                name="cashBufferPct"
                type="number"
                step="0.1"
                min="0"
                max="99"
                required
                defaultValue={settings.cashBufferPct}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              섹터당 최대 비중 (%)
              <input
                name="maxSectorWeightPct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                required
                defaultValue={settings.maxSectorWeightPct}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              리밸런싱 밴드 (%p)
              <input
                name="rebalanceBandPct"
                type="number"
                step="0.1"
                min="0"
                max="50"
                required
                defaultValue={settings.rebalanceBandPct}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-500">
              서킷브레이커 손실률 (%)
              <input
                name="circuitBreakerLossPct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                required
                defaultValue={settings.circuitBreakerLossPct}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <p className="text-[11px] text-slate-400">
              섹터/밴드는 pipeline/run_ai_investor.py가 주간 제안을 생성할 때, 서킷브레이커는 승인 시점
              모의 체결(web/lib/investor-execution.ts)에서 하드 리밋으로 강제 적용합니다.
            </p>
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
                {pending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
