import InvestorFxConvertDialog from "@/components/InvestorFxConvertDialog";
import InvestorHoldingsTable from "@/components/InvestorHoldingsTable";
import InvestorProposalCard, { type ProposalWithItems } from "@/components/InvestorProposalCard";
import InvestorProposalHistoryDialog from "@/components/InvestorProposalHistoryDialog";
import { formatCurrency, formatKrw, formatSignedKrw, formatSignedPct } from "@/lib/format";
import type { InvestorSettings } from "@/lib/investor-settings";
import type { InvestorHoldingValuation, InvestorSleeveSummary } from "@/lib/investor-state";

function pnlTone(value: number | null): string {
  if (value == null) return "text-slate-900";
  return value > 0 ? "text-red-600" : value < 0 ? "text-blue-600" : "text-slate-900";
}

// AI Investor 페이지의 시장별 탭(한국/미국) 한 칸. 각 시장은 독립된 슬리브(시드 x 배분비율)로 운용되며,
// 카드의 수익률·비중은 전부 그 슬리브 기준이다.
export default function InvestorSleeveSection({
  summary,
  valuations,
  latestProposal,
  pastProposals,
  settings,
  usd,
}: {
  summary: InvestorSleeveSummary;
  valuations: InvestorHoldingValuation[];
  latestProposal?: ProposalWithItems;
  pastProposals: ProposalWithItems[];
  settings: InvestorSettings;
  /** 미국 슬리브 전용: 달러 현금/원화 대기자금/환율. */
  usd?: { usdKrwRate: number; usdCash: number; krwReserve: number };
}) {
  const isUs = summary.region === "US";
  const unrealizedPnlKrw = summary.holdingsValueKrw - summary.holdingsCostKrw;
  const unrealizedPnlPct = summary.holdingsCostKrw > 0 ? (unrealizedPnlKrw / summary.holdingsCostKrw) * 100 : 0;
  const allocationPct = isUs ? settings.usAllocationPct : 100 - settings.usAllocationPct;
  const notAllocated = summary.seedKrw <= 0 && valuations.length === 0;

  return (
    <div className="space-y-8">
      {notAllocated && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          현재 {isUs ? "미국" : "한국"} 주식 배분 비율이 0%라 이 시장의 주간 제안이 생성되지 않습니다. 우측 상단
          &quot;운용 설정&quot;에서 배분 비율을 지정하세요.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">
            {isUs ? "미국" : "한국"} 슬리브 평가금액 (배분 {allocationPct}%)
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatKrw(summary.totalValueKrw)}</div>
          <div className={`text-[11px] mt-0.5 ${pnlTone(summary.returnPct)}`}>
            시드 {formatKrw(summary.seedKrw)} 대비 {summary.returnPct != null ? formatSignedPct(summary.returnPct) : "-"}
            {isUs && <span className="text-slate-400"> (환차손익 포함)</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">보유종목 평가손익</div>
          <div className={`text-2xl font-bold ${pnlTone(unrealizedPnlKrw)}`}>{formatSignedKrw(unrealizedPnlKrw)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {formatSignedPct(unrealizedPnlPct)}
            {isUs && " (달러 기준 종목 수익률)"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-slate-400 mb-1">가용 현금</div>
            {usd && <InvestorFxConvertDialog {...usd} />}
          </div>
          {usd ? (
            <>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(usd.usdCash, "USD")}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                + 원화 대기자금 {formatKrw(usd.krwReserve)} (합계 ≈ {formatKrw(summary.cashKrw)})
              </div>
            </>
          ) : (
            <div className="text-2xl font-bold text-slate-900">{formatKrw(summary.cashKrw)}</div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">보유 종목 수</div>
          <div className="text-2xl font-bold text-slate-900">
            {valuations.length}
            <span className="text-sm font-normal text-slate-400"> / 최대 {settings.maxPositions}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            종목당 최대 {settings.maxWeightPct}% · 현금버퍼 {settings.cashBufferPct}%↑
          </div>
        </div>
      </div>

      {isUs && (
        <p className="-mt-4 text-[11px] text-slate-400">
          미국 슬리브는 달러로 투자됩니다. 매수 시 달러 현금이 부족하면 원화 대기자금에서 부족분만 체결 시점 환율로
          자동 환전되고, 매도 대금은 달러로 남습니다. 환전 타이밍은 홈의 &quot;오늘의 시장 분석 &gt; 원/달러 환율&quot;
          AI 분석을 참고하세요.
        </p>
      )}

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">이번 주 제안</h2>
        {latestProposal ? (
          <InvestorProposalCard proposal={latestProposal} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            아직 생성된 제안이 없습니다. 파이프라인의 주간 의사결정 작업(run_ai_investor.py)이 실행되면
            여기에 표시됩니다.
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">보유 종목</h2>
        <InvestorHoldingsTable holdings={valuations} sleeveTotalKrw={summary.totalValueKrw} />
      </section>

      {pastProposals.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900">지난 제안</h2>
            <InvestorProposalHistoryDialog proposals={pastProposals.slice(0, 5)} />
          </div>
          <InvestorProposalCard proposal={pastProposals[0]} />
        </section>
      )}
    </div>
  );
}
