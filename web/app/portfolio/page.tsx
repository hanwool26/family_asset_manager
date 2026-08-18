import { prisma } from "@/lib/db";
import { ensureTodaySnapshot } from "./actions";
import HoldingFormDialog from "@/components/HoldingFormDialog";
import ImportHoldingsDialog from "@/components/ImportHoldingsDialog";
import HoldingsTable from "@/components/HoldingsTable";
import CategoryPieChart from "@/components/CategoryPieChart";
import PortfolioMoversSection from "@/components/PortfolioMoversSection";
import BlurGate from "@/components/BlurGate";
import { formatKrw, formatSignedKrw, formatSignedPct } from "@/lib/format";
import { formatDateTimeKorean } from "@/lib/date";
import { getLiveHoldingValuations } from "@/lib/portfolio-valuation";
import { getLatestPortfolioMoversReport } from "@/lib/portfolio-movers-reports";

export const dynamic = "force-dynamic";

const REGION_LABEL: Record<string, string> = { KR: "국내", US: "해외" };

export default async function PortfolioPage() {
  const holdings = await prisma.holding.findMany({ orderBy: { createdAt: "asc" } });
  const [{ valuations: rows, usdKrwRate }, krMoversReport, usMoversReport] = await Promise.all([
    getLiveHoldingValuations(holdings),
    getLatestPortfolioMoversReport("KR"),
    getLatestPortfolioMoversReport("US"),
  ]);
  const quotedAt = new Date();

  const totalValueKrw = rows.reduce((sum, h) => sum + h.valueKrw, 0);
  const totalCostKrw = rows.reduce((sum, h) => sum + h.costKrw, 0);
  const totalProfitKrw = totalValueKrw - totalCostKrw;
  const totalReturnPct = totalCostKrw > 0 ? (totalProfitKrw / totalCostKrw) * 100 : 0;
  await ensureTodaySnapshot(totalValueKrw, totalCostKrw);

  const allocationGroups = ["KR", "US"]
    .map((region) => {
      const items = rows.filter((h) => h.region === region);
      return {
        category: REGION_LABEL[region],
        subtotal: items.reduce((s, h) => s + h.valueKrw, 0),
        items: items.map((h) => ({ name: h.name, amount: h.valueKrw })),
      };
    })
    .filter((g) => g.items.length > 0);

  return (
    <BlurGate>
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">포트폴리오</h1>
          <p className="text-sm text-slate-500 mt-0.5">보유 종목과 비중을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportHoldingsDialog />
          <HoldingFormDialog />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">총 평가금액 (KRW 환산)</div>
          <div className="text-2xl font-bold text-slate-900">{formatKrw(totalValueKrw)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">총 평가손익</div>
          <div
            className={`text-2xl font-bold ${
              totalProfitKrw > 0 ? "text-red-600" : totalProfitKrw < 0 ? "text-blue-600" : "text-slate-900"
            }`}
          >
            {formatSignedKrw(totalProfitKrw)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{formatSignedPct(totalReturnPct)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">보유 종목 수</div>
          <div className="text-2xl font-bold text-slate-900">{holdings.length}개</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">실시간 환율 (USD/KRW)</div>
          <div className="text-2xl font-bold text-slate-900">{formatKrw(usdKrwRate)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTimeKorean(quotedAt)} 기준 시세조회</div>
        </div>
      </div>

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">보유 비중</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <CategoryPieChart title="보유 비중" groups={allocationGroups} />
        </div>
      </section>

      <PortfolioMoversSection krReport={krMoversReport} usReport={usMoversReport} />

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">보유 종목</h2>
        <HoldingsTable holdings={rows} />
      </section>
    </div>
    </BlurGate>
  );
}
