#!/usr/bin/env python3
"""포트폴리오 등락률 TOP5 뉴스 파이프라인.

보유종목 중 당일 장마감 등락률 상승 TOP5 / 하락 TOP5 종목에 대해 뉴스를 검색하고
Claude로 5~10줄 요약을 생성해 MongoDB에 저장한다. run_pipeline.py(매크로 리포트)와는
별개의 독립 파이프라인이며, 시장별로 다른 시각(국내 15:30 / 미국 06:00 KST)에 실행된다.

사용법:
  python run_portfolio_movers.py --market KR
  python run_portfolio_movers.py --market US --date 2026-08-05
  python run_portfolio_movers.py --market KR --dry-run   # Mongo에 쓰지 않고 로컬 JSON만 생성
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timezone
from typing import Any

import requests

import ai_client
import config
import notify_client
import portfolio_client
from collectors import marketaux_news, naver_news
from storage import portfolio_movers_writer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("portfolio_movers")

_SUMMARY_PROMPT = """다음은 "{name}"({ticker}) 종목 관련 최근 뉴스 기사 목록입니다.
이 기사들을 바탕으로 오늘 이 종목의 주가 변동과 관련된 핵심 내용을 5~10줄로 한국어로 요약하세요.

규칙:
- 각 줄은 하나의 완결된 문장으로 작성하세요.
- 기사에 없는 내용을 추측해서 만들어내지 마세요.
- 기사가 이 종목과 무관해 보이면 무시하고, 관련 있는 내용만 요약하세요.
- 반드시 아래 JSON 형식으로만 출력하세요. 설명 텍스트를 절대 포함하지 마세요.

{{"lines": ["...", "..."]}}

기사 목록:
{articles}
"""


def _format_articles(articles: list[dict[str, Any]]) -> str:
    lines = []
    for a in articles:
        desc = (a.get("description") or "")[:200]
        lines.append(f'- title="{a.get("title", "")}" | description="{desc}" | url={a.get("url", "")}')
    return "\n".join(lines)


def _search_news(market: str, ticker: str, name: str) -> list[dict[str, Any]]:
    if market == "KR":
        articles = naver_news.search_keyword(name)
    else:
        try:
            articles = marketaux_news._search_symbol_group([ticker])
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, requests.exceptions.HTTPError) as exc:
            # marketaux 재시도 후에도 실패하면 이 종목만 건너뛰고 나머지 종목/리포트는 계속 진행한다
            # (marketaux_news.collect()의 그룹별 격리 처리와 동일한 정책).
            log.error("marketaux 뉴스 조회 실패 — 건너뜁니다: %s(%s): %s", name, ticker, exc)
            articles = []
    return articles[: config.PORTFOLIO_NEWS_ARTICLES_PER_STOCK]


def _summarize(name: str, ticker: str, articles: list[dict[str, Any]]) -> list[str]:
    if not articles:
        return []
    prompt = _SUMMARY_PROMPT.format(name=name, ticker=ticker, articles=_format_articles(articles))
    try:
        result = ai_client.call_claude_json(prompt)
        lines = result.get("lines", []) if isinstance(result, dict) else []
        return [line for line in lines if isinstance(line, str) and line.strip()][:10]
    except ai_client.ClaudeCallBudgetExceeded:
        raise
    except Exception:
        log.exception("요약 실패: %s(%s)", name, ticker)
        return []


def _pick_movers(holdings: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    top_n = config.PORTFOLIO_MOVERS_TOP_N
    gainers = sorted(
        (h for h in holdings if h.get("changePct", 0) > 0), key=lambda h: h["changePct"], reverse=True
    )[:top_n]
    losers = sorted(
        (h for h in holdings if h.get("changePct", 0) < 0), key=lambda h: h["changePct"]
    )[:top_n]
    return gainers, losers


def _enrich(market: str, holding: dict[str, Any]) -> dict[str, Any]:
    ticker, name = holding["ticker"], holding["name"]
    articles = _search_news(market, ticker, name)
    lines = _summarize(name, ticker, articles)
    return {
        "ticker": ticker,
        "name": name,
        "changePct": holding["changePct"],
        "price": holding["price"],
        "currency": holding.get("currency", "KRW" if market == "KR" else "USD"),
        "newsSummary": lines,
        "articles": [
            {
                "title": a.get("title", ""),
                "url": a.get("url", ""),
                "source": a.get("source", ""),
                "publishedAt": a.get("published_at", ""),
            }
            for a in articles
        ],
    }


def _save_local(target_dir, filename: str, data: Any) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    with open(target_dir / filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def run(market: str, target_date: date, dry_run: bool) -> None:
    log.info("=== 포트폴리오 등락률 TOP5 뉴스 파이프라인 시작: market=%s date=%s ===", market, target_date)

    holdings = portfolio_client.fetch_holdings(market)
    log.info("보유종목 %d개 조회 (시세 조회 성공분만)", len(holdings))
    if not holdings:
        log.warning("보유종목이 없어 종료합니다.")
        return

    gainers, losers = _pick_movers(holdings)
    log.info("상승 TOP%d=%d개, 하락 TOP%d=%d개", config.PORTFOLIO_MOVERS_TOP_N, len(gainers), config.PORTFOLIO_MOVERS_TOP_N, len(losers))
    if not gainers and not losers:
        log.info("등락 종목이 없어 종료합니다.")
        return

    report = {
        "market": market,
        "date": target_date.isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "gainers": [_enrich(market, h) for h in gainers],
        "losers": [_enrich(market, h) for h in losers],
    }
    log.info("Claude 누적 호출 %d회", ai_client.calls_used())

    run_dir = config.PIPELINE_DATA_DIR / "portfolio_movers" / market
    _save_local(run_dir, f"{target_date.isoformat()}.json", report)

    if dry_run:
        log.info("--dry-run: MongoDB 저장을 건너뜁니다. 로컬 산출물: %s", run_dir)
    else:
        portfolio_movers_writer.save_report(report)
        log.info("MongoDB portfolio_movers_reports 컬렉션에 저장 완료 (%s, %s)", market, report["date"])

        market_label = "🇰🇷 국내" if market == "KR" else "🇺🇸 해외"
        top_gainer = gainers[0] if gainers else None
        top_loser = losers[0] if losers else None
        parts = [f"{market_label} 보유종목 등락률 TOP5 리포트가 발행됐어요."]
        if top_gainer:
            parts.append(f"상승 1위 {top_gainer['name']} {top_gainer['changePct']:+.1f}%")
        if top_loser:
            parts.append(f"하락 1위 {top_loser['name']} {top_loser['changePct']:+.1f}%")
        notify_client.notify(
            " ".join(parts),
            web_url=f"{config.PORTFOLIO_API_URL}/reports/movers/{market}/{report['date']}",
            button_title="리포트 보기",
        )

    log.info("=== 파이프라인 완료 ===")


def main() -> None:
    parser = argparse.ArgumentParser(description="포트폴리오 등락률 TOP5 뉴스 파이프라인")
    parser.add_argument("--market", type=str, required=True, choices=["KR", "US"], help="대상 시장")
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD (기본값: 오늘)")
    parser.add_argument("--dry-run", action="store_true", help="MongoDB에 쓰지 않고 로컬 JSON만 생성")
    args = parser.parse_args()

    target_date = date.fromisoformat(args.date) if args.date else date.today()

    try:
        run(args.market, target_date, args.dry_run)
    except Exception:
        log.exception("파이프라인 실행 중 오류 발생 — 리포트를 저장하지 않았습니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
