import type { Report, Recommendation, CategorySummary, FxAnalysis } from "./types";

function tech(
  overrides: Partial<Recommendation["technical"]> = {}
): Recommendation["technical"] {
  return {
    price: 100000,
    changePct: 0,
    rsi: 50,
    macd: 0,
    macdSignal: 0,
    bbPosition: 0,
    volumeRatio: 1,
    emaTrend: "neutral",
    buyScore: 0,
    sellScore: 0,
    signal: "neutral",
    ...overrides,
  };
}

const latestRecommendations: Recommendation[] = [
  {
    rank: 1,
    region: "KR",
    ticker: "267260",
    name: "HD현대일렉트릭",
    market: "KOSPI",
    sector: "산업재/전력기기",
    theme: "글로벌 전력망 투자 확대",
    rationale:
      "미국·중동 데이터센터 전력 인프라 투자 확대 뉴스가 반복적으로 보도되며 변압기 수주 기대가 이어지고 있습니다. 최근 수주잔고 발표가 우호적으로 해석되고 있습니다.",
    riskFlags: ["단기 급등에 따른 밸류에이션 부담"],
    period: "medium",
    confidence: "high",
    technical: tech({
      price: 583000,
      changePct: -0.51,
      rsi: 28.1,
      macd: -15502.37,
      macdSignal: -12000,
      bbPosition: -0.07,
      volumeRatio: 2.08,
      emaTrend: "down",
      buyScore: 55,
      sellScore: 10,
      signal: "buy",
    }),
    sentiment: { score: 0.21, riskFlag: false, marketauxValidated: false },
  },
  {
    rank: 2,
    region: "KR",
    ticker: "012450",
    name: "한화에어로스페이스",
    market: "KOSPI",
    sector: "방산/항공우주",
    theme: "지정학적 긴장 지속에 따른 방산 수출 확대",
    rationale:
      "유럽·중동 지역 방산 수출 계약 관련 후속 보도가 이어지고 있으며, K-방산에 대한 정책 지원 기사도 함께 확인됩니다.",
    riskFlags: ["수출 계약 지연 가능성", "환율 변동성"],
    period: "medium",
    confidence: "high",
    technical: tech({
      price: 412000,
      changePct: 1.24,
      rsi: 61.4,
      macd: 3200.5,
      macdSignal: 1800.2,
      bbPosition: 0.42,
      volumeRatio: 1.3,
      emaTrend: "up",
      buyScore: 30,
      sellScore: 10,
      signal: "buy",
    }),
    sentiment: { score: 0.35, riskFlag: false, marketauxValidated: false },
  },
  {
    rank: 3,
    region: "KR",
    ticker: "005930",
    name: "삼성전자",
    market: "KOSPI",
    sector: "반도체",
    theme: "AI 데이터센터向 HBM 수요 확대",
    rationale:
      "AI 데이터센터 투자 확대 → HBM 수요 증가 → 반도체 업황 개선 흐름이 지속적으로 보도되고 있습니다. 파운드리 수율 개선 기사도 긍정적입니다.",
    riskFlags: ["미중 반도체 규제 리스크", "HBM 경쟁 심화"],
    period: "medium",
    confidence: "high",
    technical: tech({
      price: 89200,
      changePct: 0.34,
      rsi: 52.3,
      macd: 420.1,
      macdSignal: 380.5,
      bbPosition: 0.1,
      volumeRatio: 1.1,
      emaTrend: "up",
      buyScore: 15,
      sellScore: 0,
      signal: "neutral",
    }),
    sentiment: { score: 0.18, riskFlag: false, marketauxValidated: true },
  },
  {
    rank: 4,
    region: "KR",
    ticker: "196170",
    name: "알테오젠",
    market: "KOSDAQ",
    sector: "바이오/제약",
    theme: "빅파마 기술이전 계약 후속 기대",
    rationale:
      "기존 기술수출 계약의 마일스톤 달성 관련 기사가 재확인되며 실적 반영 기대가 유지되고 있습니다.",
    riskFlags: ["임상/규제 불확실성", "고밸류에이션"],
    period: "short",
    confidence: "medium",
    technical: tech({
      price: 398500,
      changePct: -2.11,
      rsi: 41.2,
      macd: -1200.3,
      macdSignal: -900.1,
      bbPosition: -0.35,
      volumeRatio: 1.6,
      emaTrend: "down",
      buyScore: 15,
      sellScore: 15,
      signal: "neutral",
    }),
  },
  {
    rank: 5,
    region: "KR",
    ticker: "035420",
    name: "NAVER",
    market: "KOSPI",
    sector: "인터넷/플랫폼",
    theme: "AI 검색/에이전트 서비스 확대",
    rationale:
      "자체 LLM 기반 서비스 확대 소식과 광고 매출 회복 기대가 함께 언급되고 있습니다.",
    riskFlags: ["플랫폼 규제 리스크"],
    period: "medium",
    confidence: "medium",
    technical: tech({
      price: 214500,
      changePct: 0.94,
      rsi: 58.7,
      macd: 890.2,
      macdSignal: 650.1,
      bbPosition: 0.28,
      volumeRatio: 1.2,
      emaTrend: "up",
      buyScore: 15,
      sellScore: 0,
      signal: "neutral",
    }),
  },
  {
    rank: 1,
    region: "US",
    ticker: "NVDA",
    name: "NVIDIA",
    market: "NASDAQ",
    sector: "반도체",
    theme: "AI 가속기 수요 지속",
    rationale:
      "빅테크들의 AI 데이터센터 투자 계획 상향 소식이 이어지며 차세대 GPU 수요 기대가 유지되고 있습니다.",
    riskFlags: ["밸류에이션 부담", "수출 규제 리스크"],
    period: "medium",
    confidence: "high",
    technical: tech({
      price: 178.4,
      changePct: 1.85,
      rsi: 63.2,
      macd: 2.1,
      macdSignal: 1.4,
      bbPosition: 0.55,
      volumeRatio: 1.4,
      emaTrend: "up",
      buyScore: 30,
      sellScore: 10,
      signal: "buy",
    }),
    sentiment: { score: 0.42, riskFlag: false, marketauxValidated: true },
  },
  {
    rank: 2,
    region: "US",
    ticker: "AVGO",
    name: "Broadcom",
    market: "NASDAQ",
    sector: "반도체",
    theme: "커스텀 AI 칩(ASIC) 수주 확대",
    rationale:
      "주요 클라우드 업체의 자체 AI 칩 설계 협력 소식이 반복 보도되고 있습니다.",
    riskFlags: ["대형 고객 의존도"],
    period: "medium",
    confidence: "high",
    technical: tech({
      price: 231.7,
      changePct: 0.62,
      rsi: 57.9,
      macd: 1.2,
      macdSignal: 0.8,
      bbPosition: 0.3,
      volumeRatio: 1.1,
      emaTrend: "up",
      buyScore: 15,
      sellScore: 0,
      signal: "neutral",
    }),
    sentiment: { score: 0.29, riskFlag: false, marketauxValidated: true },
  },
  {
    rank: 3,
    region: "US",
    ticker: "TSLA",
    name: "Tesla",
    market: "NASDAQ",
    sector: "EV/자동차",
    theme: "자율주행/로보택시 상용화 기대",
    rationale:
      "로보택시 시범 서비스 확대 관련 기사와 함께 규제당국 승인 절차 진행 소식이 확인됩니다.",
    riskFlags: ["규제 지연", "판매량 둔화 우려"],
    period: "short",
    confidence: "medium",
    technical: tech({
      price: 268.3,
      changePct: -1.42,
      rsi: 38.5,
      macd: -3.1,
      macdSignal: -2.2,
      bbPosition: -0.4,
      volumeRatio: 1.7,
      emaTrend: "down",
      buyScore: 15,
      sellScore: 15,
      signal: "neutral",
    }),
    sentiment: { score: -0.08, riskFlag: false, marketauxValidated: true },
  },
  {
    rank: 4,
    region: "US",
    ticker: "AAPL",
    name: "Apple",
    market: "NASDAQ",
    sector: "빅테크/하드웨어",
    theme: "온디바이스 AI 탑재 신모델 기대",
    rationale:
      "차기 기기 라인업에 자체 AI 기능이 강화된다는 보도가 이어지고 있습니다.",
    riskFlags: ["중국 수요 둔화"],
    period: "medium",
    confidence: "medium",
    technical: tech({
      price: 214.9,
      changePct: 0.21,
      rsi: 49.6,
      macd: 0.4,
      macdSignal: 0.3,
      bbPosition: 0.05,
      volumeRatio: 0.9,
      emaTrend: "neutral",
      buyScore: 0,
      sellScore: 0,
      signal: "neutral",
    }),
  },
  {
    rank: 5,
    region: "US",
    ticker: "JPM",
    name: "JPMorgan Chase",
    market: "NYSE",
    sector: "금융",
    theme: "고금리 장기화 수혜",
    rationale:
      "금리 인하 속도 조절 전망이 이어지며 은행 순이자마진 개선 기대가 언급되고 있습니다.",
    riskFlags: ["경기 둔화에 따른 대손비용 증가"],
    period: "medium",
    confidence: "medium",
    technical: tech({
      price: 231.1,
      changePct: 0.48,
      rsi: 54.2,
      macd: 1.1,
      macdSignal: 0.9,
      bbPosition: 0.15,
      volumeRatio: 1.0,
      emaTrend: "up",
      buyScore: 15,
      sellScore: 0,
      signal: "neutral",
    }),
  },
];

