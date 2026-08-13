"""토스증권 Open API 클라이언트 (Phase C: 실주문 연동용).

확인된 스펙(https://openapi.tossinvest.com/openapi-docs/latest/openapi.json)만 구현했다:
- POST /oauth2/token : OAuth2 client_credentials, 토큰 만료 86400초
- GET  /api/v1/prices : 시세 조회 (symbols 콤마 구분, 최대 200개)
- GET  /api/v1/market-calendar/KR : 국내 개장일 조회 (is_trading_day). run_ai_investor.py가
  주간 제안 생성 시 참고 안내용으로, Phase C 실행 엔진은 주문 전 필수 확인용으로 사용한다.

계좌 잔고(GET /api/v1/accounts, /api/v1/assets)와 주문(POST/GET /api/v1/orders)은 경로 존재는
확인했지만 요청/응답 필드가 문서에서 완전히 확인되지 않았다 — place_order 등은 실계좌에 잘못된
필드로 주문이 나가는 사고를 피하기 위해 스펙을 직접 대조해 필드를 채우기 전까지 일부러
NotImplementedError를 던진다. 정확한 스키마 확보 후 채워 넣을 것.

실행 스크립트(run_ai_investor.py 등)는 이 모듈의 place_order를 이번 범위에서 호출하지 않는다.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import requests

import config

log = logging.getLogger("pipeline.broker.toss_client")

_TOKEN_URL = "https://openapi.tossinvest.com/oauth2/token"
_API_BASE = "https://openapi.tossinvest.com/api/v1"
# 문서상 만료 86400초. 갱신 여유를 위해 조금 일찍(5분 전) 재발급한다.
_TOKEN_REFRESH_MARGIN_SECONDS = 300

_access_token: str | None = None
_token_expires_at: float = 0.0


class TossClientError(RuntimeError):
    pass


class LiveTradingDisabledError(TossClientError):
    """AI_INVESTOR_LIVE_TRADING=false 인 상태에서 실주문 함수가 호출됐을 때."""


def _get_access_token() -> str:
    global _access_token, _token_expires_at

    if _access_token and time.monotonic() < _token_expires_at:
        return _access_token

    if not config.TOSS_CLIENT_ID or not config.TOSS_CLIENT_SECRET:
        raise TossClientError("TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 이 설정되어 있지 않습니다.")

    resp = requests.post(
        _TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": config.TOSS_CLIENT_ID,
            "client_secret": config.TOSS_CLIENT_SECRET,
        },
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()

    _access_token = body["access_token"]
    expires_in = body.get("expires_in", 86400)
    _token_expires_at = time.monotonic() + max(0, expires_in - _TOKEN_REFRESH_MARGIN_SECONDS)
    return _access_token


def _headers(with_account: bool = False) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {_get_access_token()}"}
    if with_account:
        if not config.TOSS_ACCOUNT_ID:
            raise TossClientError("TOSS_ACCOUNT_ID 가 설정되어 있지 않습니다 (계좌 관련 API에 필요).")
        headers["X-Tossinvest-Account"] = config.TOSS_ACCOUNT_ID
    return headers


def get_price(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """symbols(최대 200개)의 현재가를 조회해 {symbol: {lastPrice, currency, timestamp}} 로 반환한다."""
    if not symbols:
        return {}
    resp = requests.get(
        f"{_API_BASE}/prices",
        params={"symbols": ",".join(symbols)},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return {row["symbol"]: row for row in resp.json().get("data", resp.json())}


def get_market_calendar(target_date: str | None = None) -> dict[str, Any]:
    """GET /api/v1/market-calendar/KR. target_date는 "YYYY-MM-DD"(기본값: 오늘).

    응답의 today.integrated 가 None이면 휴장, 세션별(preMarket/regularMarket/afterMarket)
    객체가 있으면 개장이다 (부분 휴장 시 특정 세션만 None일 수 있음).
    """
    params = {"date": target_date} if target_date else {}
    resp = requests.get(f"{_API_BASE}/market-calendar/KR", params=params, headers=_headers(), timeout=10)
    resp.raise_for_status()
    body = resp.json()
    return body.get("result", body)


def is_trading_day(target_date: str | None = None) -> bool:
    """target_date(기본 오늘)에 국내 정규장(regularMarket)이 열리는지 확인한다.

    Phase C 실행 엔진은 승인된 제안을 집행하기 전에 반드시 이 함수로 확인해야 한다 —
    휴장일에 주문을 내면 실패하거나 예상치 못하게 처리될 수 있다.
    """
    calendar = get_market_calendar(target_date)
    today = calendar.get("today") or {}
    integrated = today.get("integrated")
    if not integrated:
        return False
    return integrated.get("regularMarket") is not None


def get_account_balance() -> dict[str, Any]:
    raise NotImplementedError(
        "Phase C 미구현 — GET /api/v1/accounts, /api/v1/assets 의 정확한 응답 스키마를 "
        "openapi.tossinvest.com/openapi-docs/latest/openapi.json 에서 확인한 뒤 구현하세요."
    )


def get_holdings() -> list[dict[str, Any]]:
    raise NotImplementedError(
        "Phase C 미구현 — GET /api/v1/assets 의 정확한 응답 스키마 확인 후 구현하세요."
    )


def place_order(
    ticker: str,
    side: str,  # "BUY" | "SELL"
    quantity: float,
    order_type: str = "MARKET",  # "MARKET" | "LIMIT"
    price: float | None = None,
) -> dict[str, Any]:
    """실주문을 낸다. 이중 안전장치: (1) AI_INVESTOR_LIVE_TRADING=true 가 아니면 즉시 거부,
    (2) 정확한 POST /api/v1/orders 요청 필드가 아직 미확인이라 어차피 NotImplementedError."""
    if not config.AI_INVESTOR_LIVE_TRADING:
        raise LiveTradingDisabledError(
            "AI_INVESTOR_LIVE_TRADING=false 입니다. 실주문을 내려면 정확한 주문 스키마 확인 및 "
            "toss_client.place_order 구현을 먼저 마치고, pipeline/.env 에서 명시적으로 true로 바꿔야 합니다."
        )
    raise NotImplementedError(
        "Phase C 미구현 — POST /api/v1/orders 의 정확한 요청 필드(종목코드/수량/가격/시장가·지정가 "
        "구분 필드명)를 openapi.tossinvest.com/openapi-docs/latest/openapi.json 에서 확인한 뒤 구현하세요."
    )
