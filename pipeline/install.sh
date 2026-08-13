#!/usr/bin/env bash
# 라즈베리파이에서 1회 실행하는 설치 스크립트.
# venv 생성 + 의존성 설치 + systemd service/timer 등록 → 이후 재부팅해도 스케줄이 유지된다.
#
# 사용법:
#   cd pipeline
#   chmod +x install.sh
#   ./install.sh
set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="$(whoami)"
SYSTEMD_DIR="/etc/systemd/system"

echo "==> pipeline 디렉터리: $PIPELINE_DIR"
echo "==> 서비스 실행 사용자: $SERVICE_USER"

if [ ! -f "$PIPELINE_DIR/.env" ]; then
  echo "==> .env 가 없어 .env.example 을 복사합니다. 반드시 값을 채워 넣으세요."
  cp "$PIPELINE_DIR/.env.example" "$PIPELINE_DIR/.env"
fi

echo "==> Python venv 생성"
python3 -m venv "$PIPELINE_DIR/venv"

echo "==> 의존성 설치"
"$PIPELINE_DIR/venv/bin/pip" install --upgrade pip
"$PIPELINE_DIR/venv/bin/pip" install -r "$PIPELINE_DIR/requirements.txt"

# claude CLI가 npm 전역 설치 등으로 PATH 상에 있으면 그 디렉터리를 systemd 서비스의
# PATH에도 포함시킨다 (systemd는 기본 PATH가 짧아 사용자 쉘의 PATH를 상속하지 않음).
CLAUDE_BIN="$(command -v claude || true)"
if [ -n "$CLAUDE_BIN" ]; then
  EXTRA_PATH="$(dirname "$CLAUDE_BIN")"
  echo "==> claude CLI 발견: $CLAUDE_BIN (systemd PATH에 추가)"
else
  EXTRA_PATH="$HOME/.npm-global/bin"
  echo "==> claude CLI를 아직 못 찾았습니다. AI_BACKEND=cli 를 쓰려면 설치 후 이 스크립트를 다시 실행하세요."
fi

# 설치할 유닛 목록: 매크로 리포트(stock-analyzer) + 포트폴리오 등락률 TOP5 뉴스(KR/US)
# + AI Investor 주간 리밸런싱 제안(ai-investor-decide). ai-investor-decide는 제안만 생성/제출하며
# Phase C(실주문 연동) 전까지는 실제 매매를 일으키지 않는다.
UNITS=(stock-analyzer portfolio-movers-kr portfolio-movers-us ai-investor-decide)

echo "==> systemd 유닛 생성 (${SYSTEMD_DIR})"
for unit in "${UNITS[@]}"; do
  sed \
    -e "s|__PIPELINE_DIR__|$PIPELINE_DIR|g" \
    -e "s|__USER__|$SERVICE_USER|g" \
    -e "s|__EXTRA_PATH__|$EXTRA_PATH|g" \
    "$PIPELINE_DIR/systemd/$unit.service" | sudo tee "$SYSTEMD_DIR/$unit.service" > /dev/null

  sudo cp "$PIPELINE_DIR/systemd/$unit.timer" "$SYSTEMD_DIR/$unit.timer"
done

echo "==> systemd 등록 및 타이머 활성화"
sudo systemctl daemon-reload
for unit in "${UNITS[@]}"; do
  sudo systemctl enable --now "$unit.timer"
done

echo ""
echo "==> 완료. 확인 명령어 (유닛명: ${UNITS[*]}):"
echo "    systemctl status stock-analyzer.timer"
echo "    systemctl list-timers | grep -E 'stock-analyzer|portfolio-movers'"
echo "    sudo systemctl start stock-analyzer.service          # 지금 바로 1회 수동 실행"
echo "    sudo systemctl start portfolio-movers-kr.service     # 포트폴리오 국내 리포트 수동 실행"
echo "    sudo systemctl start portfolio-movers-us.service     # 포트폴리오 미국 리포트 수동 실행"
echo "    sudo systemctl start ai-investor-decide.service      # AI Investor 주간 제안 수동 실행"
echo "    journalctl -u stock-analyzer.service -f              # 실시간 로그"
echo ""
echo "==> $PIPELINE_DIR/.env 에 MONGODB_URI, NAVER_*, MARKETAUX_API_KEY, ANTHROPIC_API_KEY,"
echo "    PORTFOLIO_API_URL, PIPELINE_API_TOKEN 을 채워 넣었는지 확인하세요."
echo "    AI Investor는 여기에 더해 web/.env 쪽 Postgres에 InvestorHolding 등 테이블이 마이그레이션"
echo "    되어 있어야 하며(web/prisma/migrations), 이번 범위에서는 TOSS_* 값이 비어 있어도 동작합니다"
echo "    (Phase C 실주문 연동 전까지는 사용되지 않음)."
