import { prisma } from "@/lib/db";
import { fetchKrQuote, fetchUsdKrwRate, fetchUsQuote } from "@/lib/quotes";
import { getInvestorSettings, sleeveSeedKrw } from "@/lib/investor-settings";
import { computeInvestorCash, currencyOf, fetchInvestorLedger } from "@/lib/investor-state";
import type { Region } from "@/lib/types";
import type { InvestorProposal, InvestorProposalItem } from "@/app/generated/prisma/client";

// AI Investor 페이퍼 트레이딩(모의 체결) 엔진.
//
// Phase C(토스 실주문 연동)가 붙기 전까지, 제안 승인 시 "실제로 그 비중대로 매매했다면"을
// 그 날 실시간 시세로 모의 체결해 InvestorHolding/InvestorTransaction에 반영한다. 이렇게 해야
// dry-run을 몇 주~몇 달 돌리며 "AI Investor를 실제로 따라갔다면 수익률이 어땠을지"를 검증할 수 있다
// (실계좌 투입 전 검증이 이번 기능의 원래 목적).
//
// 제안은 시장별(proposal.region)로 따로 생성되며, 비중의 분모는 해당 시장 슬리브의 평가금액이다.
// 금액 계산은 전부 슬리브 통화(KR=원, US=달러) 기준으로 하고, 원화 기준 임계값(더스트/서킷브레이커)만
// 환율로 환산해 비교한다. 미국 슬리브에서 매수할 달러가 부족하면 원화 대기자금에서 부족분만큼만
// 그 시점 환율로 자동 환전(InvestorFxConversion, source=AUTO)한다.
//
// **주의**: 이건 시뮬레이션이지 실제 토스 주문이 아니다. Phase C에서는 아래 매수/매도 판단 로직은
// 그대로 두고, DB 반영 부분만 pipeline/broker/toss_client.place_order 호출 결과로 교체하면 된다.

// 델타가 이 금액(원) 미만이면 체결하지 않는다 — 수수료 대비 무의미한 소액 매매(더스트) 방지.
const MIN_TRADE_KRW = 10_000;
// 제안에 포함된 종목 중 이 비율 이상 시세 조회에 실패하면, 불완전한 데이터로 절반만 체결하는
// 대신 이번 회차 전체를 중단한다 (실거래와 연결되는 로직이므로 "일부만 이상하게 도는" 것보다
// "아예 안 도는" 게 안전하다).
const PRICE_FAILURE_ABORT_RATIO = 0.3;
// 부동소수점 오차로 생기는 1센트 미만 잔여 부족분은 환전하지 않는다.
const USD_EPSILON = 0.005;

interface ExecutionResult {
  executedCount: number;
  skippedCount: number;
  failedCount: number;
  circuitBreakerTriggered: boolean;
  aborted: boolean;
  abortReason?: string;
}

async function markFailed(
  proposal: InvestorProposal & { items: InvestorProposalItem[] },
  abortReason: string
): Promise<ExecutionResult> {
  await prisma.investorProposal.update({ where: { id: proposal.id }, data: { status: "FAILED", decidedAt: new Date() } });
  return {
    executedCount: 0,
    skippedCount: 0,
    failedCount: proposal.items.length,
    circuitBreakerTriggered: false,
    aborted: true,
    abortReason,
  };
}

