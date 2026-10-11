"""Stage 6b: 원/달러 환율 분석.

AI Investor 미국 슬리브가 달러로 투자되기 때문에, 매 리포트마다 USD/KRW 환율 지표(yfinance)와
환율 관련 국내 뉴스(Naver)를 모아 Claude에게 원→달러 / 달러→원 환전 관점의 판단을 받는다.
결과는 리포트 문서의 `fxAnalysis` 필드로 저장되어 web의 "오늘의 시장 분석" 아래에 표시되고
(web/components/FxAnalysisCard.tsx), 주간 AI Investor 미국 제안 프롬프트에도 참고 컨텍스트로
들어간다(processing/investor_decide.py).

이 단계는 부가 정보라 **어떤 이유로 실패해도 리포트 생성을 막지 않는다** — 환율 지표 자체를 못
가져오면 None(필드 생략), Claude 판단만 실패하면 지표/헤드라인만 담고 aiDegraded=True로 저장한다.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

import pandas as pd
import requests
import yfinance as yf

import ai_client
import config
from collectors import naver_news
from processing import clean as clean_stage
from processing import technical as technical_stage

log = logging.getLogger("pipeline.fx_analysis")

_USDKRW_SYMBOL = "KRW=X"
# 환율 판단의 참고 지표 (yfinance 심볼, 화면 표시명). 조회 실패한 항목은 조용히 빠진다.
_CONTEXT_SYMBOLS = [
    ("DX-Y.NYB", "달러인덱스(DXY)"),
    ("^TNX", "미 10년물 국채금리(%)"),
]
# 거래일 기준 1주/1개월/3개월.
_DAYS_1W, _DAYS_1M, _DAYS_3M = 5, 21, 63
_MAX_NEWS_IN_PROMPT = 25
_MAX_HEADLINES = 5

_VALID_STANCES = {"favorable", "neutral", "unfavorable"}
_VALID_OUTLOOKS = {"up", "down", "sideways"}

_PROMPT_TEMPLATE = """당신은 원/달러 환율을 분석하는 외환 애널리스트입니다. 한국 거주 개인투자자가 미국 주식 투자를 위해
원화를 달러로 바꾸거나(원→달러), 보유 달러를 원화로 되돌릴지(달러→원) 판단하는 데 참고할 분석을 작성하세요.

[USD/KRW 지표] (환율은 1달러당 원화. 상승 = 원화 약세/달러 강세)
{indicators}

[참고 지표]
{context}

[최근 환율 관련 뉴스]
{news}

작성 규칙:
- summary: 오늘 원/달러 환율 흐름과 원인을 2~3문장으로 요약하세요.
- outlook: 향후 1~2주 환율 방향 전망. up(환율 상승=원화 약세) / down(환율 하락=원화 강세) / sideways(박스권) 중 하나.
- drivers: 환율을 움직이는 핵심 요인 2~4개 (각 1문장 이내, 예: 연준 금리 경로, 외국인 수급, 수출입 결제, 당국 개입 경계).
- krw_to_usd: 지금 원화를 달러로 바꾸는 것(미국 주식 매수 대기자금 환전)에 대한 판단.
  stance는 favorable(환전하기 유리한 편) / neutral / unfavorable(불리한 편 — 분할 또는 대기 고려) 중 하나,
  comment는 1~2문장 근거.
- usd_to_krw: 지금 달러를 원화로 되돌리는 것에 대한 같은 형식의 판단.
- 지표의 3개월 고점/저점 대비 현재 위치, 추세, 단기 과열(RSI) 여부를 근거로 활용하세요.
- 환율 예측은 불확실하다는 전제로, 단정 표현 대신 "분할 환전", "~가능성" 같은 표현을 쓰세요.

반드시 아래 JSON 형식으로만 출력하세요. 설명 텍스트를 절대 포함하지 마세요.

