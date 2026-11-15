import { buildSchedule, type RepaymentMethod } from "./loan";

// 스트레스 DSR 기준값 (2026년 하반기, 은행연합회 운영방향 기준).
// - 수도권·규제지역 주담대: 스트레스 금리 3.0%p × 적용비율 100% (3단계, 2025.10.15 대책으로 하한 1.5→3.0%p)
// - 지방 주담대: 스트레스 금리 1.5%p × 적용비율 50% = 0.75%p (2단계 유지, 2026-12-31까지 유예)
// - 신용대출·기타대출: 스트레스 금리 1.5%p × 100% (신용대출은 총 신용대출 잔액이 1억원 초과일 때만 적용)
// 규정이 바뀌면 이 표만 고치면 된다. 화면에서도 값을 직접 덮어쓸 수 있다.
export type StressPreset = "METRO_MORTGAGE" | "NON_METRO_MORTGAGE" | "CREDIT" | "NONE";

export const STRESS_PRESETS: Record<StressPreset, { label: string; stressRatePct: number; baseRatioPct: number; note: string }> = {
  METRO_MORTGAGE: {
    label: "수도권·규제지역 주담대",
    stressRatePct: 3.0,
    baseRatioPct: 100,
    note: "3단계 · 스트레스 금리 3.0%p 전액 반영",
  },
  NON_METRO_MORTGAGE: {
    label: "지방(비규제지역) 주담대",
    stressRatePct: 1.5,
    baseRatioPct: 50,
    note: "2단계 유지 · 2026-12-31까지 유예 (이후 기준 재확인 필요)",
  },
  CREDIT: {
    label: "신용대출·기타대출",
    stressRatePct: 1.5,
    baseRatioPct: 100,
    note: "신용대출은 총 신용대출 잔액이 1억원 초과일 때만 적용",
  },
  NONE: { label: "스트레스 미적용", stressRatePct: 0, baseRatioPct: 0, note: "일반 DSR로만 계산" },
};

// 금리 유형별 추가 적용비율. 혼합형·주기형은 고정기간/주기가 길수록 완화되고 은행·상품마다 세부 비율이 달라
// 아래는 참고용 기본값이며, 화면에서 실제 은행 안내 비율로 고쳐 쓰는 것을 전제로 한다.
export type RateType = "VARIABLE" | "HYBRID" | "PERIODIC" | "FIXED";

export const RATE_TYPE_PRESETS: Record<RateType, { label: string; ratioPct: number }> = {
  VARIABLE: { label: "변동형", ratioPct: 100 },
  HYBRID: { label: "혼합형", ratioPct: 60 },
  PERIODIC: { label: "주기형", ratioPct: 30 },
  FIXED: { label: "고정형", ratioPct: 0 },
};

export type LenderTier = "BANK" | "NON_BANK";

export const DSR_LIMITS: Record<LenderTier, { label: string; limitPct: number }> = {
  BANK: { label: "은행 (1금융권)", limitPct: 40 },
  NON_BANK: { label: "2금융권", limitPct: 50 },
};

export type LoanPurpose = "MORTGAGE" | "CREDIT";

/** 신용대출은 DSR 산정 시 실제 만기와 무관하게 원금을 5년에 나눠 갚는 것으로 본다. */
const CREDIT_DSR_YEARS = 5;

export interface StressSetting {
  stressRatePct: number;
  baseRatioPct: number;
  rateTypeRatioPct: number;
}

export function effectiveStressRatePct(s: StressSetting): number {
  return s.stressRatePct * (s.baseRatioPct / 100) * (s.rateTypeRatioPct / 100);
}

export interface DsrLoanInput {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  method: RepaymentMethod;
  graceMonths: number;
  purpose: LoanPurpose;
}

/**
 * DSR 산정용 연간 원리금 상환액. 실제 월 납입액과 다르다.
 * - 주담대: 만기까지의 총 원리금 ÷ 대출기간(년) — 원금균등·거치·만기일시도 연평균으로 환산
 * - 신용대출: 원금 ÷ 5년 + 연 이자
 * 금리에는 스트레스 금리를 더한 값을 넘긴다.
 */
export function annualDebtServiceForDsr(loan: DsrLoanInput, ratePct: number): number {
  if (!(loan.principal > 0) || !(loan.termMonths > 0)) return 0;
  if (loan.purpose === "CREDIT") {
    return loan.principal / CREDIT_DSR_YEARS + loan.principal * (ratePct / 100);
  }
  const rows = buildSchedule({ ...loan, annualRatePct: ratePct });
  const total = rows.reduce((s, r) => s + r.payment, 0);
  return total / (loan.termMonths / 12);
}

export interface DsrResult {
  appliedRatePct: number; // 실제 금리 + 실효 스트레스 금리
  newLoanAnnual: number;
  existingAnnual: number;
  dsrPct: number;
  limitPct: number;
  withinLimit: boolean;
  /** 같은 조건(금리·기간·상환방식)에서 DSR 한도를 넘지 않는 최대 신규 대출 원금. */
  maxPrincipal: number;
}

export function computeDsr(params: {
  loan: DsrLoanInput;
  stress: StressSetting;
  annualIncome: number;
  existingAnnualDebtService: number;
  limitPct: number;
}): DsrResult {
  const { loan, stress, annualIncome, existingAnnualDebtService, limitPct } = params;
  const appliedRatePct = loan.annualRatePct + effectiveStressRatePct(stress);
  const newLoanAnnual = annualDebtServiceForDsr(loan, appliedRatePct);
  const dsrPct = annualIncome > 0 ? ((newLoanAnnual + existingAnnualDebtService) / annualIncome) * 100 : Infinity;

  // 연간 상환액은 원금에 비례하므로 원금 1원당 상환액으로 나누면 한도 원금이 바로 나온다
  const perWon = annualDebtServiceForDsr({ ...loan, principal: 1_000_000 }, appliedRatePct) / 1_000_000;
  const room = (annualIncome * limitPct) / 100 - existingAnnualDebtService;
  const maxPrincipal = perWon > 0 ? Math.max(0, room / perWon) : 0;

  return {
    appliedRatePct,
    newLoanAnnual,
    existingAnnual: existingAnnualDebtService,
    dsrPct,
    limitPct,
    withinLimit: dsrPct <= limitPct,
    maxPrincipal,
  };
}
