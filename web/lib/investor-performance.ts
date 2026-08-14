import type { InvestorSnapshot } from "@/app/generated/prisma/client";

export type InvestorSnapshotLike = Pick<InvestorSnapshot, "date" | "totalValueKrw">;

export interface ReturnResult {
  pct: number | null; // 기준 시점 스냅샷이 없으면 null(데이터 수집 중)
  baseDate: Date | null;
}

/** sinceDate 이하(그날 포함) 스냅샷 중 가장 최근 것을 기준점으로 수익률을 계산한다.
 *  스냅샷은 /investor 페이지 조회 시점마다 하루 1건씩 쌓이므로(web/app/investor/actions.ts),
 *  기준일 이전 스냅샷이 아직 없으면 null을 반환한다(호출부에서 "데이터 수집 중"으로 안내). */
export function computeReturnSince(
  snapshots: InvestorSnapshotLike[],
  totalValueKrw: number,
  sinceDate: Date
): ReturnResult {
  const base = [...snapshots]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .find((s) => s.date.getTime() <= sinceDate.getTime());
  if (!base || base.totalValueKrw <= 0) return { pct: null, baseDate: null };
  return { pct: ((totalValueKrw - base.totalValueKrw) / base.totalValueKrw) * 100, baseDate: base.date };
}

/** 스냅샷 이력과 무관하게 시드금액 대비로 항상 정확히 계산할 수 있는 누적(전체) 수익률.
 *  AI Investor는 시드금액 외 추가 입출금이 없는 계정이라 총평가금액과 시드금액의 차이가
 *  곧 순수 손익(실현+미실현) 전체와 정확히 일치한다. */
export function computeAllTimeReturn(totalValueKrw: number, seedCapitalKrw: number): ReturnResult {
  if (seedCapitalKrw <= 0) return { pct: null, baseDate: null };
  return { pct: ((totalValueKrw - seedCapitalKrw) / seedCapitalKrw) * 100, baseDate: null };
}
