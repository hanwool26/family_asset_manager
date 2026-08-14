import type { InvestorSnapshot } from "@/app/generated/prisma/client";

export interface PeriodReturn {
  label: string;
  pct: number | null; // 기준 시점 스냅샷이 없으면 null(데이터 수집 중)
  baseDate: Date | null;
}

const PERIOD_DAYS: { label: string; days: number }[] = [
  { label: "1주", days: 7 },
  { label: "1개월", days: 30 },
  { label: "3개월", days: 90 },
];

/** 기간별 수익률 = (현재 총평가금액 - N일 전 이하 중 가장 최근 스냅샷) / 그 스냅샷 * 100.
 *  스냅샷은 /investor 페이지 조회 시점마다 하루 1건씩 쌓이므로(web/app/investor/actions.ts),
 *  기능 도입 초기에는 과거 기준점이 없어 일부 기간이 null(데이터 수집 중)일 수 있다.
 *
 *  "전체"(누적)는 스냅샷 이력과 무관하게 시드금액 대비로 항상 정확히 계산할 수 있다 — AI Investor는
 *  시드금액 외 추가 입출금이 없는 계정이라 총평가금액과 시드금액의 차이가 곧 순수 손익(실현+미실현)이다. */
export function computeInvestorPeriodReturns(
  snapshots: Pick<InvestorSnapshot, "date" | "totalValueKrw">[],
  totalValueKrw: number,
  seedCapitalKrw: number
): PeriodReturn[] {
  const sortedDesc = [...snapshots].sort((a, b) => b.date.getTime() - a.date.getTime());
  const now = Date.now();

  const periods = PERIOD_DAYS.map(({ label, days }): PeriodReturn => {
    const cutoff = now - days * 86_400_000;
    const base = sortedDesc.find((s) => s.date.getTime() <= cutoff);
    if (!base || base.totalValueKrw <= 0) return { label, pct: null, baseDate: null };
    return { label, pct: ((totalValueKrw - base.totalValueKrw) / base.totalValueKrw) * 100, baseDate: base.date };
  });

  const allTimePct = seedCapitalKrw > 0 ? ((totalValueKrw - seedCapitalKrw) / seedCapitalKrw) * 100 : null;
  return [...periods, { label: "전체", pct: allTimePct, baseDate: null }];
}
