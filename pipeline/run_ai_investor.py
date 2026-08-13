#!/usr/bin/env python3
"""AI Investor: 주 1회 반자동 장기 포트폴리오 리밸런싱 제안 파이프라인.

run_pipeline.py(매일 국내5+해외5 뉴스레터)와는 별개의 독립 파이프라인이며, 주 1회
(월요일 08:00 KST, 07:30 리포트 이후·09:00 개장 전) 실행되어 현재 보유종목 대비 목표 비중
조정안을 만들고 web 앱에 PENDING 상태로 제출한다. 사람이 웹에서 승인해야 하며, 이번 범위
(Phase A+B)에서는 승인해도 실주문이 나가지 않는다 — pipeline/broker/toss_client.py의 주문
실행(Phase C)이 아직 연결되어 있지 않다.

사용법:
  python run_ai_investor.py                # 오늘이 속한 주의 월요일 기준으로 실행
  python run_ai_investor.py --dry-run       # web에 제출하지 않고 pipeline/data/ai_investor/ 에만 저장
  python run_ai_investor.py --date 2026-08-10
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timedelta

import ai_client
import config
import investor_client
from broker import toss_client
from processing import investor_decide

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("ai_investor")


def _monday_of(target_date: date) -> date:
    return target_date - timedelta(days=target_date.weekday())


def _save_local(target_dir, filename: str, data) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    with open(target_dir / filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def _market_closed_note(target_date: date) -> str | None:
    """target_date에 국내 정규장이 열려있는지 best-effort로 확인한다.

    이번 범위(Phase A+B)는 제안만 만들고 실주문을 내지 않으므로 휴장일이어도 파이프라인을
    막을 이유가 없다 — 참고용 안내문만 붙인다. TOSS_CLIENT_ID/SECRET 미설정이나 API 오류로
    확인에 실패해도 조용히 넘어간다(주간 제안 생성 자체를 막지 않기 위함).
    Phase C(실주문 집행)에서는 이 확인이 선택이 아니라 필수가 된다 — 휴장일에 주문을 내면
    실패하거나 예상치 못하게 처리될 수 있다.
    """
    try:
        if toss_client.is_trading_day(target_date.isoformat()):
            return None
        return "⚠️ 오늘은 국내 증시 휴장일입니다 — 이 제안은 마지막 거래일 종가 기준으로 생성되었습니다."
    except Exception as exc:
        log.info("휴장일 확인 실패(무시하고 진행): %s", exc)
        return None


def run(target_date: date, dry_run: bool) -> None:
    week_of = _monday_of(target_date)
    log.info("=== AI Investor 주간 제안 시작: weekOf=%s (AI_BACKEND=%s) ===", week_of, config.AI_BACKEND)

    market_closed_note = _market_closed_note(target_date)
    if market_closed_note:
        log.warning(market_closed_note)

    state = investor_client.fetch_state()
    log.info(
        "현재 상태: 보유종목 %d개, 가용현금 %.0f원, 설정=%s",
        len(state.get("holdings", [])), state.get("cashKrw", 0.0), state.get("settings"),
    )

    proposal = investor_decide.decide(state, week_of)
    log.info(
        "제안 생성 완료: items=%d개 degraded=%s (claude 누적 호출 %d회)",
        len(proposal["items"]), proposal["degraded"], ai_client.calls_used(),
    )

    market_context = proposal["market_context"]
    if market_closed_note:
        market_context = f"{market_closed_note} {market_context}".strip()

    payload = {
        "weekOf": week_of.isoformat(),
        "marketContext": market_context,
        "degraded": proposal["degraded"],
        "items": proposal["items"],
    }

    run_dir = config.PIPELINE_DATA_DIR / "ai_investor"
    _save_local(run_dir, f"{week_of.isoformat()}.json", payload)

    if dry_run:
        log.info("--dry-run: web 제출을 건너뜁니다. 로컬 산출물: %s", run_dir / f"{week_of.isoformat()}.json")
    else:
        proposal_id = investor_client.submit_proposal(payload)
        log.info("web 앱에 제안 제출 완료 (id=%s) — /investor 페이지에서 승인/거절할 수 있습니다.", proposal_id)

    log.info("=== AI Investor 주간 제안 완료 (claude 총 호출 %d회) ===", ai_client.calls_used())


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Investor 주간 리밸런싱 제안 파이프라인")
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD (기본값: 오늘). 그 주의 월요일 기준으로 저장됨")
    parser.add_argument("--dry-run", action="store_true", help="web에 제출하지 않고 로컬 JSON만 생성")
    args = parser.parse_args()

    target_date = date.fromisoformat(args.date) if args.date else datetime.now().date()

    try:
        run(target_date, args.dry_run)
    except Exception:
        log.exception("AI Investor 파이프라인 실행 중 오류 발생 — 제안을 제출하지 않았습니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
