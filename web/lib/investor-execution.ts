import { prisma } from "@/lib/db";
import { fetchKrQuote } from "@/lib/quotes";
import { getInvestorSettings } from "@/lib/investor-settings";
import { computeCashKrw } from "@/lib/investor-state";
import type { InvestorProposal, InvestorProposalItem } from "@/app/generated/prisma/client";

// AI Investor 페이퍼 트레이딩(모의 체결) 엔진.
//
// Phase C(토스 실주문 연동)가 붙기 전까지, 제안 승인 시 "실제로 그 비중대로 매매했다면"을
// 그 날 실시간 시세로 모의 체결해 InvestorHolding/InvestorTransaction에 반영한다. 이렇게 해야
// dry-run을 몇 주~몇 달 돌리며 "AI Investor를 실제로 따라갔다면 수익률이 어땠을지"를 검증할 수 있다
// (실계좌 투입 전 검증이 이번 기능의 원래 목적).
//
// **주의**: 이건 시뮬레이션이지 실제 토스 주문이 아니다. Phase C에서는 아래 매수/매도 판단 로직은
// 그대로 두고, DB 반영 부분만 pipeline/broker/toss_client.place_order 호출 결과로 교체하면 된다.

// 델타가 이 금액(원) 미만이면 체결하지 않는다 — 수수료 대비 무의미한 소액 매매(더스트) 방지.
const MIN_TRADE_KRW = 10_000;
// 제안에 포함된 종목 중 이 비율 이상 시세 조회에 실패하면, 불완전한 데이터로 절반만 체결하는
// 대신 이번 회차 전체를 중단한다 (실거래와 연결되는 로직이므로 "일부만 이상하게 도는" 것보다
// "아예 안 도는" 게 안전하다).
const PRICE_FAILURE_ABORT_RATIO = 0.3;

interface ExecutionResult {
  executedCount: number;
  skippedCount: number;
  failedCount: number;
  circuitBreakerTriggered: boolean;
  aborted: boolean;
  abortReason?: string;
}

export async function executeProposalPaper(
  proposal: InvestorProposal & { items: InvestorProposalItem[] }
): Promise<ExecutionResult> {
  const [settings, holdings, transactions] = await Promise.all([
    getInvestorSettings(),
    prisma.investorHolding.findMany(),
    prisma.investorTransaction.findMany(),
  ]);

  let cashKrw = computeCashKrw(settings.seedCapitalKrw, transactions);
  const holdingByTicker = new Map(holdings.map((h) => [h.ticker, h]));

  // 비중 계산의 분모(총 평가금액)는 이 제안에 없는 기존 보유종목도 포함해야 하므로 전부 시세 조회한다.
  const tickers = Array.from(new Set([...holdings.map((h) => h.ticker), ...proposal.items.map((i) => i.ticker)]));
  const priceEntries = await Promise.all(tickers.map(async (t) => [t, await fetchKrQuote(t)] as const));
  const priceByTicker = new Map(priceEntries);

  // 서킷브레이커 1: 제안에 포함된 종목의 시세 조회 실패율이 너무 높으면 전체 중단.
  const itemTickers = Array.from(new Set(proposal.items.map((i) => i.ticker)));
  const failedItemTickers = itemTickers.filter((t) => !priceByTicker.get(t));
  if (itemTickers.length > 0 && failedItemTickers.length / itemTickers.length >= PRICE_FAILURE_ABORT_RATIO) {
    await prisma.investorProposal.update({ where: { id: proposal.id }, data: { status: "FAILED", decidedAt: new Date() } });
    return {
      executedCount: 0,
      skippedCount: 0,
      failedCount: proposal.items.length,
      circuitBreakerTriggered: false,
      aborted: true,
      abortReason: `시세 조회 실패율이 너무 높아(${failedItemTickers.join(", ")}) 이번 회차 체결을 전체 중단했습니다.`,
    };
  }

  const holdingsValueKrw = holdings.reduce((sum, h) => {
    const price = priceByTicker.get(h.ticker) ?? h.avgPrice;
    return sum + price * h.quantity;
  }, 0);
  const totalValueKrw = cashKrw + holdingsValueKrw;

  // 서킷브레이커 2: 시드금액 대비 손실률이 기준을 넘으면 신규 매수(NEW_BUY/ADD)는 막고
  // 매도(TRIM/EXIT)는 계속 허용한다 — 위험은 줄이되 추가로 키우진 않는 방향.
  const drawdownPct =
    settings.seedCapitalKrw > 0 ? ((settings.seedCapitalKrw - totalValueKrw) / settings.seedCapitalKrw) * 100 : 0;
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
      const currentValueKrw = currentQty * price;
      const targetValueKrw = item.action === "EXIT" ? 0 : (item.targetWeightPct / 100) * totalValueKrw;
      const deltaValueKrw = targetValueKrw - currentValueKrw;

      if (item.action !== "EXIT" && Math.abs(deltaValueKrw) < MIN_TRADE_KRW) {
        await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
        skippedCount++;
        continue;
      }

      if (deltaValueKrw > 0) {
        if (buysBlocked) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        // 매수: 가용 현금을 넘지 않게 클램프하고, KRX는 1주 단위 거래이므로 내림 처리한다.
        const affordableValueKrw = Math.min(deltaValueKrw, cashKrw);
        const buyQty = Math.floor(affordableValueKrw / price);
        if (buyQty <= 0) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        const cost = buyQty * price;
        cashKrw -= cost;
        const newQty = currentQty + buyQty;
        // existing이 quantity=0(과거 전량 매도분)이어도 식이 그대로 새 매입가로 수렴한다.
        const newAvgPrice = existing ? (currentQty * existing.avgPrice + cost) / newQty : price;

        const holding = await tx.investorHolding.upsert({
          where: { ticker: item.ticker },
          create: { ticker: item.ticker, name: item.name, quantity: buyQty, avgPrice: price, currency: "KRW" },
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
        if (!existing || currentQty <= 0) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        const sellQty =
          item.action === "EXIT"
            ? currentQty
            : Math.min(Math.floor(Math.abs(deltaValueKrw) / price), currentQty);
        if (sellQty <= 0) {
          await tx.investorProposalItem.update({ where: { id: item.id }, data: { orderStatus: "SKIPPED" } });
          skippedCount++;
          continue;
        }
        const proceeds = sellQty * price;
        cashKrw += proceeds;
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
