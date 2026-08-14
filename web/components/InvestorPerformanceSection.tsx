"use client";

import { useMemo, useState } from "react";
import NetWorthTrendChart from "@/components/NetWorthTrendChart";
import { formatDateOnlyISO, parseDateOnly } from "@/lib/date";
import { formatSignedPct } from "@/lib/format";
import { computeAllTimeReturn, computeReturnSince, type InvestorSnapshotLike } from "@/lib/investor-performance";

const PRESETS = [
  { value: "7", label: "1주" },
  { value: "30", label: "1개월" },
  { value: "90", label: "3개월" },
  { value: "all", label: "전체" },
  { value: "custom", label: "직접 선택" },
] as const;
type PresetValue = (typeof PRESETS)[number]["value"];

// 기간별 수익률을 한 번에 다 보여주지 않고, 드롭다운으로 기준 기간을 고르게 한다.
// "직접 선택"은 달력으로 임의 시점을 고르면 그 시점 이하 중 가장 가까운 스냅샷을 기준점으로 쓴다.
// 스냅샷(web/app/investor/actions.ts)은 페이지 조회 시점마다 하루 1건씩 쌓이므로, 기능 도입
// 초기에는 "전체"를 제외한 기간이 데이터 부족으로 계산되지 않을 수 있다.
export default function InvestorPerformanceSection({
  snapshots,
  totalValueKrw,
  seedCapitalKrw,
  trendPoints,
}: {
  snapshots: InvestorSnapshotLike[];
  totalValueKrw: number;
  seedCapitalKrw: number;
  trendPoints: { date: string; netWorth: number }[];
}) {
  // Date.now()는 렌더 중 직접 호출하면 impure(react-hooks/purity)라, 마운트 시점 값을 한 번만 캡처해 재사용한다.
  const [nowMs] = useState(() => Date.now());
  const [selection, setSelection] = useState<PresetValue>("all");
  const todayISO = formatDateOnlyISO(new Date(nowMs));
  const earliestISO = snapshots.length > 0 ? formatDateOnlyISO(snapshots[0].date) : todayISO;
  const [customDate, setCustomDate] = useState(earliestISO);

  const result = useMemo(() => {
    if (selection === "all") return computeAllTimeReturn(totalValueKrw, seedCapitalKrw);
    if (selection === "custom") {
      if (!customDate) return { pct: null, baseDate: null };
      return computeReturnSince(snapshots, totalValueKrw, parseDateOnly(customDate));
    }
    const days = Number(selection);
    return computeReturnSince(snapshots, totalValueKrw, new Date(nowMs - days * 86_400_000));
  }, [selection, customDate, snapshots, totalValueKrw, seedCapitalKrw, nowMs]);

  const emptyReason =
    selection === "custom"
      ? "선택한 날짜 이전 스냅샷이 없습니다."
      : "데이터 수집 중입니다. 며칠에 걸쳐 페이지를 방문하면 계산됩니다.";

  return (
    <section>
      <h2 className="text-base font-bold text-slate-900 mb-3">수익률</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="text-xs text-slate-400">기준 기간</div>
          <div className="flex items-center gap-2">
            <select
              value={selection}
              onChange={(e) => setSelection(e.target.value as PresetValue)}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {selection === "custom" && (
              <input
                type="date"
                value={customDate}
                min={earliestISO}
                max={todayISO}
                onChange={(e) => setCustomDate(e.target.value)}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600"
              />
            )}
          </div>
        </div>
        {result.pct == null ? (
          <div className="text-sm text-slate-400">{emptyReason}</div>
        ) : (
          <>
            <div
              className={`text-2xl font-bold ${
                result.pct > 0 ? "text-red-600" : result.pct < 0 ? "text-blue-600" : "text-slate-900"
              }`}
            >
              {formatSignedPct(result.pct)}
            </div>
            {result.baseDate && (
              <div className="text-[11px] text-slate-400 mt-1">{formatDateOnlyISO(result.baseDate)} 대비</div>
            )}
          </>
        )}
      </div>
      <NetWorthTrendChart
        series={[{ name: "총 평가금액", points: trendPoints }]}
        emptyMessage="총 평가금액 추이를 표시하려면 스냅샷이 2개 이상 필요합니다. 페이지를 며칠에 걸쳐 방문하면 쌓입니다."
      />
    </section>
  );
}
