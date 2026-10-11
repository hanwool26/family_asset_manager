"use client";

import { useState, useTransition } from "react";
import { convertInvestorFx } from "@/app/investor/actions";
import { formatCurrency, formatKrw } from "@/lib/format";

type Direction = "KRW_TO_USD" | "USD_TO_KRW";

// 미국 슬리브 수동 환전. 체결 환율은 서버 액션이 제출 시점에 다시 조회하므로(convertInvestorFx),
// 여기 표시되는 예상 금액은 페이지 로딩 시점 환율 기준 참고값이다.
export default function InvestorFxConvertDialog({
  usdKrwRate,
  krwReserve,
  usdCash,
}: {
  usdKrwRate: number;
  krwReserve: number;
  usdCash: number;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("KRW_TO_USD");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isKrwToUsd = direction === "KRW_TO_USD";
  const available = isKrwToUsd ? krwReserve : usdCash;
  const amountNum = Number(amount);
  const estimate = Number.isFinite(amountNum) && amountNum > 0
    ? isKrwToUsd
      ? formatCurrency(amountNum / usdKrwRate, "USD")
      : formatKrw(amountNum * usdKrwRate)
    : null;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await convertInvestorFx(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setAmount("");
      setOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        환전
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <form action={handleSubmit} className="space-y-2.5">
            <input type="hidden" name="direction" value={direction} />
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  ["KRW_TO_USD", "원 → 달러"],
                  ["USD_TO_KRW", "달러 → 원"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDirection(value);
                    setAmount("");
                  }}
                  className={
                    "rounded-md py-1 text-xs font-semibold " +
                    (direction === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block text-xs text-slate-500">
              <span className="flex items-center justify-between">
                환전 금액 ({isKrwToUsd ? "KRW" : "USD"})
                <button
                  type="button"
                  onClick={() => setAmount(String(isKrwToUsd ? Math.floor(available) : Math.floor(available * 100) / 100))}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  전액 {isKrwToUsd ? formatKrw(available) : formatCurrency(available, "USD")}
                </button>
              </span>
              <input
                name="amount"
                type="number"
                step={isKrwToUsd ? "1" : "0.01"}
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <p className="text-[11px] text-slate-400">
              현재 환율 {usdKrwRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원
              {estimate && <> · 예상 {estimate}</>}
              <br />
              제출 시점 실시간 환율로 모의 체결됩니다 (환전 스프레드 미반영).
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
                {pending ? "환전 중..." : "환전"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
