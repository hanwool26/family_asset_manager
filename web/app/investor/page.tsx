import Link from "next/link";
import { prisma } from "@/lib/db";
import BlurGate from "@/components/BlurGate";
import InvestorMarketTabs from "@/components/InvestorMarketTabs";
import InvestorPerformanceSection from "@/components/InvestorPerformanceSection";
import InvestorSettingsDialog from "@/components/InvestorSettingsDialog";
import InvestorSleeveSection from "@/components/InvestorSleeveSection";
import KakaoNotifySettingsDialog from "@/components/KakaoNotifySettingsDialog";
import { ensureTodayInvestorSnapshot } from "./actions";
import { formatDateOnlyISO } from "@/lib/date";
import { FALLBACK_USD_KRW_RATE } from "@/lib/fx";
import { formatKrw, formatSignedPct } from "@/lib/format";
import { getInvestorSettings } from "@/lib/investor-settings";
import {
  computeInvestorCash,
  fetchInvestorLedger,
  getLiveInvestorValuations,
  summarizeSleeve,
} from "@/lib/investor-state";
import { getKakaoConnectionStatus, isKakaoConfigured } from "@/lib/kakao";
import { fetchUsdKrwRate } from "@/lib/quotes";
import type { Region } from "@/lib/types";

export const dynamic = "force-dynamic";

// 시장별 이번 주 제안(1건) + 히스토리 모달에 노출할 지난 제안 최대 5건.
const PROPOSALS_PER_REGION = 6;

function fetchProposals(region: Region) {
  return prisma.investorProposal.findMany({
    where: { region },
    orderBy: { createdAt: "desc" },
    take: PROPOSALS_PER_REGION,
    include: { items: true },
  });
}

export default async function InvestorPage({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const { market } = await searchParams;
  const initialRegion: Region = market === "US" ? "US" : "KR";

  const [ledger, settings, krProposals, usProposals, snapshots, kakaoStatus, liveRate] = await Promise.all([
    fetchInvestorLedger(),
    getInvestorSettings(),
    fetchProposals("KR"),
    fetchProposals("US"),
    prisma.investorSnapshot.findMany({ orderBy: { date: "asc" } }),
    getKakaoConnectionStatus(),
    fetchUsdKrwRate(),
  ]);
  const usdKrwRate = liveRate ?? FALLBACK_USD_KRW_RATE;

  // 전량 매도(EXIT) 종목은 거래내역 보존을 위해 삭제하지 않고 quantity=0으로 남겨두므로
  // (web/lib/investor-execution.ts 참고) 화면에 표시할 현재 보유종목에선 걸러야 한다.
  const holdings = ledger.holdings.filter((h) => h.quantity > 0);
  const valuations = await getLiveInvestorValuations(holdings, usdKrwRate);
  const cash = computeInvestorCash(settings, ledger.transactions, ledger.fxConversions);

  const krSummary = summarizeSleeve("KR", valuations, cash, usdKrwRate, settings);
  const usSummary = summarizeSleeve("US", valuations, cash, usdKrwRate, settings);
  const totalValueKrw = krSummary.totalValueKrw + usSummary.totalValueKrw;
  const totalReturnPct =
    settings.seedCapitalKrw > 0 ? ((totalValueKrw - settings.seedCapitalKrw) / settings.seedCapitalKrw) * 100 : 0;
  const actualUsPct = totalValueKrw > 0 ? (usSummary.totalValueKrw / totalValueKrw) * 100 : 0;

  // 기간별 수익률 계산의 기준값을 오늘 날짜로 쌓는다(하루 1건, 같은 날 재방문 시 최신값으로 갱신).
  // 실패해도 화면 렌더링 자체는 막지 않는다 — 다음 방문 때 다시 시도하면 된다.
  await ensureTodayInvestorSnapshot(totalValueKrw).catch(() => {});

  // 위에서 upsert한 오늘자 스냅샷을 다시 조회하는 대신, 이미 계산해둔 totalValueKrw로 오늘 포인트를 덧붙인다.
  const todayISO = formatDateOnlyISO(new Date());
  const pastTrendPoints = snapshots
    .filter((s) => formatDateOnlyISO(s.date) !== todayISO)
    .map((s) => ({ date: formatDateOnlyISO(s.date), netWorth: s.totalValueKrw }));
  const trendPoints = [...pastTrendPoints, { date: todayISO, netWorth: totalValueKrw }];

  const [krLatest, ...krPast] = krProposals;
  const [usLatest, ...usPast] = usProposals;

  return (
    <BlurGate>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Investor</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              뉴스·기술지표 기반 AI가 매주 한국/미국 주식 리밸런싱을 제안하고, 승인해야 반영되는 반자동 장기
              포트폴리오입니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/investor/strategy"
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              📖 전략 설명
            </Link>
            <KakaoNotifySettingsDialog configured={isKakaoConfigured()} status={kakaoStatus} />
            <InvestorSettingsDialog settings={settings} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">총 평가금액 (한국+미국, 현금 포함)</div>
            <div className="text-2xl font-bold text-slate-900">{formatKrw(totalValueKrw)}</div>
            <div
              className={`text-[11px] mt-0.5 ${
                totalReturnPct > 0 ? "text-red-600" : totalReturnPct < 0 ? "text-blue-600" : "text-slate-400"
              }`}
            >
              시드 {formatKrw(settings.seedCapitalKrw)} 대비 {formatSignedPct(totalReturnPct)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">시장별 배분 (현재 / 목표)</div>
            <div className="text-sm font-semibold text-slate-700">
              🇰🇷 한국 {(100 - actualUsPct).toFixed(1)}% / {100 - settings.usAllocationPct}%
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">
              🇺🇸 미국 {actualUsPct.toFixed(1)}% / {settings.usAllocationPct}%
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="bg-slate-700" style={{ width: `${100 - actualUsPct}%` }} />
              <div className="bg-blue-400" style={{ width: `${actualUsPct}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-400 mb-1">USD/KRW 환율</div>
            <div className="text-2xl font-bold text-slate-900">
              {usdKrwRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
              <span className="text-sm font-normal text-slate-400">원</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {liveRate != null ? "실시간 (미국 슬리브 원화 환산에 사용)" : "⚠️ 실시간 조회 실패 — 폴백 환율로 표시 중"}
            </div>
          </div>
        </div>

        <InvestorPerformanceSection
          snapshots={snapshots}
          totalValueKrw={totalValueKrw}
          seedCapitalKrw={settings.seedCapitalKrw}
          trendPoints={trendPoints}
        />

        <InvestorMarketTabs
          initialRegion={initialRegion}
          tabs={[
            {
              region: "KR",
              label: "🇰🇷 한국 주식",
              badge: `${100 - settings.usAllocationPct}%`,
              content: (
                <InvestorSleeveSection
                  summary={krSummary}
                  valuations={valuations.filter((v) => v.region === "KR")}
                  latestProposal={krLatest}
                  pastProposals={krPast}
                  settings={settings}
                />
              ),
            },
            {
              region: "US",
              label: "🇺🇸 미국 주식",
              badge: `${settings.usAllocationPct}%`,
              content: (
                <InvestorSleeveSection
                  summary={usSummary}
                  valuations={valuations.filter((v) => v.region === "US")}
                  latestProposal={usLatest}
                  pastProposals={usPast}
                  settings={settings}
                  usd={{ usdKrwRate, usdCash: cash.usCashUsd, krwReserve: cash.usKrwReserve }}
                />
              ),
            },
          ]}
        />
      </div>
    </BlurGate>
  );
}