const latestCategorySummaries: CategorySummary[] = [
  {
    category: "MACRO",
    bullets: [
      { text: "미 연준의 금리 인하 속도 조절 시사로 달러 강세 및 원/달러 환율 상승 압력이 유지되고 있습니다.", persistence: "recurring" },
      { text: "국제 유가가 중동 정세 불안으로 반등하며 인플레이션 재점화 우려가 언급되고 있습니다.", persistence: "shock" },
      { text: "외국인 수급이 반도체 업종 중심으로 순매수로 전환되었습니다.", persistence: "recurring" },
    ],
  },
  {
    category: "POLICY",
    bullets: [
      { text: "정부의 밸류업 프로그램 참여 기업 대상 세제 지원 확대 방안이 논의되고 있습니다.", persistence: "structural" },
      { text: "반도체 특별법 국회 통과 이후 후속 지원책 발표가 예고되어 있습니다.", persistence: "structural" },
    ],
  },
  {
    category: "EVENT",
    bullets: [
      { text: "중동 지역 긴장 고조로 원자재·에너지 시장 변동성이 확대되었습니다.", persistence: "shock" },
      { text: "주요 빅테크의 대규모 데이터센터 투자 발표가 잇따르고 있습니다.", persistence: "structural" },
    ],
  },
  {
    category: "TREND",
    bullets: [
      { text: "AI 인프라 투자 확대 흐름이 반도체·전력기기 업종 전반으로 확산되고 있습니다.", persistence: "structural" },
      { text: "고령화에 따른 헬스케어·바이오 업종 구조적 수요 증가가 지속적으로 언급됩니다.", persistence: "structural" },
    ],
  },
  {
    category: "SENTIMENT",
    bullets: [
      { text: "코스피 개인 투자자의 특정 테마 쏠림 현상이 관찰되고 있습니다.", persistence: "recurring" },
      { text: "미국 증시 공포탐욕지수가 중립 구간에서 등락을 반복하고 있습니다.", persistence: "recurring" },
    ],
  },
];

