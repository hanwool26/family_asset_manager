import { prisma } from "@/lib/db";
import type { Region } from "@/lib/types";

// AI Investor 리스크 파라미터. 새 테이블을 만들지 않고 기존 AppSetting(key/value)을 재사용한다
// (web/lib/settings.ts의 getStoredApiKey/saveStoredApiKey와 동일 패턴).

const KEYS = {
  seedCapitalKrw: "investor_seed_capital_krw",
  usAllocationPct: "investor_us_allocation_pct",
  maxPositions: "investor_max_positions",
  maxWeightPct: "investor_max_weight_pct",
  cashBufferPct: "investor_cash_buffer_pct",
  maxSectorWeightPct: "investor_max_sector_weight_pct",
  rebalanceBandPct: "investor_rebalance_band_pct",
  circuitBreakerLossPct: "investor_circuit_breaker_loss_pct",
} as const;

// 사용자가 확정한 초기값: 시드 5,000만원(가정), 최대 10종목, 종목당 최대 20%, 현금버퍼 20%.
// 아래 3개는 이번에 추가된 값으로, 사용자와 명시적으로 확정한 값이 아니라 합리적인 기본값을 잡은 것 —
// 필요시 운용 설정 다이얼로그에서 바로 조정 가능하다.
// - maxSectorWeightPct 40%: maxWeightPct(20%) 기준 한 섹터에 최대 2개 종목 몰빵 정도까지만 허용
// - rebalanceBandPct 5%p: 목표비중이 현재비중과 5%p 이상 벌어져야 실제로 매매(과매매 방지)
// - circuitBreakerLossPct 15%: 시드금액 대비 15% 이상 손실 시 신규 매수 중단(매도는 계속 허용)
// usAllocationPct(미국 슬리브 배분비율)는 0%로 시작한다 — 미국 탭 도입 전부터 시드 전액을 국내로
// 운용하던 상태를 그대로 유지하기 위함(기본값을 올리면 기존 국내 슬리브 자본이 말없이 줄어든다).
const DEFAULTS: InvestorSettings = {
  seedCapitalKrw: 50_000_000,
  usAllocationPct: 0,
  maxPositions: 10,
  maxWeightPct: 20,
  cashBufferPct: 20,
  maxSectorWeightPct: 40,
  rebalanceBandPct: 5,
  circuitBreakerLossPct: 15,
};

/** 종목수/비중/섹터/현금버퍼/밴드/서킷브레이커는 시장별 슬리브(한국·미국) 각각에 독립 적용된다 —
 *  비중의 분모는 전체 시드가 아니라 해당 슬리브의 평가금액이다. */
export interface InvestorSettings {
  seedCapitalKrw: number;
  /** 시드금액 중 미국 주식 슬리브에 배분할 비율(%). 한국 슬리브는 나머지(100 - 이 값). */
  usAllocationPct: number;
  maxPositions: number;
  maxWeightPct: number;
  cashBufferPct: number;
  maxSectorWeightPct: number;
  rebalanceBandPct: number;
  circuitBreakerLossPct: number;
}

/** 시장별 슬리브에 배분된 시드금액(원). */
export function sleeveSeedKrw(settings: Pick<InvestorSettings, "seedCapitalKrw" | "usAllocationPct">, region: Region): number {
  const usPct = settings.usAllocationPct / 100;
  return settings.seedCapitalKrw * (region === "US" ? usPct : 1 - usPct);
}

export async function getInvestorSettings(): Promise<InvestorSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const num = (key: string, fallback: number): number => {
    const raw = byKey.get(key);
    const parsed = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    seedCapitalKrw: num(KEYS.seedCapitalKrw, DEFAULTS.seedCapitalKrw),
    usAllocationPct: num(KEYS.usAllocationPct, DEFAULTS.usAllocationPct),
    maxPositions: num(KEYS.maxPositions, DEFAULTS.maxPositions),
    maxWeightPct: num(KEYS.maxWeightPct, DEFAULTS.maxWeightPct),
    cashBufferPct: num(KEYS.cashBufferPct, DEFAULTS.cashBufferPct),
    maxSectorWeightPct: num(KEYS.maxSectorWeightPct, DEFAULTS.maxSectorWeightPct),
    rebalanceBandPct: num(KEYS.rebalanceBandPct, DEFAULTS.rebalanceBandPct),
    circuitBreakerLossPct: num(KEYS.circuitBreakerLossPct, DEFAULTS.circuitBreakerLossPct),
  };
}

export async function saveInvestorSettings(settings: InvestorSettings): Promise<void> {
  await prisma.$transaction(
    (Object.entries(KEYS) as [keyof InvestorSettings, string][]).map(([field, key]) =>
      prisma.appSetting.upsert({
        where: { key },
        create: { key, value: String(settings[field]) },
        update: { value: String(settings[field]) },
      })
    )
  );
}
