import Link from "next/link";
import { prisma } from "@/lib/db";
import BlurGate from "@/components/BlurGate";
import InvestorHoldingsTable from "@/components/InvestorHoldingsTable";
import InvestorProposalCard from "@/components/InvestorProposalCard";
import InvestorSettingsDialog from "@/components/InvestorSettingsDialog";
import { formatKrw } from "@/lib/format";
import { getInvestorSettings } from "@/lib/investor-settings";
import { computeCashKrw, getLiveInvestorValuations } from "@/lib/investor-state";

export const dynamic = "force-dynamic";

export default async function InvestorPage() {
  const [holdings, transactions, settings, proposals] = await Promise.all([
    // 전량 매도(EXIT) 종목은 거래내역 보존을 위해 삭제하지 않고 quantity=0으로 남겨두므로
    // (web/lib/investor-execution.ts 참고) 화면에 표시할 현재 보유종목에선 걸러야 한다.
    prisma.investorHolding.findMany({ where: { quantity: { gt: 0 } }, orderBy: { createdAt: "asc" } }),
    prisma.investorTransaction.findMany(),
    getInvestorSettings(),
    prisma.investorProposal.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { items: true },
    }),
  ]);

  const [valuations, cashKrw] = await Promise.all([
    getLiveInvestorValuations(holdings),
    Promise.resolve(computeCashKrw(settings.seedCapitalKrw, transactions)),
  ]);

  const holdingsValueKrw = valuations.reduce((sum, h) => sum + h.valueKrw, 0);
  const totalValueKrw = cashKrw + holdingsValueKrw;
  const [latestProposal, ...pastProposals] = proposals;

  return (
    <BlurGate>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Investor</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              뉴스·기술지표 기반 AI가 매주 리밸런싱을 제안하고, 승인해야 반영되는 반자동 장기 포트폴리오입니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/investor/strategy"
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              📖 전략 설명
            </Link>
            <InvestorSettingsDialog settings={settings} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">총 평가금액 (현금 포함)</div>
            <div className="text-2xl font-bold text-slate-900">{formatKrw(totalValueKrw)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">가용 현금</div>
            <div className="text-2xl font-bold text-slate-900">{formatKrw(cashKrw)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">보유 종목 수</div>
            <div className="text-2xl font-bold text-slate-900">
              {holdings.length}<span className="text-sm font-normal text-slate-400"> / 최대 {settings.maxPositions}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">리스크 상한</div>
            <div className="text-sm font-semibold text-slate-700">
              종목당 최대 {settings.maxWeightPct}% · 현금버퍼 {settings.cashBufferPct}%↑
            </div>
          </div>
        </div>

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

        {pastProposals.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-slate-900 mb-3">지난 제안</h2>
            <div className="space-y-4">
              {pastProposals.map((p) => (
                <InvestorProposalCard key={p.id} proposal={p} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-base font-bold text-slate-900 mb-3">보유 종목</h2>
          <InvestorHoldingsTable holdings={valuations} totalValueKrw={totalValueKrw} />
        </section>
      </div>
    </BlurGate>
  );
}
