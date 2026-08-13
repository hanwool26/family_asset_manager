"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { saveInvestorSettings } from "@/lib/investor-settings";
import { executeProposalPaper } from "@/lib/investor-execution";

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
  const maxPositions = Number(formData.get("maxPositions"));
  const maxWeightPct = Number(formData.get("maxWeightPct"));
  const cashBufferPct = Number(formData.get("cashBufferPct"));
  const maxSectorWeightPct = Number(formData.get("maxSectorWeightPct"));
  const rebalanceBandPct = Number(formData.get("rebalanceBandPct"));
  const circuitBreakerLossPct = Number(formData.get("circuitBreakerLossPct"));

  const allValues = [
    seedCapitalKrw, maxPositions, maxWeightPct, cashBufferPct,
    maxSectorWeightPct, rebalanceBandPct, circuitBreakerLossPct,
  ];
  if (!allValues.every(Number.isFinite)) {
    return { error: "모든 값을 숫자로 입력해주세요." };
  }
  if (seedCapitalKrw <= 0) return { error: "시드 금액은 0보다 커야 합니다." };
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

  await saveInvestorSettings({
    seedCapitalKrw, maxPositions, maxWeightPct, cashBufferPct,
    maxSectorWeightPct, rebalanceBandPct, circuitBreakerLossPct,
  });
  revalidatePath("/investor");
  return {};
}
