export type RepaymentMethod = "EQUAL_PAYMENT" | "EQUAL_PRINCIPAL" | "BULLET";

export const REPAYMENT_METHOD_LABELS: Record<RepaymentMethod, string> = {
  EQUAL_PAYMENT: "원리금균등",
  EQUAL_PRINCIPAL: "원금균등",
  BULLET: "만기일시",
};

export interface LoanInput {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  method: RepaymentMethod;
  /** 거치기간(개월). 이 기간 동안은 이자만 내고, 남은 기간에 원금을 상환한다. 만기일시에는 의미가 없어 무시한다. */
  graceMonths: number;
}

export interface ScheduleRow {
  month: number; // 1부터 시작
  payment: number;
  principal: number;
  interest: number;
  balance: number; // 이번 회차 상환 후 잔액
}

export interface LoanSummary {
  firstPayment: number;
  maxPayment: number;
  totalInterest: number;
  totalPayment: number;
}

/** 월별 상환 스케줄. 금리 0%·거치기간이 만기 이상인 경우 등 경계값도 깨지지 않게 처리한다. */
export function buildSchedule(input: LoanInput): ScheduleRow[] {
  const { principal, method } = input;
  const termMonths = Math.max(0, Math.round(input.termMonths));
  if (!(principal > 0) || termMonths === 0) return [];

  const r = Math.max(0, input.annualRatePct) / 100 / 12;
  const graceMonths =
    method === "BULLET" ? 0 : Math.min(Math.max(0, Math.round(input.graceMonths)), termMonths - 1);
  const amortMonths = termMonths - graceMonths;
  const level = r === 0 ? principal / amortMonths : (principal * r) / (1 - Math.pow(1 + r, -amortMonths));

  const rows: ScheduleRow[] = [];
  let balance = principal;
  for (let month = 1; month <= termMonths; month++) {
    const interest = balance * r;
    let principalPart: number;
    if (month <= graceMonths) {
      principalPart = 0;
    } else if (method === "BULLET") {
      principalPart = month === termMonths ? balance : 0;
    } else if (method === "EQUAL_PRINCIPAL") {
      principalPart = principal / amortMonths;
    } else {
      principalPart = level - interest;
    }
    // 마지막 회차에서 부동소수 오차로 남는 잔액을 정리한다
    if (month === termMonths) principalPart = balance;
    balance -= principalPart;
    rows.push({ month, payment: principalPart + interest, principal: principalPart, interest, balance: Math.max(0, balance) });
  }
  return rows;
}

export function summarize(rows: ScheduleRow[]): LoanSummary {
  if (rows.length === 0) return { firstPayment: 0, maxPayment: 0, totalInterest: 0, totalPayment: 0 };
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalPayment = rows.reduce((s, r) => s + r.payment, 0);
  return {
    firstPayment: rows[0].payment,
    maxPayment: Math.max(...rows.map((r) => r.payment)),
    totalInterest,
    totalPayment,
  };
}

export interface YearlyRow {
  year: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export function aggregateByYear(rows: ScheduleRow[]): YearlyRow[] {
  const years: YearlyRow[] = [];
  for (const row of rows) {
    const year = Math.ceil(row.month / 12);
    let y = years[year - 1];
    if (!y) {
      y = { year, payment: 0, principal: 0, interest: 0, balance: 0 };
      years.push(y);
    }
    y.payment += row.payment;
    y.principal += row.principal;
    y.interest += row.interest;
    y.balance = row.balance;
  }
  return years;
}
