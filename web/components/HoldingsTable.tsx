"use client";

import { useMemo, useState, useTransition } from "react";
import type { Holding } from "@/app/generated/prisma/client";
import { addTransaction, deleteHolding } from "@/app/portfolio/actions";
import { formatCurrency, formatKrw, formatSignedKrw, formatSignedPct } from "@/lib/format";
import ConfirmDeleteButton from "./ConfirmDeleteButton";

type HoldingRow = Holding & { valueKrw: number; costKrw: number; returnPct: number; isLive: boolean; livePrice: number | null };
type SortKey = "name" | "quantity" | "avgPrice" | "valueKrw" | "weightPct" | "returnPct";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; defaultDir: "asc" | "desc" }[] = [
  { key: "name", label: "종목", align: "left", defaultDir: "asc" },
  { key: "quantity", label: "수량", align: "right", defaultDir: "desc" },
  { key: "avgPrice", label: "시세/평단가", align: "right", defaultDir: "desc" },
  { key: "valueKrw", label: "매입/평가금액", align: "right", defaultDir: "desc" },
  { key: "weightPct", label: "비중", align: "right", defaultDir: "desc" },
  { key: "returnPct", label: "평가손익", align: "right", defaultDir: "desc" },
];

function TransactionRow({ holding }: { holding: Holding }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addTransaction(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "거래 등록에 실패했습니다.");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        {open ? "닫기" : "거래 추가"}
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <form action={handleSubmit} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="holdingId" value={holding.id} />
            <label className="text-xs text-slate-500">
              구분
              <select
                name="type"
                className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="BUY">매수</option>
                <option value="SELL">매도</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              수량
              <input
                name="quantity"
                type="number"
                step="any"
                min="0"
                required
                className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              가격
              <input
                name="price"
                type="number"
                step="any"
                min="0"
                required
                className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? "등록 중..." : "등록"}
            </button>
          </form>
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </>
  );
}

export default function HoldingsTable({ holdings }: { holdings: HoldingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)!.defaultDir);
    }
  }

  const withWeight = useMemo(() => {
    const totalValueKrw = holdings.reduce((sum, h) => sum + h.valueKrw, 0);
    return holdings.map((h) => ({
      ...h,
      weightPct: totalValueKrw > 0 ? (h.valueKrw / totalValueKrw) * 100 : 0,
    }));
  }, [holdings]);

  const sorted = useMemo(() => {
    if (!sortKey) return withWeight;
    const copy = [...withWeight];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [withWeight, sortKey, sortDir]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
        아직 등록된 보유 종목이 없습니다. &ldquo;+ 종목 추가&rdquo;로 시작해보세요.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-400">
            <tr className="text-left">
              {COLUMNS.map((col) => (
                <th key={col.key} className={`px-4 py-2.5 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}>
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-0.5 hover:text-slate-600"
                  >
                    {col.label}
                    {sortKey === col.key && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2.5 font-medium"></th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((h) => (
              <tr key={h.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    {h.name}
                    {!h.isLive && (
                      <span
                        title="실시간 시세 조회에 실패해 마지막 등록값을 표시합니다."
                        className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300"
                      />
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {h.ticker} &middot; {h.region === "KR" ? "국내" : "해외"}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{h.quantity.toLocaleString("ko-KR")}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="text-[11px] text-slate-400">{h.livePrice != null ? formatCurrency(h.livePrice, h.currency) : "-"}</div>
                  <div>{formatCurrency(h.avgPrice, h.currency)}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  <div className="text-[11px] font-normal text-slate-400">{formatKrw(h.costKrw)}</div>
                  <div>{formatKrw(h.valueKrw)}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{h.weightPct.toFixed(1)}%</td>
                <td
                  className={`px-4 py-3 text-right tabular-nums font-semibold ${
                    h.returnPct > 0 ? "text-red-600" : h.returnPct < 0 ? "text-blue-600" : "text-slate-500"
                  }`}
                >
                  <div className="text-[11px] font-normal">{formatSignedKrw(h.valueKrw - h.costKrw)}</div>
                  <div>{formatSignedPct(h.returnPct)}</div>
                </td>
                <td className="px-4 py-3">
                  <TransactionRow holding={h} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ConfirmDeleteButton
                    action={deleteHolding.bind(null, h.id)}
                    confirmMessage={`${h.name}(${h.ticker})을(를) 삭제할까요? 관련 거래 내역도 함께 삭제되며 되돌릴 수 없습니다.`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[11px] text-slate-400 border-t border-slate-100">
        * 평가금액/수익률은 네이버·야후 파이낸스 실시간 시세와 실시간 환율(최대 1분 지연) 기준입니다. 회색 점이 표시된 종목은
        시세 조회에 실패해 마지막 등록값을 표시합니다.
      </p>
    </div>
  );
}
