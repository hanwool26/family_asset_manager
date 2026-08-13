import { prisma } from "@/lib/db";

// AI Investor 리스크 파라미터. 새 테이블을 만들지 않고 기존 AppSetting(key/value)을 재사용한다
// (web/lib/settings.ts의 getStoredApiKey/saveStoredApiKey와 동일 패턴).

const KEYS = {
  seedCapitalKrw: "investor_seed_capital_krw",
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
const DEFAULTS: InvestorSettings = {
  seedCapitalKrw: 50_000_000,
  maxPositions: 10,
  maxWeightPct: 20,
  cashBufferPct: 20,
  maxSectorWeightPct: 40,
  rebalanceBandPct: 5,
  circuitBreakerLossPct: 15,
};

export interface InvestorSettings {
  seedCapitalKrw: number;
  maxPositions: number;
  maxWeightPct: number;
  cashBufferPct: number;
  maxSectorWeightPct: number;
  rebalanceBandPct: number;
  circuitBreakerLossPct: number;
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