const mockFxAnalysis: FxAnalysis = {
  pair: "USD/KRW",
  rate: 1392.4,
  changePct: 0.31,
  change1wPct: -0.85,
  change1mPct: 1.42,
  high3m: 1418.2,
  low3m: 1351.6,
  rsi: 54.2,
  emaTrend: "neutral",
  volatilityPct: 7.8,
  context: [
    { label: "달러인덱스(DXY)", value: 101.84, changePct: 0.12, change1mPct: 0.9 },
    { label: "미 10년물 국채금리(%)", value: 4.12, changePct: -0.48, change1mPct: 2.1 },
  ],
  headlines: [
    { title: "원·달러 환율, 외국인 순매수에 1,390원대 등락", url: "https://example.com/fx-1", publishedAt: "" },
    { title: "연준 위원들 \"금리 인하 서두를 필요 없어\"… 달러 강보합", url: "https://example.com/fx-2", publishedAt: "" },
  ],
  aiDegraded: false,
  summary:
    "원/달러 환율은 미 금리 인하 기대 후퇴로 달러가 강보합을 보였지만, 외국인 국내 주식 순매수가 이어지며 1,390원대 초반에서 제한적으로 상승했습니다. 3개월 범위의 중간 위에 위치해 방향성은 뚜렷하지 않습니다.",
  outlook: "sideways",
  drivers: [
    "연준 금리 경로에 대한 기대 변화로 달러 강세 압력이 유지되고 있습니다.",
    "외국인 국내 주식 순매수가 원화 강세 요인으로 작용하고 있습니다.",
    "1,400원 부근에서는 외환당국 경계감이 상단을 제한하는 모습입니다.",
  ],
  krwToUsd: {
    stance: "neutral",
    comment: "3개월 범위 중간 위쪽이라 일시 환전보다는 2~3회 분할 환전으로 평균 단가를 맞추는 편이 무난해 보입니다.",
  },
  usdToKrw: {
    stance: "neutral",
    comment: "고점권과는 거리가 있어 달러를 서둘러 원화로 되돌릴 유인은 크지 않아 보입니다.",
  },
};

