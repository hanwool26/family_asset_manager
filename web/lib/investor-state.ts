import type { InvestorHolding, InvestorTransaction } from "@/app/generated/prisma/client";
import { fetchKrQuote } from "./quotes";

/** 시드금액에서 순매수금액(매수-매도 누적)을 뺀 가용 현금.
 *  web/app/api/investor/state/route.ts(파이프라인용)와 web/app/investor/page.tsx(화면용)가 공유한다. */
export function computeCashKrw(
  seedCapitalKrw: number,
  transactions: Pick<InvestorTransaction, "type" | "quantity" | "price">[]
): number {
  const netInvested = transactions.reduce((sum, t) => {
    const amount = t.quantity * t.price;
    return sum + (t.type === "BUY" ? amount : -amount);
  }, 0);
  return seedCapitalKrw - netInvested;
}

export type InvestorHoldingValuation = InvestorHolding & {
  valueKrw: number;
  costKrw: number;
  returnPct: number;
  isLive: boolean;
  livePrice: number | null;
};

/** 1차 범위(국내 KRX 전용)라 fetchKrQuote만 사용한다. 해외로 확장되면
 *  web/lib/portfolio-valuation.ts처럼 region 분기가 필요해진다. */
export async function getLiveInvestorValuations(
  holdings: InvestorHolding[]
): Promise<InvestorHoldingValuation[]> {
  const quotes = await Promise.allSettled(holdings.map((h) => fetchKrQuote(h.ticker)));

  return holdings.map((h, i) => {
    const result = quotes[i];
    const livePrice = result.status === "fulfilled" ? result.value : null;
    const valueKrw = livePrice != null ? livePrice * h.quantity : h.avgPrice * h.quantity;
    const costKrw = h.quantity * h.avgPrice;
    const returnPct = costKrw > 0 ? ((valueKrw - costKrw) / costKrw) * 100 : 0;
    return { ...h, valueKrw, costKrw, returnPct, isLive: livePrice != null, livePrice };
  });
}
