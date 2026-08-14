import NetWorthTrendChart from "@/components/NetWorthTrendChart";
import { formatSignedPct } from "@/lib/format";
import { formatDateOnlyISO } from "@/lib/date";
import type { PeriodReturn } from "@/lib/investor-performance";

// 기간별 수익률 카드 + 총 평가금액 추이 차트. 스냅샷(web/app/investor/actions.ts)은 페이지 조회
// 시점마다 하루 1건씩 쌓이므로, 기능 도입 초기에는 일부 기간이 "데이터 수집 중"으로 보일 수 있다.
export default function InvestorPerformanceSection({
  periodReturns,
  trendPoints,
}: {
  periodReturns: PeriodReturn[];
  trendPoints: { date: string; netWorth: number }[];
}) {
  return (
    <section>
      <h2 className="text-base font-bold text-slate-900 mb-3">기간별 수익률</h2>
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        {periodReturns.map((r) => (
          <div key={r.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">{r.label}</div>
            {r.pct == null ? (
              <div className="text-sm text-slate-400 mt-1.5">데이터 수집 중</div>
            ) : (
              <>
                <div
                  className={`text-2xl font-bold ${
                    r.pct > 0 ? "text-red-600" : r.pct < 0 ? "text-blue-600" : "text-slate-900"
                  }`}
                >
                  {formatSignedPct(r.pct)}
                </div>
                {r.baseDate && (
                  <div className="text-[11px] text-slate-400 mt-1">{formatDateOnlyISO(r.baseDate)} 대비</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <NetWorthTrendChart
        series={[{ name: "총 평가금액", points: trendPoints }]}
        emptyMessage="총 평가금액 추이를 표시하려면 스냅샷이 2개 이상 필요합니다. 페이지를 며칠에 걸쳐 방문하면 쌓입니다."
      />
    </section>
  );
}
