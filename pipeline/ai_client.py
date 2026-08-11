"""Claude 호출 추상화.

AI_BACKEND=cli (기본값): 로컬에 설치된 `claude` CLI 를 headless(print) 모드로 호출한다.
AI_BACKEND=api: Anthropic API SDK 로 직접 호출한다.

호출 횟수는 프로세스 전역으로 추적하며 MAX_CLAUDE_CALLS 를 넘기면 예외를 던져
파이프라인이 부분 데이터로 리포트를 만들지 않고 안전하게 중단하도록 한다.
"""
from __future__ import annotations

import json
import logging
import subprocess
import time

import config

log = logging.getLogger("pipeline.ai_client")

_call_count = 0
_last_call_at = 0.0

# call_claude_json 이 JSON 파싱에 실패했을 때 같은 프롬프트로 재시도하는 최대 횟수
# (최초 1회 + 재시도 2회 = 최대 3회 호출). 예산(MAX_CLAUDE_CALLS) 안에서 소모된다.
_JSON_PARSE_MAX_ATTEMPTS = 3
_JSON_RETRY_SUFFIX = (
    "\n\n(주의: 직전 응답이 JSON 파싱에 실패했습니다. 코드펜스(```)나 부연 설명 없이, "
    "순수한 JSON 값 하나만 출력하세요.)"
)


class ClaudeCallBudgetExceeded(RuntimeError):
    pass


class ClaudeCallError(RuntimeError):
    pass


def _throttle() -> None:
    global _last_call_at
    elapsed = time.monotonic() - _last_call_at
    wait = config.CLAUDE_CALL_INTERVAL_SECONDS - elapsed
    if wait > 0:
        time.sleep(wait)
    _last_call_at = time.monotonic()


def call_claude(prompt: str) -> str:
    """prompt 를 Claude 에 보내고 텍스트 응답을 반환한다."""
    global _call_count

    if _call_count >= config.MAX_CLAUDE_CALLS:
        raise ClaudeCallBudgetExceeded(
            f"Claude 호출 예산({config.MAX_CLAUDE_CALLS}회) 초과 — 파이프라인을 중단합니다."
        )

    _throttle()
    _call_count += 1

    if config.AI_BACKEND == "api":
        return _call_via_api(prompt)
    return _call_via_cli(prompt)


def _call_via_cli(prompt: str) -> str:
    cmd = ["claude", "-p", prompt, "--model", config.CLAUDE_MODEL, "--output-format", "text"]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=config.CLAUDE_TIMEOUT_SECONDS,
            encoding="utf-8",
        )
    except FileNotFoundError as exc:
        raise ClaudeCallError(
            "`claude` CLI를 찾을 수 없습니다. Pi에 Claude Code CLI가 설치·인증되어 있는지 확인하세요 "
            "(pipeline/README.md 참고), 또는 AI_BACKEND=api 로 전환하세요."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise ClaudeCallError(f"Claude CLI 호출이 {config.CLAUDE_TIMEOUT_SECONDS}초를 초과했습니다.") from exc

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "(stdout/stderr 모두 비어 있음)"
        raise ClaudeCallError(f"Claude CLI 호출 실패 (exit {result.returncode}): {detail}")

    return result.stdout.strip()


def _call_via_api(prompt: str) -> str:
    import anthropic  # 지연 임포트: AI_BACKEND=cli 만 쓰는 경우 의존성 불필요

    if not config.ANTHROPIC_API_KEY:
        raise ClaudeCallError("AI_BACKEND=api 인데 ANTHROPIC_API_KEY 가 설정되어 있지 않습니다.")

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    try:
        message = client.messages.create(
            model=config.CLAUDE_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as exc:
        raise ClaudeCallError(f"Anthropic API 호출 실패: {exc}") from exc

    return "".join(block.text for block in message.content if block.type == "text").strip()


def _extract_json(raw: str):
    """Claude 응답에서 첫 번째 JSON 값만 뽑아낸다.

    코드펜스(```json ... ```)로 감싸져 오거나, 지시를 어기고 JSON 뒤에 부연 설명이
    덧붙는 경우(Extra data 에러의 원인)를 모두 견고하게 처리한다 — 정확히 ``` 로
    끝나는지 문자열 매칭에 의존하지 않고, 첫 `{`/`[` 부터 짝이 맞는 지점까지만 파싱하고
    그 뒤에 남는 텍스트는 무시한다.
    """
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.strip()

    start = next((i for i, ch in enumerate(text) if ch in "{["), None)
    if start is None:
        raise ValueError("응답에서 JSON 시작 문자('{' 또는 '[')를 찾지 못했습니다.")

    return json.JSONDecoder().raw_decode(text, start)[0]


def call_claude_json(prompt: str):
    """Claude 응답을 JSON으로 파싱한다. 파싱 실패 시 같은 프롬프트로 최대
    _JSON_PARSE_MAX_ATTEMPTS 회까지 재시도한다 (예산은 call_claude 가 관리)."""
    last_raw = ""
    last_exc: Exception | None = None

    for attempt in range(1, _JSON_PARSE_MAX_ATTEMPTS + 1):
        attempt_prompt = prompt if attempt == 1 else prompt + _JSON_RETRY_SUFFIX
        raw = call_claude(attempt_prompt)
        last_raw = raw
        try:
            return _extract_json(raw)
        except (ValueError, json.JSONDecodeError) as exc:
            last_exc = exc
            log.warning(
                "Claude JSON 파싱 실패 (attempt %d/%d): %s", attempt, _JSON_PARSE_MAX_ATTEMPTS, exc
            )

    raise ClaudeCallError(
        f"Claude 응답을 JSON으로 파싱하지 못했습니다 ({_JSON_PARSE_MAX_ATTEMPTS}회 시도 모두 실패): "
        f"{last_exc}\n원문: {last_raw[:500]}"
    ) from last_exc


def calls_used() -> int:
    return _call_count
