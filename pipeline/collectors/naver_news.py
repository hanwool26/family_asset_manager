"""Stage 1 (국내): Naver 뉴스 검색 API 수집. methodology.html #stage1 참고.

2026-07-31 부로 검색 API가 NAVER API HUB(NAVER Cloud Platform)로 이전되었다.
기존 developers.naver.com 애플리케이션의 Client ID/Secret은 재사용할 수 없고,
NCP 콘솔 → NAVER API HUB 에서 새로 발급받은 키를 써야 한다 (pipeline/README.md 참고).
"""
from __future__ import annotations

import html
import re
import time
from typing import Any

import requests

import config

NAVER_ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/news"


def _strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text or ""))


def search_keyword(keyword: str) -> list[dict[str, Any]]:
    headers = {
        "X-NCP-APIGW-API-KEY-ID": config.NAVER_CLIENT_ID,
        "X-NCP-APIGW-API-KEY": config.NAVER_CLIENT_SECRET,
    }
    params = {"query": keyword, "display": 100, "sort": "date", "format": "json"}
    resp = requests.get(NAVER_ENDPOINT, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    items = resp.json().get("items", [])

    articles = []
    for item in items:
        articles.append(
            {
                "source": "naver",
                "keyword": keyword,
                "title": _strip_tags(item.get("title", "")),
                "description": _strip_tags(item.get("description", "")),
                "url": item.get("originallink") or item.get("link", ""),
                "published_at": item.get("pubDate", ""),
            }
        )
    return articles


def collect() -> list[dict[str, Any]]:
    """MACRO/POLICY/EVENT/TREND 카테고리 키워드로 뉴스를 수집한다 (~2,200건 목표)."""
    if not (config.NAVER_CLIENT_ID and config.NAVER_CLIENT_SECRET):
        raise RuntimeError("NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 이 설정되어 있지 않습니다.")

    all_articles: list[dict[str, Any]] = []
    keywords = [kw for group in config.NEWS_KEYWORDS.values() for kw in group]

    for i, keyword in enumerate(keywords):
        all_articles.extend(search_keyword(keyword))
        if i < len(keywords) - 1:
            time.sleep(config.NAVER_RATE_LIMIT_SECONDS)

    return all_articles