export async function executeProposalPaper(
  proposal: InvestorProposal & { items: InvestorProposalItem[] }
): Promise<ExecutionResult> {
  const region: Region = proposal.region === "US" ? "US" : "KR";
  const currency = currencyOf(region);
  const fetchQuote = region === "US" ? fetchUsQuote : fetchKrQuote;

  const [settings, ledger, liveRate] = await Promise.all([
    getInvestorSettings(),
    fetchInvestorLedger(),
    region === "US" ? fetchUsdKrwRate() : Promise.resolve(1),
  ]);

  // 미국 슬리브는 환율 없이 체결하면 원화 환산·자동 환전이 전부 틀어진다 — 폴백 환율(web/lib/fx.ts)로
  // 대충 체결하지 않고 이번 회차를 중단한다.
  if (liveRate == null) {
    return markFailed(proposal, "실시간 USD/KRW 환율 조회에 실패해 이번 회차 체결을 전체 중단했습니다.");
  }
  // KR 슬리브는 원화 그대로(환율 1)로 계산한다.
  const krwPerUnit = liveRate;

  const cash = computeInvestorCash(settings, ledger.transactions, ledger.fxConversions);
  // 슬리브 통화 기준 현금. 미국은 달러 현금과 원화 대기자금을 분리해서 추적한다(매수 시 부족분만 환전).
  let cashNative = region === "US" ? cash.usCashUsd : cash.krCashKrw;
  let krwReserve = region === "US" ? cash.usKrwReserve : 0;

  const holdings = ledger.holdings.filter((h) => h.region === region);
  const holdingByTicker = new Map(holdings.map((h) => [h.ticker, h]));

  // 비중 계산의 분모(슬리브 총 평가금액)는 이 제안에 없는 기존 보유종목도 포함해야 하므로 전부 시세 조회한다.
  const tickers = Array.from(new Set([...holdings.map((h) => h.ticker), ...proposal.items.map((i) => i.ticker)]));
  const priceEntries = await Promise.all(tickers.map(async (t) => [t, await fetchQuote(t)] as const));
  const priceByTicker = new Map(priceEntries);

  // 서킷브레이커 1: 제안에 포함된 종목의 시세 조회 실패율이 너무 높으면 전체 중단.
  const itemTickers = Array.from(new Set(proposal.items.map((i) => i.ticker)));
  const failedItemTickers = itemTickers.filter((t) => !priceByTicker.get(t));
  if (itemTickers.length > 0 && failedItemTickers.length / itemTickers.length >= PRICE_FAILURE_ABORT_RATIO) {
    return markFailed(
      proposal,
      `시세 조회 실패율이 너무 높아(${failedItemTickers.join(", ")}) 이번 회차 체결을 전체 중단했습니다.`
    );
  }

  const holdingsValueNative = holdings.reduce((sum, h) => {
    const price = priceByTicker.get(h.ticker) ?? h.avgPrice;
    return sum + price * h.quantity;
  }, 0);
  const totalValueNative = cashNative + krwReserve / krwPerUnit + holdingsValueNative;

  // 서킷브레이커 2: 슬리브 시드금액 대비 손실률이 기준을 넘으면 신규 매수(NEW_BUY/ADD)는 막고
  // 매도(TRIM/EXIT)는 계속 허용한다 — 위험은 줄이되 추가로 키우진 않는 방향. 미국은 환차손익 포함.
  const seedKrw = sleeveSeedKrw(settings, region);
  const totalValueKrw = totalValueNative * krwPerUnit;
  const drawdownPct = seedKrw > 0 ? ((seedKrw - totalValueKrw) / seedKrw) * 100 : 0;
  const buysBlocked = drawdownPct >= settings.circuitBreakerLossPct;

  let executedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // 매도(TRIM/EXIT)를 먼저 체결해 현금을 확보한 뒤 매수를 처리해야, 같은 배치 안에서 "이 종목 팔아서
  // 저 종목 사기" 같은 리밸런싱이 현금 부족으로 막히지 않는다. 매수끼리는 컨빅션 높은 순으로 우선순위를 둔다.
  const sellFirst = (a: InvestorProposalItem, b: InvestorProposalItem) => {
    const rank = (i: InvestorProposalItem) => (i.action === "EXIT" || i.action === "TRIM" ? 0 : i.action === "HOLD" ? 1 : 2);
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : b.convictionScore - a.convictionScore;
  };
  const orderedItems = [...proposal.items].sort(sellFirst);

  await prisma.$transaction(async (tx) => {
    for (const item of orderedItems) {
      if (item.action === "HOLD") {
        await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
        skippedCount++;
        continue;
      }

      const price = priceByTicker.get(item.ticker);
      if (!price) {
        await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "FAILED" } });
        failedCount++;
        continue;
      }

      const existing = holdingByTicker.get(item.ticker);
      const currentQty = existing?.quantity ?? 0;
      const currentValueNative = currentQty * price;
      const targetValueNative = item.action === "EXIT" ? 0 : (item.targetWeightPct / 100) * totalValueNative;
      const deltaValueNative = targetValueNative - currentValueNative;

      if (item.action !== "EXIT" && Math.abs(deltaValueNative) * krwPerUnit < MIN_TRADE_KRW) {
        await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
        skippedCount++;
        continue;
      }

      if (deltaValueNative > 0) {
        if (buysBlocked) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        // 매수: 가용 현금(미국은 환전 가능한 원화 대기자금 포함)을 넘지 않게 클램프하고, 1주 단위로 내림 처리한다
        // (KRX는 소수점 거래 불가, 미국은 소수점 거래가 가능하지만 실주문 연동 시 단순화를 위해 동일하게 정수 주).
        const spendableNative = cashNative + krwReserve / krwPerUnit;
        const affordableValueNative = Math.min(deltaValueNative, spendableNative);
        const buyQty = Math.floor(affordableValueNative / price);
        if (buyQty <= 0) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        const cost = buyQty * price;

        // 미국: 달러 현금이 부족하면 부족분만큼만 원화 대기자금에서 자동 환전한다.
        const shortfallUsd = region === "US" ? cost - cashNative : 0;
        if (shortfallUsd > USD_EPSILON) {
          const krwAmount = Math.min(shortfallUsd * krwPerUnit, krwReserve);
          await tx.investorFxConversion.create({
            data: {
              direction: "KRW_TO_USD",
              krwAmount,
              usdAmount: shortfallUsd,
              rate: krwPerUnit,
              source: "AUTO",
              proposalId: proposal.id,
              executedAt: new Date(),
            },
          });
          krwReserve -= krwAmount;
          cashNative += shortfallUsd;
        }

        cashNative -= cost;
        const newQty = currentQty + buyQty;
        // existing이 quantity=0(과거 전량 매도분)이어도 식이 그대로 새 매입가로 수렴한다.
        const newAvgPrice = existing ? (currentQty * existing.avgPrice + cost) / newQty : price;

        const holding = await tx.investorHolding.upsert({
          where: { ticker: item.ticker },
          create: { ticker: item.ticker, name: item.name, region, quantity: buyQty, avgPrice: price, currency },
          update: { quantity: newQty, avgPrice: newAvgPrice },
        });
        await tx.investorTransaction.create({
          data: {
            holdingId: holding.id,
            type: "BUY",
            quantity: buyQty,
            price,
            proposalItemId: item.id,
            executedAt: new Date(),
          },
        });
        holdingByTicker.set(item.ticker, holding);
        await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "FILLED" } });
        executedCount++;
      } else {
        // 매도: 보유 수량을 넘지 않게 클램프. EXIT는 델타 계산과 무관하게 전량 매도한다.
        // 미국 매도대금은 달러 현금으로 남는다(자동으로 원화로 되돌리지 않음 — 원화 환전은 수동 판단).
        if (!existing || currentQty <= 0) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        const sellQty =
          item.action === "EXIT"
            ? currentQty
            : Math.min(Math.floor(Math.abs(deltaValueNative) / price), currentQty);
        if (sellQty <= 0) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        const proceeds = sellQty * price;
        cashNative += proceeds;
        const remainingQty = currentQty - sellQty;

        await tx.investorTransaction.create({
          data: {
            holdingId: existing.id,
            type: "SELL",
            quantity: sellQty,
            price,
            proposalItemId: item.id,
            executedAt: new Date(),
          },
        });
        // 삭제하지 않고 quantity=0으로 남긴다 — InvestorTransaction이 InvestorHolding에
        // onDelete: Cascade로 걸려있어, 행을 삭제하면 방금 기록한 매도 내역까지 함께
        // 사라져 현금/손익 이력이 깨진다. 표시할 땐 quantity>0 필터로 걸러낸다.
        const updated = await tx.investorHolding.update({
          where: { id: existing.id },
          data: { quantity: Math.max(0, remainingQty) },
        });
        holdingByTicker.set(item.ticker, updated);
        await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "FILLED" } });
        executedCount++;
      }
    }

    await tx.investorProposal.update({
      where: { id: proposal.id },
      data: { status: "EXECUTED", decidedAt: new Date() },
    });
  });

  return { executedCount, skippedCount, failedCount, circuitBreakerTriggered: buysBlocked, aborted: false };
}
