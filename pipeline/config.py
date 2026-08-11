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
# 기본 20 (재시도 없이 1회씩 호출 시 필요한 수) + JSON 파싱 재시도용 여유분.
# ai_client.call_claude_json 은 파싱 실패 시 같은 프롬프트로 최대 2회 재시도한다.
MAX_CLAUDE_CALLS = _env_int("MAX_CLAUDE_CALLS", 26)
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
