import type { PortfolioMoversReport, Region } from "./types";
import { getPortfolioMoversCollection } from "./mongo";

// Mongo 문서 → PortfolioMoversReport 타입으로 변환 (_id, createdAt, expiresAt 등 저장용 메타 필드 제거)
function toReport(doc: Record<string, unknown>): PortfolioMoversReport {
  const { market, date, generatedAt, gainers, losers } = doc;
  return { market, date, generatedAt, gainers, losers } as unknown as PortfolioMoversReport;
}

/** 포트폴리오 탭에 표시할 시장별 최신 리포트. 없으면 null (mock 폴백 없음 — 아직 파이프라인이 안 돌았을 수 있음). */
export async function getLatestPortfolioMoversReport(market: Region): Promise<PortfolioMoversReport | null> {
  const collection = await getPortfolioMoversCollection();
  if (!collection) return null;

  const doc = await collection.find({ market }).sort({ date: -1 }).limit(1).next();
  return doc ? toReport(doc) : null;
}

// 파이프라인(portfolio_movers_writer.py)이 시장별 최신 5일치만 보관하므로, 조회 쪽도 동일한
// 상한을 명시적으로 걸어 UI가 항상 "시장별 최근 5일" 범위를 벗어나지 않도록 한다.
const KEEP_DATES_PER_MARKET = 5;

/** Reports 탭 목록용 — 시장별 최신 5일치를 각각 최신순으로 가져온다. */
export async function listPortfolioMoversReports(): Promise<PortfolioMoversReport[]> {
  const collection = await getPortfolioMoversCollection();
  if (!collection) return [];

  const markets: Region[] = ["KR", "US"];
  const perMarket = await Promise.all(
    markets.map((market) =>
      collection
        .find({ market })
        .sort({ generatedAt: -1 })
        .limit(KEEP_DATES_PER_MARKET)
        .toArray(),
    ),
  );
  return perMarket.flat().map(toReport);
}

/** Reports 상세 페이지용 — 특정 시장/일자 리포트. */
export async function getPortfolioMoversReport(market: Region, date: string): Promise<PortfolioMoversReport | null> {
  const collection = await getPortfolioMoversCollection();
  if (!collection) return null;

  const doc = await collection.findOne({ market, date });
  return doc ? toReport(doc) : null;
}