{{
  "summary": "...",
  "outlook": "up",
  "drivers": ["...", "..."],
  "krw_to_usd": {{"stance": "neutral", "comment": "..."}},
  "usd_to_krw": {{"stance": "neutral", "comment": "..."}}
}}
"""


def _download_close(symbol: str, period: str = "6mo") -> pd.Series | None:
    df = yf.download(symbol, period=period, interval="1d", progress=False, auto_adjust=True)
    if df is None or df.empty:
        return None
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    close = df["Close"].dropna()
    return close if len(close) >= 2 else None


def _pct_change_over(close: pd.Series, days: int) -> float | None:
    if len(close) <= days:
        return None
    base = float(close.iloc[-1 - days])
    return round((float(close.iloc[-1]) - base) / base * 100, 2) if base else None


def collect_indicators() -> dict[str, Any] | None:
    """USD/KRW 핵심 지표. 환율 시계열을 못 가져오면 None (이 단계 전체를 건너뛴다)."""
    close = _download_close(_USDKRW_SYMBOL)
    if close is None or len(close) < config.EMA_PERIODS[-1]:
        return None

    recent = close.iloc[-_DAYS_3M:]
    rsi = technical_stage._rsi(close, config.RSI_PERIOD).iloc[-1]
    return {
        "rate": round(float(close.iloc[-1]), 2),
        "changePct": _pct_change_over(close, 1),
        "change1wPct": _pct_change_over(close, _DAYS_1W),
        "change1mPct": _pct_change_over(close, _DAYS_1M),
        "high3m": round(float(recent.max()), 2),
        "low3m": round(float(recent.min()), 2),
        "rsi": round(float(rsi), 1) if pd.notna(rsi) else None,
        "emaTrend": technical_stage._ema_trend(close),
        "volatilityPct": technical_stage._annualized_volatility_pct(close),
    }


def collect_context() -> list[dict[str, Any]]:
    context = []
    for symbol, label in _CONTEXT_SYMBOLS:
        try:
            close = _download_close(symbol, period="3mo")
        except Exception as exc:  # yfinance는 네트워크/파싱 예외 타입이 일정하지 않다
            log.info("참고 지표 조회 실패(무시): %s — %s", symbol, exc)
            continue
        if close is None:
            continue
        context.append(
            {
                "label": label,
                "value": round(float(close.iloc[-1]), 2),
                "changePct": _pct_change_over(close, 1),
                "change1mPct": _pct_change_over(close, _DAYS_1M),
            }
        )
    return context


def collect_news(target_date: date) -> list[dict[str, Any]]:
    """환율 키워드로 Naver 뉴스를 따로 검색한다. 메인 수집분(Stage 1~2)은 200건 상한 + 카테고리 비율로
    잘려 환율 기사가 충분히 남지 않을 수 있어 재사용하지 않는다. 실패해도 빈 리스트로 진행한다."""
    articles: list[dict[str, Any]] = []
    for keyword in config.FX_NEWS_KEYWORDS:
        try:
            articles.extend(naver_news.search_keyword(keyword))
        except (requests.exceptions.RequestException, RuntimeError) as exc:
            log.warning("환율 뉴스 수집 실패(무시): %s — %s", keyword, exc)
    filtered = clean_stage.remove_noise(clean_stage.dedupe(clean_stage.filter_by_date(articles, target_date)))
    return filtered[:_MAX_NEWS_IN_PROMPT]


def _fmt_pct(value: float | None) -> str:
    return "-" if value is None else f"{value:+.2f}%"


def _format_indicators(ind: dict[str, Any]) -> str:
    return (
        f"- 현재 {ind['rate']:,.2f}원 | 전일 대비 {_fmt_pct(ind['changePct'])} | 1주 {_fmt_pct(ind['change1wPct'])} | "
        f"1개월 {_fmt_pct(ind['change1mPct'])}\n"
        f"- 3개월 고점 {ind['high3m']:,.2f}원 / 저점 {ind['low3m']:,.2f}원\n"
        f"- RSI(14)={ind['rsi'] if ind['rsi'] is not None else '-'} | 이평추세(5/20/60)={ind['emaTrend']} | "
        f"연율 변동성={ind['volatilityPct'] if ind['volatilityPct'] is not None else '-'}%"
    )


def _format_context(context: list[dict[str, Any]]) -> str:
    if not context:
        return "(조회 실패)"
    return "\n".join(
        f"- {c['label']}: {c['value']:,.2f} | 전일 대비 {_fmt_pct(c['changePct'])} | 1개월 {_fmt_pct(c['change1mPct'])}"
        for c in context
    )


def _format_news(news: list[dict[str, Any]]) -> str:
    if not news:
        return "(관련 뉴스 없음)"
    return "\n".join(f'- title="{a.get("title", "")}" | description="{(a.get("description") or "")[:150]}"' for a in news)


def _parse_stance(raw: Any) -> dict[str, str]:
    raw = raw if isinstance(raw, dict) else {}
    stance = raw.get("stance") if raw.get("stance") in _VALID_STANCES else "neutral"
    return {"stance": stance, "comment": str(raw.get("comment") or "")}


def _parse_llm_response(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict) or not raw.get("summary"):
        raise ValueError("응답에 summary가 없습니다.")
    krw_to_usd = _parse_stance(raw.get("krw_to_usd"))
    usd_to_krw = _parse_stance(raw.get("usd_to_krw"))
    # 같은 시점에 "원→달러도 유리, 달러→원도 유리"는 모순이다 — 둘 다 favorable이면 판단을 신뢰하지 않고
    # 둘 다 neutral로 내린다 (LLM 출력을 그대로 믿지 않는다는 파이프라인 공통 원칙).
    if krw_to_usd["stance"] == "favorable" and usd_to_krw["stance"] == "favorable":
        krw_to_usd["stance"] = usd_to_krw["stance"] = "neutral"
    drivers = raw.get("drivers")
    return {
        "summary": str(raw["summary"]),
        "outlook": raw.get("outlook") if raw.get("outlook") in _VALID_OUTLOOKS else "sideways",
        "drivers": [str(d) for d in drivers if d][:4] if isinstance(drivers, list) else [],
        "krwToUsd": krw_to_usd,
        "usdToKrw": usd_to_krw,
    }


def analyze(target_date: date) -> dict[str, Any] | None:
    """web/lib/types.ts 의 FxAnalysis 구조를 반환한다. 환율 지표를 못 가져오면 None."""
    try:
        indicators = collect_indicators()
    except Exception as exc:
        log.warning("USD/KRW 지표 조회 실패 — 환율 분석을 건너뜁니다: %s", exc)
        return None
    if indicators is None:
        log.warning("USD/KRW 시계열이 부족해 환율 분석을 건너뜁니다.")
        return None

    context = collect_context()
    news = collect_news(target_date)
    result: dict[str, Any] = {
        "pair": "USD/KRW",
        **indicators,
        "context": context,
        "headlines": [
            {"title": a.get("title", ""), "url": a.get("url", ""), "publishedAt": a.get("published_at", "")}
            for a in news[:_MAX_HEADLINES]
        ],
        "aiDegraded": False,
    }

    prompt = _PROMPT_TEMPLATE.format(
        indicators=_format_indicators(indicators),
        context=_format_context(context),
        news=_format_news(news),
    )
    try:
        result.update(_parse_llm_response(ai_client.call_claude_json(prompt)))
    except (ai_client.ClaudeCallError, ai_client.ClaudeCallBudgetExceeded, ValueError, TypeError) as exc:
        log.warning("환율 AI 분석 실패 — 지표/헤드라인만 저장합니다: %s", exc)
        result["aiDegraded"] = True

    return result
