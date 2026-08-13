"""AI Investor: 주 1회 반자동 장기 포트폴리오 리밸런싱 제안 생성.

최근 리포트 이력(run_pipeline.py가 매일 쌓는 reports 컬렉션)에서 "컨빅션 통계"(연속 추천
등장 횟수 + 최신 지표)를 뽑고, 현재 보유종목과 함께 Claude CLI에 넘겨 목표 비중 조정안을
JSON으로 받는다.

**중요**: LLM이 제안한 target_weight_pct/종목수는 절대 그대로 신뢰하지 않는다.
`enforce_constraints()`가 종목당/섹터당 비중상한·변동성 역가중·최대 종목수·현금버퍼를 코드
레벨에서 강제 클램프한 뒤에만 저장 대상이 된다. 그 뒤에도 리밸런싱 밴드(너무 작은 조정은
취소)와 추세 기반 강제 손절(연속 매도신호/하락추세는 AI 판단과 무관하게 EXIT)을 코드가 한 번
더 덮어쓴다. Claude 응답 파싱/검증에 실패하면 processing/recommend.py의 규칙기반 폴백
(_heuristic_selection)과 달리 대체 매매안을 만들지 않고 빈 제안(degraded=True)으로 안전
정지한다 — 실거래와 연결되는 로직이기 때문이다.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from pymongo import MongoClient

import ai_client
import config
from processing import technical as technical_stage
from storage import investor_signal_writer

log = logging.getLogger("pipeline.investor_decide")

_VALID_ACTIONS = {"NEW_BUY", "ADD", "TRIM", "EXIT", "HOLD"}
# 최근 리포트에 이 횟수 미만으로 등장한 종목은 컨빅션이 약하다고 보고 신규 편입 후보에서 제외한다.
_MIN_APPEARANCES_FOR_CANDIDATE = 2
_MAX_CANDIDATES_IN_PROMPT = 20

_PROMPT_TEMPLATE = """당신은 장기 보유 목적의 국내 주식 포트폴리오를 운용하는 AI Investor입니다.
아래 제약 조건을 목표로 제안하세요 (최종 검증/강제는 별도로 코드가 수행합니다):
- 총 보유 종목 수는 최대 {max_positions}개를 넘지 않습니다.
- 종목당 목표 비중은 최대 {max_weight_pct}%를 넘지 않습니다.
- 전체 목표 비중 합계는 (100% - {cash_buffer_pct}%)를 넘지 않습니다 (현금 버퍼 유지).
- 컨빅션이 확실하지 않다면 굳이 최대 종목수를 다 채우지 않아도 됩니다.
- 단타가 아닌 장기 보유가 목적입니다. 뚜렷한 이유(추세 훼손/리스크 급증/더 나은 대안) 없이
  기존 보유종목을 EXIT하지 마세요. 비중 조절은 분할매수/분할매도가 가능하므로 ADD/TRIM으로
  점진적으로 하세요.

현재 보유종목 (비중은 최근 종가 기준 추정치):
{holdings}

신규 편입 후보 (최근 {lookback_days}일 리포트에서의 등장 통계 및 최신 지표):
{candidates}

보유종목과 후보 각각에 대해 action(NEW_BUY/ADD/TRIM/EXIT/HOLD), target_weight_pct(0~100 숫자),
conviction_score(0~100 정수), rationale(1~2문장, 편입/편출/유지 근거)을 작성하세요.
market_context에는 이번 주 전체 판단을 1~2문장으로 요약하세요.
"투자 권유가 아닌 AI 참고 제안"이라는 전제로, 매수/매도 단정 표현은 피하세요.

반드시 아래 JSON 형식으로만 출력하세요. 설명 텍스트를 절대 포함하지 마세요.

