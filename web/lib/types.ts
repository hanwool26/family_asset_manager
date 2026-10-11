export type NewsCategory = "MACRO" | "POLICY" | "EVENT" | "TREND" | "SENTIMENT";

export type Persistence = "shock" | "structural" | "recurring";

export type StockMarket = "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE";

export type Confidence = "high" | "medium";

export type InterestPeriod = "short" | "medium";

export type Region = "KR" | "US";

export interface TechnicalSignal {
  price: number;
  changePct: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  bbPosition: number; // -1 ~ 1, 0 = 중단선
  volumeRatio: number; // 20일 평균 대비 배수
  emaTrend: "up" | "down" | "neutral";
  buyScore: number;
  sellScore: number;
  signal: "buy" | "sell" | "neutral";
}

export interface SentimentInfo {
  score: number; // -1 ~ 1
  riskFlag: boolean;
  marketauxValidated: boolean;
}

export interface Recommendation {
  rank: number;
  region: Region;
  ticker: string;
  name: string;
  market: StockMarket;
  sector: string;
  theme: string;
  rationale: string;
  riskFlags: string[];
  period: InterestPeriod;
  confidence: Confidence;
  technical: TechnicalSignal;
  sentiment?: SentimentInfo;
}

export interface CategoryBullet {
  text: string;
  persistence: Persistence;
}

export interface CategorySummary {
  category: NewsCategory;
  bullets: CategoryBullet[];
}

export interface Report {
  date: string; // "YYYY-MM-DD"
  hour: number; // 7 | 19
  minute?: number; // 30 (과거 07:00/12:00/19:00 문서엔 없음 → 0 취급)
  marketContext: string;
  recommendations: Recommendation[]; // KR 5 + US 5
  categorySummaries: CategorySummary[];
  /** true면 AI 최종 선별이 실패해 규칙 기반 폴백으로 대체된 리포트 (과거 문서엔 없음 → false 취급). */
  selectionDegraded?: boolean;
  /** 원/달러 환율 분석 (pipeline/processing/fx_analysis.py). 도입 전 문서 또는 지표 조회 실패 시 없음. */
  fxAnalysis?: FxAnalysis;
}

/** favorable: 지금 그 방향으로 환전하기 유리한 편 / unfavorable: 불리한 편(분할·대기 고려). */
export type FxStance = "favorable" | "neutral" | "unfavorable";

/** 향후 1~2주 원/달러 환율 방향. up = 환율 상승(원화 약세). */
export type FxOutlook = "up" | "down" | "sideways";

export interface FxContextIndicator {
  label: string;
  value: number;
  changePct: number | null;
  change1mPct: number | null;
}

export interface FxAnalysis {
  pair: "USD/KRW";
  rate: number;
  changePct: number | null;
  change1wPct: number | null;
  change1mPct: number | null;
  high3m: number;
  low3m: number;
  rsi: number | null;
  emaTrend: "up" | "down" | "neutral";
  volatilityPct: number | null;
  context: FxContextIndicator[];
  headlines: { title: string; url: string; publishedAt: string }[];
  /** true면 Claude 판단 생성에 실패해 지표/헤드라인만 있는 상태 (아래 AI 필드 없음). */
  aiDegraded: boolean;
  summary?: string;
  outlook?: FxOutlook;
  drivers?: string[];
  krwToUsd?: { stance: FxStance; comment: string };
  usdToKrw?: { stance: FxStance; comment: string };
}

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  MACRO: "거시경제",
  POLICY: "정책/규제",
  EVENT: "돌발 이벤트",
  TREND: "구조적 트렌드",
  SENTIMENT: "시장 심리",
};

export const PERSISTENCE_LABELS: Record<Persistence, string> = {
  shock: "단기 충격",
  structural: "구조적 트렌드",
  recurring: "반복 이슈",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "확신 높음",
  medium: "확신 보통",
};

export const PERIOD_LABELS: Record<InterestPeriod, string> = {
  short: "단기(1~2주)",
  medium: "중기(1~3개월)",
};

export interface MoverNewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

export interface PortfolioMover {
  ticker: string;
  name: string;
  changePct: number;
  price: number;
  currency: string;
  /** Claude가 생성한 5~10줄 요약 (줄 단위 배열). */
  newsSummary: string[];
  articles: MoverNewsArticle[];
}

export interface PortfolioMoversReport {
  market: Region;
  date: string; // "YYYY-MM-DD" (장마감 기준일)
  generatedAt: string; // ISO datetime
  gainers: PortfolioMover[];
  losers: PortfolioMover[];
}
