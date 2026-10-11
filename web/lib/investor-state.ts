import type { InvestorFxConversion, InvestorHolding, InvestorTransaction } from "@/app/generated/prisma/client";
import { prisma } from "./db";
import { toKrw } from "./fx";
import { sleeveSeedKrw, type InvestorSettings } from "./investor-settings";
import { fetchKrQuote, fetchUsQuote } from "./quotes";
import type { Region } from "./types";

export const INVESTOR_REGIONS: Region[] = ["KR", "US"];

export function currencyOf(region: Region | string): "KRW" | "USD" {
  return region === "US" ? "USD" : "KRW";
}

export type InvestorTransactionWithRegion = Pick<InvestorTransaction, "type" | "quantity" | "price"> & {
  holding: Pick<InvestorHolding, "region">;
};

/** 현금 계산에 필요한 원장 전체. web/app/api/investor/state/route.ts(파이프라인용),
 *  web/app/investor/page.tsx(화면용), web/lib/investor-execution.ts(모의 체결)가 공유한다.
 *  holdings는 quantity=0(전량 매도분)까지 포함하므로 화면 표시용으론 호출부에서 걸러야 한다. */
export async function fetchInvestorLedger() {
  const [holdings, transactions, fxConversions] = await Promise.all([
    prisma.investorHolding.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.investorTransaction.findMany({ include: { holding: { select: { region: true } } } }),
    prisma.investorFxConversion.findMany(),
  ]);
  return { holdings, transactions, fxConversions };
}

export interface InvestorCash {
  /** 한국 슬리브 가용 현금(원). */
  krCashKrw: number;
  /** 미국 슬리브 중 아직 환전하지 않은 원화 대기자금(원). */
  usKrwReserve: number;
  /** 미국 슬리브 달러 현금. */
  usCashUsd: number;
}

function netInvested(transactions: InvestorTransactionWithRegion[], region: Region): number {
  return transactions
    .filter((t) => t.holding.region === region)
    .reduce((sum, t) => sum + (t.type === "BUY" ? 1 : -1) * t.quantity * t.price, 0);
}

/** 시장별 슬리브 시드금액에서 순매수금액(매수-매도 누적)과 환전 내역을 반영한 가용 현금.
 *  한국 슬리브는 원화로만, 미국 슬리브는 "원화 대기자금 → (환전) → 달러 현금 → 매수" 흐름으로 움직인다.
 *  거래 가격(price)은 종목 통화 기준이므로 KR 거래는 원, US 거래는 달러로 합산된다. */
export function computeInvestorCash(
  settings: Pick<InvestorSettings, "seedCapitalKrw" | "usAllocationPct">,
  transactions: InvestorTransactionWithRegion[],
  fxConversions: Pick<InvestorFxConversion, "direction" | "krwAmount" | "usdAmount">[]
): InvestorCash {
  let krwToUsdKrw = 0;
  let netUsdFromFx = 0;
  for (const c of fxConversions) {
    const sign = c.direction === "KRW_TO_USD" ? 1 : -1;
    krwToUsdKrw += sign * c.krwAmount;
    netUsdFromFx += sign * c.usdAmount;
  }

  return {
    krCashKrw: sleeveSeedKrw(settings, "KR") - netInvested(transactions, "KR"),
    usKrwReserve: sleeveSeedKrw(settings, "US") - krwToUsdKrw,
    usCashUsd: netUsdFromFx - netInvested(transactions, "US"),
  };
}

/** 슬리브 가용 현금을 해당 시장 통화로 환산한 값 — 비중 계산/매수 가능금액의 기준.
 *  미국 슬리브는 달러 현금 + 원화 대기자금(현재 환율로 환전했다고 가정)이다. */
export function sleeveCashNative(cash: InvestorCash, region: Region, usdKrwRate: number): number {
  return region === "US" ? cash.usCashUsd + cash.usKrwReserve / usdKrwRate : cash.krCashKrw;
}

export type InvestorHoldingValuation = InvestorHolding & {
  /** 종목 통화(KR=원, US=달러) 기준 평가/매입금액. */
  valueNative: number;
  costNative: number;
  valueKrw: number;
  costKrw: number;
  returnPct: number;
  isLive: boolean;
  livePrice: number | null;
};

/** web/lib/portfolio-valuation.ts와 동일하게 region별로 시세 API를 분기한다. 시세 조회 실패 시
 *  평단가로 폴백한다(isLive: false). 미국 종목의 원화 환산은 매입금액·평가금액 모두 현재 환율을
 *  쓰므로 returnPct는 달러 기준 종목 수익률이다 — 환차손익은 슬리브 단위 수익률(시드 대비)에 반영된다. */
export async function getLiveInvestorValuations(
  holdings: InvestorHolding[],
  usdKrwRate: number
): Promise<InvestorHoldingValuation[]> {
  const quotes = await Promise.allSettled(
    holdings.map((h) => (h.region === "US" ? fetchUsQuote(h.ticker) : fetchKrQuote(h.ticker)))
  );

  return holdings.map((h, i) => {
    const result = quotes[i];
    const livePrice = result.status === "fulfilled" ? result.value : null;
    const valueNative = (livePrice ?? h.avgPrice) * h.quantity;
    const costNative = h.avgPrice * h.quantity;
    const valueKrw = toKrw(valueNative, h.currency, usdKrwRate);
    const costKrw = toKrw(costNative, h.currency, usdKrwRate);
    const returnPct = costNative > 0 ? ((valueNative - costNative) / costNative) * 100 : 0;
    return { ...h, valueNative, costNative, valueKrw, costKrw, returnPct, isLive: livePrice != null, livePrice };
  });
}

export interface InvestorSleeveSummary {
  region: Region;
  seedKrw: number;
  holdingsValueKrw: number;
  holdingsCostKrw: number;
  /** 슬리브 현금 전체의 원화 환산액 (미국은 달러 현금 + 원화 대기자금). */
  cashKrw: number;
  totalValueKrw: number;
  /** 슬리브 시드 대비 누적 수익률(%). 미국은 환차손익 포함. 시드가 0이면 null. */
  returnPct: number | null;
}

export function summarizeSleeve(
  region: Region,
  valuations: InvestorHoldingValuation[],
  cash: InvestorCash,
  usdKrwRate: number,
  settings: Pick<InvestorSettings, "seedCapitalKrw" | "usAllocationPct">
): InvestorSleeveSummary {
  const own = valuations.filter((v) => v.region === region);
  const holdingsValueKrw = own.reduce((sum, v) => sum + v.valueKrw, 0);
  const holdingsCostKrw = own.reduce((sum, v) => sum + v.costKrw, 0);
  const cashKrw = region === "US" ? cash.usKrwReserve + cash.usCashUsd * usdKrwRate : cash.krCashKrw;
  const totalValueKrw = holdingsValueKrw + cashKrw;
  const seedKrw = sleeveSeedKrw(settings, region);
  const returnPct = seedKrw > 0 ? ((totalValueKrw - seedKrw) / seedKrw) * 100 : null;
  return { region, seedKrw, holdingsValueKrw, holdingsCostKrw, cashKrw, totalValueKrw, returnPct };
}
