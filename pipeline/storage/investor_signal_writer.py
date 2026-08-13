"""AI Investor: 보유종목 기술 신호 이력 저장 + 추세 기반 손절 판단.

주간 의사결정(processing/investor_decide.py)마다 보유종목의 signal/emaTrend를
investor_signal_history 컬렉션에 (ticker, weekOf) 단위로 쌓는다. "N주 연속 매도 신호" 또는
"N주 연속 하락 추세"를 코드 레벨에서 판단하기 위함이다 — 단순 -N% 가격 손절은 단기 휩소에
취약하고, LLM 판단에만 의존하는 것도 실거래와 연결되는 로직 특성상 피해야 하기 때문이다
(processing/investor_decide.enforce_constraints와 동일한 "LLM을 신뢰하지 않는다" 원칙).

mongo_writer.py(Stage 7)와 동일한 패턴이지만, 이 컬렉션은 리포트가 아니라 종목별 시계열이라
(market, date) 단위가 아닌 (ticker, weekOf) 단위로 upsert한다.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection

import config

_COLLECTION_NAME = "investor_signal_history"
# 손절 판단에 필요한 것보다 넉넉히 조회하는 상한 (연속 카운트는 보통 threshold를 크게 넘지 않음).
_HISTORY_LOOKBACK_LIMIT = 12


def _get_collection() -> Collection:
    if not config.MONGODB_URI:
        raise RuntimeError("MONGODB_URI 가 설정되어 있지 않습니다.")
    client = MongoClient(config.MONGODB_URI)
    db = client[config.MONGODB_DB]
    collection = db[_COLLECTION_NAME]
    collection.create_index([("ticker", ASCENDING), ("weekOf", ASCENDING)], unique=True, name="ticker_week_unique")
    return collection


def record(ticker: str, week_of: date, signal: str, ema_trend: str) -> None:
    """이번 주 보유종목의 signal/emaTrend를 기록한다(같은 주에 재실행해도 upsert로 덮어씀)."""
    collection = _get_collection()
    collection.update_one(
        {"ticker": ticker, "weekOf": week_of.isoformat()},
        {"$set": {"signal": signal, "emaTrend": ema_trend, "recordedAt": datetime.now(timezone.utc)}},
        upsert=True,
    )


def _consecutive_from_latest(ticker: str, field: str, value: str) -> int:
    """가장 최근 기록부터 역순으로 field == value 인 연속 횟수. 최신 기록이 아니면 0."""
    collection = _get_collection()
    docs = collection.find({"ticker": ticker}, {field: 1, "weekOf": 1}).sort("weekOf", -1).limit(_HISTORY_LOOKBACK_LIMIT)
    count = 0
    for doc in docs:
        if doc.get(field) != value:
            break
        count += 1
    return count


def consecutive_sell_weeks(ticker: str) -> int:
    return _consecutive_from_latest(ticker, "signal", "sell")


def consecutive_down_trend_weeks(ticker: str) -> int:
    return _consecutive_from_latest(ticker, "emaTrend", "down")
