"""web/ 앱의 POST /api/notify/kakao 를 호출해 카카오톡 알림을 보낸다 (web/lib/kakao.ts 참고).

실제 발송/토큰 관리는 web 쪽에서 전담한다 — 여기서는 그냥 메시지를 던지기만 한다.
새 KAKAO_* 환경변수는 필요 없다: PORTFOLIO_API_URL/PIPELINE_API_TOKEN(기존 movers 연동과 동일)만
있으면 된다. 알림 전송 실패가 리포트 파이프라인 자체를 중단시키면 안 되므로, 이 함수는
어떤 예외도 밖으로 던지지 않고 경고 로그만 남긴다.
"""
from __future__ import annotations

import logging

import requests

import config

log = logging.getLogger("pipeline.notify_client")


def notify(message: str, web_url: str | None = None, button_title: str | None = None) -> None:
    if not config.PORTFOLIO_API_URL or not config.PIPELINE_API_TOKEN:
        log.info("PORTFOLIO_API_URL/PIPELINE_API_TOKEN 미설정 — 카카오 알림을 건너뜁니다.")
        return

    url = f"{config.PORTFOLIO_API_URL.rstrip('/')}/api/notify/kakao"
    payload: dict[str, str] = {"message": message}
    if web_url:
        payload["webUrl"] = web_url
    if button_title:
        payload["buttonTitle"] = button_title

    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {config.PIPELINE_API_TOKEN}"},
            timeout=10,
        )
        resp.raise_for_status()
        # results: [{member, sent, reason?}, ...] — "200 OK인데 실제로는 스킵됨"을 로그로 바로 구분하기 위함.
        # (web/lib/kakao.ts notifyFamily 참고. reason 예: kakao_not_configured, not_connected)
        log.info("카카오 알림 응답: %s", resp.json())
    except Exception as exc:  # noqa: BLE001 - 알림 실패는 절대 파이프라인을 막지 않는다
        log.warning("카카오 알림 전송 실패(무시하고 계속 진행): %s", exc)
