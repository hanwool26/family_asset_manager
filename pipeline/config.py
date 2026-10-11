"""환경변수 로딩 + methodology.html 에 명시된 파라미터/임계값."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _env_int(key: str, default: int) -> int:
    return int(os.environ.get(key, default))


def _env_float(key: str, default: float) -> float:
    return float(os.environ.get(key, default))


# --- MongoDB ---
MONGODB_URI = _env("MONGODB_URI")
MONGODB_DB = _env("MONGODB_DB", "stock_analyzer")

# --- 뉴스 수집 ---
NAVER_CLIENT_ID = _env("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = _env("NAVER_CLIENT_SECRET")
MARKETAUX_API_KEY = _env("MARKETAUX_API_KEY")

# --- Claude ---
AI_BACKEND = _env("AI_BACKEND", "cli")  # "cli" | "api"
CLAUDE_MODEL = _env("CLAUDE_MODEL", "claude-sonnet-5")
ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")

# --- 파이프라인 파라미터 (methodology.html #params) ---
MAX_ARTICLES = _env_int("MAX_ARTICLES", 200)
CLASSIFY_BATCH_SIZE = _env_int("CLASSIFY_BATCH_SIZE", 25)
SUMMARY_ARTICLES_PER_CATEGORY = _env_int("SUMMARY_ARTICLES_PER_CATEGORY", 30)
# 기본 21 (재시도 없이 1회씩 호출 시 필요한 수 — 환율 분석 1회 포함) + JSON 파싱 재시도용 여유분.
# ai_client.call_claude_json 은 파싱 실패 시 같은 프롬프트로 최대 2회 재시도한다.
# 환율 분석(Stage 6b)은 리포트 저장 직전에 호출되며, 예산이 모자라면 리포트를 막지 않고 AI 판단만 생략된다.
MAX_CLAUDE_CALLS = _env_int("MAX_CLAUDE_CALLS", 29)
CLAUDE_TIMEOUT_SECONDS = _env_int("CLAUDE_TIMEOUT_SECONDS", 300)
CLAUDE_CALL_INTERVAL_SECONDS = _env_float("CLAUDE_CALL_INTERVAL_SECONDS", 2.0)
NAVER_RATE_LIMIT_SECONDS = _env_float("NAVER_RATE_LIMIT_SECONDS", 0.2)
MARKETAUX_RATE_LIMIT_SECONDS = _env_float("MARKETAUX_RATE_LIMIT_SECONDS", 1.0)
MARKETAUX_MAX_RETRIES = _env_int("MARKETAUX_MAX_RETRIES", 2)
MARKETAUX_RETRY_BACKOFF_SECONDS = _env_float("MARKETAUX_RETRY_BACKOFF_SECONDS", 3.0)

# --- 기술적 분석 파라미터 ---
RSI_PERIOD = 14
MACD_FAST, MACD_SLOW, MACD_SIGNAL = 12, 26, 9
BB_PERIOD, BB_STD = 20, 2.0
EMA_PERIODS = (5, 20, 60)
VOLUME_SPIKE_RATIO = 1.5
SENTIMENT_RISK_THRESHOLD = -0.3
GLOBAL_RELATED_MIN_MENTIONS = 2
GLOBAL_RELATED_MAX_COUNT = 15

# --- 포트폴리오 등락률 TOP5 뉴스 파이프라인 (run_portfolio_movers.py) ---
# web/ 배포 URL. GET {PORTFOLIO_API_URL}/api/portfolio/movers 호출에 사용.
PORTFOLIO_API_URL = _env("PORTFOLIO_API_URL")
# web/.env 의 PIPELINE_API_TOKEN 과 동일한 값이어야 함.
PIPELINE_API_TOKEN = _env("PIPELINE_API_TOKEN")
PORTFOLIO_MOVERS_TOP_N = _env_int("PORTFOLIO_MOVERS_TOP_N", 5)
PORTFOLIO_NEWS_ARTICLES_PER_STOCK = _env_int("PORTFOLIO_NEWS_ARTICLES_PER_STOCK", 5)

# --- AI Investor (뉴스/지표 기반 반자동 장기 포트폴리오, run_ai_investor.py) ---
# 컨빅션 통계(연속 추천 여부 등)를 뽑을 때 조회할 reports 컬렉션의 과거 구간(일).
INVESTOR_LOOKBACK_DAYS = _env_int("INVESTOR_LOOKBACK_DAYS", 14)
# 보유종목이 이 횟수만큼 연속으로 매도신호(signal=="sell") 또는 하락추세(emaTrend=="down")를
# 기록하면, AI(Claude) 판단과 무관하게 코드 레벨에서 강제 EXIT 처리한다 (추세 기반 손절).
INVESTOR_EXIT_AFTER_CONSECUTIVE_WEEKS = _env_int("INVESTOR_EXIT_AFTER_CONSECUTIVE_WEEKS", 3)
# 토스증권 Open API. Phase A+B(이번 범위)는 사용하지 않고, Phase C(실주문 연동)에서 pipeline/broker/toss_client.py가 사용한다.
TOSS_CLIENT_ID = _env("TOSS_CLIENT_ID")
TOSS_CLIENT_SECRET = _env("TOSS_CLIENT_SECRET")
TOSS_ACCOUNT_ID = _env("TOSS_ACCOUNT_ID")
# true가 되기 전까지는 toss_client가 실주문을 절대 내지 않는다 — Phase C 안전장치.
AI_INVESTOR_LIVE_TRADING = _env("AI_INVESTOR_LIVE_TRADING", "false").lower() == "true"

# --- 로컬 저장 ---
PIPELINE_DATA_DIR = BASE_DIR / _env("PIPELINE_DATA_DIR", "./data")
PIPELINE_DATA_RETENTION_DAYS = _env_int("PIPELINE_DATA_RETENTION_DAYS", 30)

UNIVERSE_PATH = BASE_DIR / "universe.json"

NEWS_KEYWORDS = {
    "MACRO": ["기준금리", "환율", "물가", "코스피", "외국인 수급", "유가"],
    "POLICY": ["금융위", "공매도", "밸류업", "반도체 특별법", "관세", "규제"],
    "EVENT": ["감염병", "전쟁", "신기술", "리콜", "사고"],
    "TREND": ["AI", "2차전지", "고령화", "데이터센터", "신재생에너지"],
}

# Stage 6b 환율 분석(processing/fx_analysis.py)용 Naver 뉴스 검색 키워드. 메인 수집(NEWS_KEYWORDS)과 별도로 검색한다.
FX_NEWS_KEYWORDS = ["원달러 환율", "외환시장 달러"]

MARKETAUX_SYMBOL_GROUPS = {
    "반도체": ["NVDA", "AMD", "INTC", "TSM", "AVGO"],
    "빅테크": ["AAPL", "MSFT", "GOOGL", "META", "AMZN"],
    "EV/자동차": ["TSLA", "F", "GM"],
    "에너지": ["XOM", "CVX", "OXY"],
    "금융": ["JPM", "GS", "BAC"],
}

NOISE_BLACKLIST = [
    "광고", "이벤트", "할인", "쿠폰", "연예", "스포츠", "축구", "야구",
    "아이돌", "드라마", "예능", "부고", "결혼", "출산",
]

NEWS_CATEGORIES = ["MACRO", "POLICY", "EVENT", "TREND", "SENTIMENT"]
PERSISTENCE_TAGS = ["shock", "structural", "recurring"]
