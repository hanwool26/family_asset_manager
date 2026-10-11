"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getInvestorSettings, saveInvestorSettings } from "@/lib/investor-settings";
import { executeProposalPaper } from "@/lib/investor-execution";
import { computeInvestorCash, fetchInvestorLedger } from "@/lib/investor-state";
import { fetchUsdKrwRate } from "@/lib/quotes";
import { formatCurrency, formatKrw } from "@/lib/format";

// 승인 시 즉시 페이퍼 트레이딩(모의 체결)한다 — 실계좌 투입 전 "실제로 따라갔다면 어땠을지"를
// 검증하기 위한 시뮬레이션이며, 아직 실제 토스 주문은 아니다 (Phase C: pipeline/broker/toss_client.py의
// place_order가 정확한 스키마로 구현되고 실행 엔진이 붙은 뒤에야 진짜 매매로 이어진다).

export async function approveProposal(proposalId: string): Promise<{ error?: string; warning?: string }> {
  const proposal = await prisma.investorProposal.findUnique({
    where: { id: proposalId },
    include: { items: true },
  });
  if (!proposal) return { error: "제안을 찾을 수 없습니다." };
  if (proposal.status !== "PENDING") return { error: "이미 처리된 제안입니다." };

  const result = await executeProposalPaper(proposal);
  revalidatePath("/investor");

  if (result.aborted) return { error: result.abortReason };
  if (result.circuitBreakerTriggered) {
    return {
      warning:
        "서킷브레이커 발동: 시드금액 대비 손실률이 기준을 넘어 신규 매수는 보류되고, 매도만 반영되었습니다.",
    };
  }
  return {};
}