function scaleTechnical(
  base: Recommendation["technical"],
  seed: number
): Recommendation["technical"] {
  const drift = ((seed * 37) % 21) - 10; // -10 ~ 10
  return {
    ...base,
    price: Math.max(1, base.price * (1 + drift / 200)),
    changePct: Number((drift / 4).toFixed(2)),
    rsi: Math.min(90, Math.max(10, base.rsi + drift)),
  };
}

function deriveReport(date: string, hour: number, seed: number): Report {
  return {
    date,
    hour,
    marketContext:
      hour === 19
        ? "장 마감 후 반도체·전력인프라 테마 중심 순환매가 이어졌으며, 미 증시 선물은 보합권에서 움직이고 있습니다."
        : hour === 12
        ? "오전장은 외국인 순매수 전환에 힘입어 반도체 대형주가 강세를 보였습니다."
        : "장 시작 전 오버나이트 미국 증시는 AI 반도체 강세에 힘입어 상승 마감했습니다.",
    recommendations: latestRecommendations.map((r) => ({
      ...r,
      technical: scaleTechnical(r.technical, seed + r.rank),
    })),
    categorySummaries: latestCategorySummaries,
    fxAnalysis: mockFxAnalysis,
  };
}

export const mockReports: Report[] = [
  deriveReport("2026-07-30", 19, 3),
  deriveReport("2026-07-30", 12, 2),
  deriveReport("2026-07-30", 7, 1),
  deriveReport("2026-07-29", 19, 5),
  deriveReport("2026-07-28", 19, 8),
];

export function getLatestReport(): Report {
  return mockReports[0];
}

export function getReport(date: string, hour: number): Report | undefined {
  return mockReports.find((r) => r.date === date && r.hour === hour);
}

export function listReports(): Report[] {
  return mockReports;
}