{{
  "market_context": "...",
  "items": [
    {{"ticker": "005930", "name": "삼성전자", "action": "ADD", "target_weight_pct": 15.0,
      "conviction_score": 70, "rationale": "..."}}
  ]
}}
"""


def _load_universe_by_ticker() -> dict[str, dict[str, Any]]:
    with open(config.UNIVERSE_PATH, encoding="utf-8") as f:
        stocks = json.load(f)["stocks"]
    return {s["ticker"]: s for s in stocks}


def _reports_collection():
    if not config.MONGODB_URI:
        raise RuntimeError("MONGODB_URI 가 설정되어 있지 않습니다.")
    client = MongoClient(config.MONGODB_URI)
    return client[config.MONGODB_DB]["reports"]


def fetch_recent_kr_recommendations(lookback_days: int | None = None) -> list[dict[str, Any]]:
    """최근 lookback_days일 리포트에서 국내(KR) 추천 종목만 모아 반환한다."""
    lookback_days = lookback_days if lookback_days is not None else config.INVESTOR_LOOKBACK_DAYS
    cutoff = (date.today() - timedelta(days=lookback_days)).isoformat()
    collection = _reports_collection()
    docs = list(collection.find({"date": {"$gte": cutoff}}, {"recommendations": 1, "date": 1, "hour": 1}))

    entries = []
    for doc in docs:
        for rec in doc.get("recommendations", []):
            if rec.get("region") != "KR":
                continue
            entries.append({**rec, "_reportDate": doc.get("date", ""), "_reportHour": doc.get("hour", 0)})
    return entries


def build_conviction_stats(entries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """티커별로 등장 횟수 + 가장 최근 항목(rationale/technical/market 등)을 집계한다."""
    by_ticker: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in entries:
        by_ticker[e["ticker"]].append(e)

    stats = {}
    for ticker, items in by_ticker.items():
        items.sort(key=lambda e: (e["_reportDate"], e["_reportHour"]), reverse=True)
        latest = items[0]
        stats[ticker] = {
            "ticker": ticker,
            "name": latest.get("name", ticker),
            "market": latest.get("market"),
            "sector": latest.get("sector"),
            "theme": latest.get("theme"),
            "appearances": len(items),
            "latestRationale": latest.get("rationale", ""),
            "latestRiskFlags": latest.get("riskFlags", []),
            "latestTechnical": latest.get("technical"),
        }
    return stats


def _fetch_holding_technical(ticker: str, universe_by_ticker: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    # 보유종목이 universe.json(시가총액 상위 시드 리스트)에서 이미 빠졌을 수도 있어(과거 편입분 등)
    # 시장 구분을 모르면 KOSPI로 가정한다. 실패해도 avgPrice로 대체되므로 안전하다.
    market = universe_by_ticker.get(ticker, {}).get("market", "KOSPI")
    try:
        return technical_stage.get_technical_signal(ticker, market)
    except Exception:
        log.warning("보유종목 기술적 분석 조회 실패, 평단가로 대체: %s", ticker)
        return None


def _format_holdings(holdings_with_weight: list[dict[str, Any]]) -> str:
    if not holdings_with_weight:
        return "(없음 — 전액 현금 상태)"
    lines = []
    for h in holdings_with_weight:
        t = h.get("technical") or {}
        lines.append(
            f"- {h['ticker']} ({h['name']}) | 현재비중={h['currentWeightPct']:.1f}% | "
            f"RSI={t.get('rsi', '-')} 이평추세={t.get('emaTrend', '-')} "
            f"buyScore={t.get('buyScore', '-')} sellScore={t.get('sellScore', '-')} "
            f"signal={t.get('signal', '-')} 변동성={t.get('volatilityPct', '-')}%"
        )
    return "\n".join(lines)


def _format_candidates(candidates: list[dict[str, Any]]) -> str:
    if not candidates:
        return "(없음)"
    lines = []
    for c in candidates:
        t = c.get("latestTechnical") or {}
        lines.append(
            f"- {c['ticker']} ({c['name']}) | 섹터={c.get('sector')} | 테마={c.get('theme')} | "
            f"최근등장={c['appearances']}회 | RSI={t.get('rsi', '-')} 이평추세={t.get('emaTrend', '-')} "
            f"buyScore={t.get('buyScore', '-')} signal={t.get('signal', '-')} 변동성={t.get('volatilityPct', '-')}% | "
            f"근거=\"{c.get('latestRationale', '')}\""
        )
    return "\n".join(lines)


def _median(values: list[float]) -> float | None:
    vals = sorted(v for v in values if v is not None and v > 0)
    if not vals:
        return None
    n = len(vals)
    mid = n // 2
    return vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2


def enforce_constraints(
    proposal: dict[str, Any], settings: dict[str, Any], aux_by_ticker: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """LLM이 제안한 target_weight_pct/종목수를 설정값 상한으로 강제 클램프한다.
    이 함수를 거치지 않은 제안은 절대 저장/제출하지 않는다 — LLM 출력을 신뢰하지 않는 안전장치.

    aux_by_ticker: {ticker: {"sector": str | None, "volatilityPct": float | None}}
    """
    max_positions = settings["maxPositions"]
    max_weight_pct = settings["maxWeightPct"]
    cash_buffer_pct = settings["cashBufferPct"]
    max_sector_weight_pct = settings.get("maxSectorWeightPct", 100)
    max_total_pct = max(0.0, 100 - cash_buffer_pct)

    items = [dict(item) for item in proposal.get("items", [])]

    # 1) 종목당 비중 상한 클램프 (음수 방지 포함)
    for item in items:
        item["target_weight_pct"] = max(0.0, min(item.get("target_weight_pct", 0.0), max_weight_pct))

    # 2) 변동성 역가중: 이 배치(보유종목+후보) 중간값보다 변동성이 큰 종목은 비중 상한을 그만큼 더
    #    깎는다 (낮은 변동성 종목을 max_weight_pct 위로 끌어올리진 않음 — 위험 기여도를 맞추는 목적).
    median_vol = _median([aux_by_ticker.get(i["ticker"], {}).get("volatilityPct") for i in items])
    if median_vol:
        for item in items:
            vol = aux_by_ticker.get(item["ticker"], {}).get("volatilityPct")
            if vol and vol > median_vol:
                vol_cap = max_weight_pct * (median_vol / vol)
                item["target_weight_pct"] = min(item["target_weight_pct"], vol_cap)

    # 3) 실제로 비중을 갖는(EXIT이 아니고 target>0) 종목수가 상한을 넘으면 컨빅션 낮은 순으로 드롭
    active = [i for i in items if i["action"] != "EXIT" and i.get("target_weight_pct", 0) > 0]
    if len(active) > max_positions:
        active.sort(key=lambda i: i.get("conviction_score", 0))
        dropped_tickers = {i["ticker"] for i in active[: len(active) - max_positions]}
        for item in items:
            if item["ticker"] in dropped_tickers:
                item["target_weight_pct"] = 0.0
                # 신규 편입 후보였다면 "보류"(HOLD)로, 이미 보유 중이던 종목이었다면 "편출"(EXIT)로 표기한다
                # (전자를 EXIT로 표기하면 실제로는 산 적도 없는 종목을 "편출"한 것처럼 보여 UI가 어색해짐).
                item["action"] = "HOLD" if item["action"] in ("HOLD", "NEW_BUY") else "EXIT"
                item["rationale"] = (
                    item.get("rationale", "") + " [리스크 상한: 최대 종목수 초과로 코드 단계에서 자동 제외됨]"
                )

    # 4) 섹터 집중도 캡: 섹터 비중 합계가 상한을 넘으면 그 섹터 내에서 비례 축소
    by_sector: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        if item.get("target_weight_pct", 0) > 0:
            sector = aux_by_ticker.get(item["ticker"], {}).get("sector") or "UNKNOWN"
            by_sector[sector].append(item)
    for sector_items in by_sector.values():
        sector_total = sum(i["target_weight_pct"] for i in sector_items)
        if sector_total > max_sector_weight_pct > 0:
            scale = max_sector_weight_pct / sector_total
            for i in sector_items:
                i["target_weight_pct"] = round(i["target_weight_pct"] * scale, 2)

    # 5) 총 비중이 (100-현금버퍼)를 넘으면 비례 축소
    total_pct = sum(i.get("target_weight_pct", 0) for i in items)
    if total_pct > max_total_pct > 0:
        scale = max_total_pct / total_pct
        for item in items:
            item["target_weight_pct"] = round(item.get("target_weight_pct", 0) * scale, 2)

    return {**proposal, "items": items}


def _apply_rebalance_band(items: list[dict[str, Any]], band_pct: float) -> None:
    """목표비중과 현재비중 차이가 band_pct(%p) 미만인 ADD/TRIM은 취소(HOLD)한다 — 과매매·수수료·
    세금 낭비 방지. NEW_BUY(신규 편입)와 EXIT(완전 편출)는 "드리프트 조정"이 아니라 별도의 진입/청산
    판단이므로 밴드를 적용하지 않는다."""
    for item in items:
        if item["action"] not in ("ADD", "TRIM"):
            continue
        drift = abs(item["targetWeightPct"] - item["currentWeightPct"])
        if drift < band_pct:
            item["action"] = "HOLD"
            item["targetWeightPct"] = item["currentWeightPct"]
            item["rationale"] += f" [리밸런싱 밴드: 목표-현재 비중차({drift:.1f}%p)가 {band_pct}%p 미만이라 보류됨]"


def _apply_trend_based_exit(items: list[dict[str, Any]], holdings_by_ticker: dict[str, dict[str, Any]]) -> None:
    """N주 연속 매도신호 또는 하락추세인 보유종목은 AI 판단과 무관하게 강제 EXIT한다
    (추세/펀더멘털 훼손 기반 손절 — 단순 가격 -N% 손절보다 단기 휩소에 덜 흔들림)."""
    threshold = config.INVESTOR_EXIT_AFTER_CONSECUTIVE_WEEKS
    for item in items:
        if item["ticker"] not in holdings_by_ticker or item["action"] == "EXIT":
            continue
        sell_weeks = investor_signal_writer.consecutive_sell_weeks(item["ticker"])
        down_weeks = investor_signal_writer.consecutive_down_trend_weeks(item["ticker"])
        reason = None
        if sell_weeks >= threshold:
            reason = f"{sell_weeks}주 연속 매도 신호"
        elif down_weeks >= threshold:
            reason = f"{down_weeks}주 연속 하락 추세"
        if reason:
            item["action"] = "EXIT"
            item["targetWeightPct"] = 0.0
            item["rationale"] += f" [추세 기반 손절 규칙: {reason} — 코드 단계에서 자동 EXIT으로 강제됨]"


def _parse_llm_response(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict) or not isinstance(raw.get("items"), list):
        raise ValueError("응답에 items 배열이 없습니다.")

    items = []
    for item in raw["items"]:
        if not isinstance(item, dict) or item.get("ticker") is None:
            continue
        action = item.get("action")
        if action not in _VALID_ACTIONS:
            continue
        items.append(
            {
                "ticker": item["ticker"],
                "name": item.get("name") or item["ticker"],
                "action": action,
                "target_weight_pct": float(item.get("target_weight_pct", 0) or 0),
                "conviction_score": int(item.get("conviction_score", 0) or 0),
                "rationale": item.get("rationale", ""),
                "riskFlags": item.get("riskFlags") or item.get("risk_flags") or [],
            }
        )
    return {"market_context": raw.get("market_context", ""), "items": items}


def decide(state: dict[str, Any], week_of: date) -> dict[str, Any]:
    """investor_client.fetch_state()의 반환값(state)과 이번 결정 기준일(week_of)을 받아
    검증된 주간 제안 dict를 반환한다.

    반환 형식은 investor_client.submit_proposal()에 그대로 넘길 수 있는 형태
    (weekOf 제외 — 그건 run_ai_investor.py에서 채운다):
    {market_context, degraded, items: [{ticker, name, action, targetWeightPct,
     currentWeightPct, convictionScore, rationale, riskFlags}]}
    """
    holdings = state.get("holdings", [])
    cash_krw = state.get("cashKrw", 0.0)
    settings = state["settings"]

    universe_by_ticker = _load_universe_by_ticker()
    entries = fetch_recent_kr_recommendations()
    stats = build_conviction_stats(entries)

    holdings_by_ticker = {h["ticker"]: h for h in holdings}
    priced: dict[str, float] = {}
    technical_by_ticker: dict[str, dict[str, Any] | None] = {}
    for h in holdings:
        technical = _fetch_holding_technical(h["ticker"], universe_by_ticker)
        technical_by_ticker[h["ticker"]] = technical
        price = technical["price"] if technical else h["avgPrice"]
        priced[h["ticker"]] = price * h["quantity"]
        # 추세 기반 손절 판단용 이력 기록. dry-run 여부와 무관하게 남긴다 — 이건 web 제출과
        # 별개인 파이프라인 내부 기록이라, 기록을 건너뛰면 연속 카운트 자체가 끊겨버린다.
        if technical:
            investor_signal_writer.record(h["ticker"], week_of, technical["signal"], technical["emaTrend"])

    total_value = sum(priced.values()) + cash_krw
    holdings_with_weight = [
        {
            **h,
            "currentWeightPct": (priced[h["ticker"]] / total_value * 100) if total_value else 0.0,
            "technical": technical_by_ticker[h["ticker"]],
        }
        for h in holdings
    ]
    current_weight_by_ticker = {h["ticker"]: h["currentWeightPct"] for h in holdings_with_weight}

    candidates = [c for ticker, c in stats.items() if ticker not in holdings_by_ticker]
    candidates = [c for c in candidates if c["appearances"] >= _MIN_APPEARANCES_FOR_CANDIDATE]
    candidates.sort(key=lambda c: c["appearances"], reverse=True)
    candidates = candidates[:_MAX_CANDIDATES_IN_PROMPT]

    # enforce_constraints(섹터캡/변동성캡)에 쓸 보조 정보. 보유종목은 이번에 새로 조회한 기술적
    # 신호에서, 후보는 리포트에 저장돼 있던 최신 기술적 신호에서 가져온다.
    aux_by_ticker: dict[str, dict[str, Any]] = {}
    for h in holdings:
        t = technical_by_ticker.get(h["ticker"]) or {}
        aux_by_ticker[h["ticker"]] = {
            "sector": universe_by_ticker.get(h["ticker"], {}).get("sector"),
            "volatilityPct": t.get("volatilityPct"),
        }
    for c in candidates:
        aux_by_ticker[c["ticker"]] = {
            "sector": c.get("sector"),
            "volatilityPct": (c.get("latestTechnical") or {}).get("volatilityPct"),
        }

    prompt = _PROMPT_TEMPLATE.format(
        max_positions=settings["maxPositions"],
        max_weight_pct=settings["maxWeightPct"],
        cash_buffer_pct=settings["cashBufferPct"],
        holdings=_format_holdings(holdings_with_weight),
        candidates=_format_candidates(candidates),
        lookback_days=config.INVESTOR_LOOKBACK_DAYS,
    )

    try:
        raw = ai_client.call_claude_json(prompt)
        proposal = _parse_llm_response(raw)
    except (ai_client.ClaudeCallError, ai_client.ClaudeCallBudgetExceeded, ValueError, TypeError) as exc:
        log.warning("AI Investor 판단 실패 — 이번 회차는 안전하게 빈 제안으로 정지합니다: %s", exc)
        return {
            "market_context": "AI 판단 생성에 실패해 이번 회차는 빈 제안으로 정지되었습니다.",
            "degraded": True,
            "items": [],
        }

    # 안전장치: 프롬프트에 실제로 제시한 티커(보유종목 + 후보) 밖의 티커는 LLM 환각으로 간주해 버린다
    # (processing/recommend.py의 "유니버스 밖 티커는 무시" 안전장치와 동일한 취지).
    known_tickers = set(holdings_by_ticker) | {c["ticker"] for c in candidates}
    hallucinated = [i for i in proposal["items"] if i["ticker"] not in known_tickers]
    if hallucinated:
        log.warning(
            "제시하지 않은 티커를 AI가 제안해 제외합니다: %s", [i["ticker"] for i in hallucinated]
        )
        proposal = {**proposal, "items": [i for i in proposal["items"] if i["ticker"] in known_tickers]}

    validated = enforce_constraints(proposal, settings, aux_by_ticker)

    items = [
        {
            "ticker": item["ticker"],
            "name": item["name"],
            "action": item["action"],
            "targetWeightPct": item["target_weight_pct"],
            "currentWeightPct": current_weight_by_ticker.get(item["ticker"], 0.0),
            "convictionScore": item["conviction_score"],
            "rationale": item["rationale"],
            "riskFlags": item["riskFlags"],
        }
        for item in validated["items"]
    ]

    _apply_rebalance_band(items, settings.get("rebalanceBandPct", 0))
    _apply_trend_based_exit(items, holdings_by_ticker)

    return {"market_context": validated["market_context"], "degraded": False, "items": items}