export async function rejectProposal(proposalId: string): Promise<{ error?: string }> {
  const proposal = await prisma.investorProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) return { error: "제안을 찾을 수 없습니다." };
  if (proposal.status !== "PENDING") return { error: "이미 처리된 제안입니다." };

  await prisma.investorProposal.update({
    where: { id: proposalId },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  revalidatePath("/investor");
  return {};
}

export async function updateInvestorSettings(formData: FormData): Promise<{ error?: string }> {
  const seedCapitalKrw = Number(formData.get("seedCapitalKrw"));
  const usAllocationPct = Number(formData.get("usAllocationPct"));
  const maxPositions = Number(formData.get("maxPositions"));
  const maxWeightPct = Number(formData.get("maxWeightPct"));
  const cashBufferPct = Number(formData.get("cashBufferPct"));
  const maxSectorWeightPct = Number(formData.get("maxSectorWeightPct"));
  const rebalanceBandPct = Number(formData.get("rebalanceBandPct"));
  const circuitBreakerLossPct = Number(formData.get("circuitBreakerLossPct"));

  const allValues = [
    seedCapitalKrw, usAllocationPct, maxPositions, maxWeightPct, cashBufferPct,
    maxSectorWeightPct, rebalanceBandPct, circuitBreakerLossPct,
  ];
  if (!allValues.every(Number.isFinite)) {
    return { error: "모든 값을 숫자로 입력해주세요." };
  }
  if (seedCapitalKrw <= 0) return { error: "시드 금액은 0보다 커야 합니다." };
  if (usAllocationPct < 0 || usAllocationPct > 100) return { error: "미국 주식 배분 비율은 0~100 사이여야 합니다." };
  if (!Number.isInteger(maxPositions) || maxPositions <= 0) return { error: "최대 종목 수는 1 이상의 정수여야 합니다." };
  if (maxWeightPct <= 0 || maxWeightPct > 100) return { error: "종목당 최대 비중은 0~100 사이여야 합니다." };
  if (cashBufferPct < 0 || cashBufferPct >= 100) return { error: "현금 버퍼는 0~100 미만이어야 합니다." };
  if (maxWeightPct > 100 - cashBufferPct) {
    return { error: "종목당 최대 비중이 (100% - 현금 버퍼)보다 클 수 없습니다." };
  }
  if (maxSectorWeightPct < maxWeightPct || maxSectorWeightPct > 100) {
    return { error: "섹터당 최대 비중은 종목당 최대 비중 이상, 100 이하여야 합니다." };
  }
  if (rebalanceBandPct < 0 || rebalanceBandPct > 50) return { error: "리밸런싱 밴드는 0~50%p 사이여야 합니다." };
  if (circuitBreakerLossPct <= 0 || circuitBreakerLossPct > 100) {
    return { error: "서킷브레이커 손실률은 0~100 사이여야 합니다." };
  }

  // 시드금액/배분비율을 바꾸면 각 슬리브의 시드가 바뀐다. 이미 투자(또는 환전)된 금액보다 시드가 작아져
  // 현금이 음수가 되는 변경은 막는다 — 슬리브 간 자금 이동은 "현금으로 남아 있는 부분"만 가능하다.
  // 미국 슬리브는 원화 대기자금만 한국으로 옮길 수 있으므로, 달러 현금은 먼저 원화로 환전해야 한다.
  const ledger = await fetchInvestorLedger();
  const nextCash = computeInvestorCash({ seedCapitalKrw, usAllocationPct }, ledger.transactions, ledger.fxConversions);
  if (nextCash.krCashKrw < 0) {
    return {
      error: `이 설정이면 한국 슬리브 현금이 ${formatKrw(nextCash.krCashKrw)}가 됩니다 (이미 투자된 금액보다 배분이 작음). 한국 비중을 늘리거나 먼저 일부를 매도하세요.`,
    };
  }
  if (nextCash.usKrwReserve < 0) {
    return {
      error: `이 설정이면 미국 슬리브 원화 대기자금이 ${formatKrw(nextCash.usKrwReserve)}가 됩니다 (이미 환전/투자된 금액보다 배분이 작음). 미국 탭에서 달러를 원화로 환전하거나 미국 비중을 늘리세요.`,
    };
  }

  await saveInvestorSettings({
    seedCapitalKrw, usAllocationPct, maxPositions, maxWeightPct, cashBufferPct,
    maxSectorWeightPct, rebalanceBandPct, circuitBreakerLossPct,
  });
  revalidatePath("/investor");
  return {};
}

// 미국 슬리브 수동 환전 (페이퍼 트레이딩 — 실시간 환율로 즉시 체결, 환전 스프레드 미반영).
// 원→달러는 원화 대기자금에서, 달러→원은 달러 현금에서만 가능하며 결과는 계속 미국 슬리브 안에 남는다.
// 환율 조회 실패 시 폴백 환율(web/lib/fx.ts)로 체결하지 않고 거부한다.
export async function convertInvestorFx(formData: FormData): Promise<{ error?: string }> {
  const direction = formData.get("direction");
  const amount = Number(formData.get("amount"));
  if (direction !== "KRW_TO_USD" && direction !== "USD_TO_KRW") return { error: "환전 방향이 올바르지 않습니다." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "환전 금액은 0보다 커야 합니다." };

  const [settings, ledger, rate] = await Promise.all([getInvestorSettings(), fetchInvestorLedger(), fetchUsdKrwRate()]);
  if (rate == null) return { error: "실시간 환율 조회에 실패했습니다. 잠시 후 다시 시도해주세요." };

  const cash = computeInvestorCash(settings, ledger.transactions, ledger.fxConversions);

  // 화면에 표시된 잔액(반올림값)을 그대로 입력해도 통과하도록 1원/1센트 이내 초과는 허용하고 잔액으로 맞춘다.
  let krwAmount: number;
  let usdAmount: number;
  if (direction === "KRW_TO_USD") {
    if (amount > cash.usKrwReserve + 1) {
      return { error: `원화 대기자금(${formatKrw(cash.usKrwReserve)})보다 많이 환전할 수 없습니다.` };
    }
    krwAmount = Math.min(amount, cash.usKrwReserve);
    usdAmount = krwAmount / rate;
  } else {
    if (amount > cash.usCashUsd + 0.01) {
      return { error: `달러 현금(${formatCurrency(cash.usCashUsd, "USD")})보다 많이 환전할 수 없습니다.` };
    }
    usdAmount = Math.min(amount, cash.usCashUsd);
    krwAmount = usdAmount * rate;
  }
  if (krwAmount <= 0) return { error: "환전할 잔액이 없습니다." };

  await prisma.investorFxConversion.create({
    data: { direction, krwAmount, usdAmount, rate, source: "MANUAL", executedAt: new Date() },
  });
  revalidatePath("/investor");
  return {};
}

// totalValueKrw는 호출부(AI Investor 페이지)에서 이미 계산한 실시간 평가값을 그대로 받는다.
// 이 함수 내부에서 다시 시세를 조회하면 같은 요청 안에서 실시간 API를 중복 호출하게 된다.
// web/app/portfolio/actions.ts의 ensureTodaySnapshot과 동일한 패턴(하루 1건, 같은 날 재조회 시 최신값으로 덮어씀).
export async function ensureTodayInvestorSnapshot(totalValueKrw: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.investorSnapshot.upsert({
    where: { date: today },
    update: { totalValueKrw },
    create: { date: today, totalValueKrw },
  });
}
