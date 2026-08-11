#!/usr/bin/env python3
"""파이프라인 오케스트레이터. methodology.html 의 7+1단계를 순서대로 실행한다.

사용법:
  python run_pipeline.py                      # 오늘 날짜, 현재 시각과 가장 가까운 07:30/19:30 슬롯
  python run_pipeline.py --date 2026-08-04 --hour 19
  python run_pipeline.py --dry-run            # Mongo에 쓰지 않고 pipeline/data/ 에만 JSON 저장
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import date, datetime, timedelta

import config
import ai_client
from collectors import marketaux_news, naver_news
from processing import candidates as candidates_stage
from processing import classify as classify_stage
from processing import clean as clean_stage
from processing import recommend as recommend_stage
from processing import summarize as summarize_stage
from storage import mongo_writer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("pipeline")


# 리포트 생성 슬롯: 아침 07:30 / 저녁 19:30 (KST) 하루 2회.
REPORT_SLOTS: list[tuple[int, int]] = [(7, 30), (19, 30)]
_SLOT_MINUTE_BY_HOUR = dict(REPORT_SLOTS)


def _nearest_hour_slot(now: datetime) -> int:
    now_minutes = now.hour * 60 + now.minute
    hour, _minute = min(REPORT_SLOTS, key=lambda s: abs(s[0] * 60 + s[1] - now_minutes))
    return hour


def _minute_for_hour(hour: int) -> int:
    """--hour 로 수동 지정된 슬롯이 아닌 값이 들어와도(backfill 등) 30분으로 취급한다."""
    return _SLOT_MINUTE_BY_HOUR.get(hour, 30)


def _cleanup_old_data() -> None:
    if not config.PIPELINE_DATA_DIR.exists():
        return
    cutoff = date.today() - timedelta(days=config.PIPELINE_DATA_RETENTION_DAYS)
    for entry in config.PIPELINE_DATA_DIR.iterdir():
        if not entry.is_dir():
            continue
        try:
            entry_date = date.fromisoformat(entry.name)
        except ValueError:
            continue
        if entry_date < cutoff:
            shutil.rmtree(entry, ignore_errors=True)
            log.info("오래된 데이터 삭제: %s", entry)


def _load_universe() -> list[dict]:
    with open(config.UNIVERSE_PATH, encoding="utf-8") as f:
        return json.load(f)["stocks"]


def _save_local(target_dir, filename: str, data) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    with open(target_dir / filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def run(target_date: date, hour: int, dry_run: bool) -> None:
    minute = _minute_for_hour(hour)
    run_dir = config.PIPELINE_DATA_DIR / target_date.isoformat() / f"{hour:02d}{minute:02d}"
    log.info("=== 파이프라인 시작: %s %02d:%02d (AI_BACKEND=%s) ===", target_date, hour, minute, config.AI_BACKEND)

    universe = _load_universe()
    universe_by_ticker = {u["ticker"]: u for u in universe}

    # Stage 1: 뉴스 수집
    log.info("[1/7] 뉴스 수집")
    naver_articles = naver_news.collect()
    marketaux_articles = marketaux_news.collect()
    raw_articles = naver_articles + marketaux_articles
    log.info("  naver=%d marketaux=%d total=%d", len(naver_articles), len(marketaux_articles), len(raw_articles))

    # Stage 2: 전처리 & 필터링
    log.info("[2/7] 전처리 & 필터링")
    cleaned = clean_stage.clean(raw_articles, target_date)
    log.info("  cleaned=%d", len(cleaned))
    _save_local(run_dir, "cleaned_articles.json", cleaned)

    # Stage 3: AI 기사 분류
    log.info("[3/7] AI 기사 분류 (claude 호출 %d회 예상)", (len(cleaned) + config.CLASSIFY_BATCH_SIZE - 1) // config.CLASSIFY_BATCH_SIZE)
    classified = classify_stage.classify(cleaned)
    log.info("  classified=%d (claude 누적 호출 %d회)", len(classified), ai_client.calls_used())

    # Stage 4: 카테고리별 요약
    log.info("[4/7] 카테고리별 요약")
    category_summaries = summarize_stage.summarize(classified)
    _save_local(run_dir, "summary.json", category_summaries)
    log.info("  카테고리 %d개 요약 완료 (claude 누적 호출 %d회)", len(category_summaries), ai_client.calls_used())

    # Stage 5: 종목 후보 도출
    log.info("[5/7] 종목 후보 도출")
    theme_groups = candidates_stage.derive_candidates(category_summaries, universe)
    flat_candidates = candidates_stage.flatten_candidates(theme_groups)
    _save_local(run_dir, "candidates.json", theme_groups)
    log.info("  테마 %d개, 후보 종목 %d개 (claude 누적 호출 %d회)", len(theme_groups), len(flat_candidates), ai_client.calls_used())

    # Stage 6 (+5b 기술분석, +S 감성분석은 내부에서 병합)
    log.info("[6/7] 최종 추천 선별 + 기술/감성 병합")
    market_context, recommendations, degraded = recommend_stage.select_and_enrich(
        flat_candidates, universe_by_ticker, marketaux_articles
    )
    if degraded:
        log.warning("  AI 최종 선별 실패 — 규칙 기반 폴백으로 대체된 리포트입니다.")
    log.info("  최종 추천 %d종목 (claude 누적 호출 %d회)", len(recommendations), ai_client.calls_used())

    if len(recommendations) < 2:
        raise RuntimeError(f"최종 추천 종목이 너무 적습니다 ({len(recommendations)}개) — 리포트를 저장하지 않습니다.")

    report = {
        "date": target_date.isoformat(),
        "hour": hour,
        "minute": minute,
        "marketContext": market_context,
        "recommendations": recommendations,
        "categorySummaries": category_summaries,
        "selectionDegraded": degraded,
    }
    _save_local(run_dir, "recommendation.json", report)

    # Stage 7: 저장 & 배포
    log.info("[7/7] MongoDB 저장")
    if dry_run:
        log.info("  --dry-run: MongoDB 저장을 건너뜁니다. 로컬 산출물: %s", run_dir)
    else:
        mongo_writer.save_report(report)
        log.info("  MongoDB reports 컬렉션에 저장 완료 (%s %02d:%02d)", report["date"], report["hour"], report["minute"])

    log.info("=== 파이프라인 완료 (claude 총 호출 %d회) ===", ai_client.calls_used())


def main() -> None:
    parser = argparse.ArgumentParser(description="Stock Analyzer 리포트 파이프라인")
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD (기본값: 오늘)")
    parser.add_argument("--hour", type=int, default=None, choices=[7, 19], help="기본값: 현재 시각과 가장 가까운 슬롯")
    parser.add_argument("--dry-run", action="store_true", help="MongoDB에 쓰지 않고 로컬 JSON만 생성")
    args = parser.parse_args()

    now = datetime.now()
    target_date = date.fromisoformat(args.date) if args.date else now.date()
    hour = args.hour if args.hour is not None else _nearest_hour_slot(now)

    _cleanup_old_data()

    try:
        run(target_date, hour, args.dry_run)
    except Exception:
        log.exception("파이프라인 실행 중 오류 발생 — 리포트를 저장하지 않았습니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
