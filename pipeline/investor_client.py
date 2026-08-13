"""web/ 앱의 GET/POST /api/investor/* 를 호출해 AI Investor 상태를 읽고 주간 제안을 제출한다.

AI Investor가 운용하는 보유종목/현금/설정(Postgres/Prisma)은 web/ 앱에만 있어,
run_ai_investor.py가 직접 DB에 접근하지 않고 web/app/api/investor/*/route.ts 를 통해
조회/제출한다 (portfolio_client.py와 동일한 패턴).
"""
from __future__ import annotations

from typing import Any

import requests

import config


def _headers() -> dict[str, str]:
    if not config.PORTFOLIO_API_URL:
        raise RuntimeError("PORTFOLIO_API_URL 이 설정되어 있지 않습니다.")
    if not config.PIPELINE_API_TOKEN:
        raise RuntimeError("PIPELINE_API_TOKEN 이 설정되어 있지 않습니다.")
    return {"Authorization": f"Bearer {config.PIPELINE_API_TOKEN}"}


def fetch_state() -> dict[str, Any]:
    """{holdings, cashKrw, settings} 를 가져온다.

    holdings: [{ticker, name, quantity, avgPrice, currency}]
    settings: {seedCapitalKrw, maxPositions, maxWeightPct, cashBufferPct}
    """
    url = f"{config.PORTFOLIO_API_URL.rstrip('/')}/api/investor/state"
    resp = requests.get(url, headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def submit_proposal(proposal: dict[str, Any]) -> str:
    """proposal({weekOf, marketContext, degraded, items})을 제출하고 생성된 id를 반환한다.

    items: [{ticker, name, action, targetWeightPct, currentWeightPct, convictionScore,
             rationale, riskFlags}]
    """
    url = f"{config.PORTFOLIO_API_URL.rstrip('/')}/api/investor/proposals"
    resp = requests.post(url, json=proposal, headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json().get("id", "")
