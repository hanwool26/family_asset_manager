# Stock Analyzer 리포트 파이프라인 (라즈베리파이용)

`logic_strategy/methodology.html` 에 정의된 7+1단계 파이프라인의 실제 구현입니다.
라즈베리파이에서 평일 07:30 / 19:30(KST)에 자동 실행되어, 결과를 MongoDB Atlas
`reports` 컬렉션에 저장합니다. `web/` 의 Next.js 앱(Vercel 배포)이 같은 컬렉션을 읽으므로
재배포 없이 즉시 화면에 반영됩니다.

## 0. 사전 준비 (사용자가 직접 해야 하는 것)

### MongoDB Atlas
1. https://www.mongodb.com/cloud/atlas 에서 무료 M0 클러스터 생성 (512MB, 하루 3회 쓰기엔 충분).
2. Database Access 에서 읽기/쓰기 권한을 가진 DB 사용자 생성 (강한 비밀번호 권장).
3. Network Access 에서 IP 허용 목록 설정:
   - 라즈베리파이가 고정 IP/고정 공인 IP가 아니라면 `0.0.0.0/0`(모든 IP 허용)을 추가하고,
     대신 사용자 비밀번호를 강하게 설정하세요. Atlas는 TLS를 강제하므로 전송 구간은 암호화됩니다.
   - 고정 IP가 있다면 해당 IP만 허용하는 편이 더 안전합니다.
4. "Connect → Drivers"에서 연결 문자열을 복사해 `pipeline/.env`(아래)와 `web/.env`(Vercel의 경우
   프로젝트 환경변수) 양쪽의 `MONGODB_URI`에 동일하게 설정하세요.

### Naver 뉴스 검색 API
**2026-07-31부로 검색 API가 NAVER API HUB(NAVER Cloud Platform)로 이전되었습니다.**
엔드포인트와 인증 헤더가 바뀌었습니다 (`collectors/naver_news.py`에 반영됨):
- 엔드포인트: `https://naverapihub.apigw.ntruss.com/search/v1/news`
- 헤더: `X-NCP-APIGW-API-KEY-ID`(Client ID), `X-NCP-APIGW-API-KEY`(Client Secret)

실제 테스트 결과, 기존 developers.naver.com에서 발급받은 Client ID/Secret이 새 엔드포인트에서도
그대로 동작했습니다 — 새 키를 다시 발급받지 않아도 됩니다. 혹시 안 되는 계정이 있다면
https://console.ncloud.com → Application Services → **NAVER API HUB** 에서 새로 발급받으세요.

키가 정상 동작하는지 아래 curl로 먼저 단독 테스트해보는 걸 권장합니다 (한글 쿼리는 터미널에 따라
percent-encoding이 안 될 수 있으니 영문으로 먼저 확인):
```bash
curl --location --request GET \
  "https://naverapihub.apigw.ntruss.com/search/v1/news?query=coffee&display=2&sort=date&format=json" \
  --header "X-NCP-APIGW-API-KEY-ID: <Client ID>" \
  --header "X-NCP-APIGW-API-KEY: <Client Secret>"
```

### Marketaux
https://www.marketaux.com/ 무료 플랜 가입 → API 토큰 발급 → `MARKETAUX_API_KEY`.

### Claude 인증
`AI_BACKEND=cli`(기본값)를 쓰는 경우, 라즈베리파이에 [Claude Code CLI](https://docs.claude.com/claude-code)를
설치해야 합니다:

```bash
npm install -g @anthropic-ai/claude-code
claude --version   # 정상 설치됐는지 확인
```
(Node.js가 없다면 먼저 설치: `sudo apt install nodejs npm` 또는 nvm 사용. arm64 라즈베리파이 OS도 지원됨.)

인증은 아래 둘 중 하나:
- **API 키 방식(권장, 완전 무인)**: `pipeline/.env`의 `ANTHROPIC_API_KEY`를 채우면 `claude` CLI가
  이 키로 자동 인증합니다. 재로그인 걱정이 없어 헤드리스 환경에 가장 적합합니다.
- **구독 로그인 방식**: SSH로 Pi에 접속해 최초 1회 `claude login`을 실행하고 브라우저 인증을
  완료하면, 이후 크론 실행에서도 저장된 세션이 재사용됩니다. 세션이 만료되면 다시 로그인해야
  하므로 장기 무인 운영에는 API 키 방식보다 관리 부담이 있습니다.

**중요**: `claude` CLI를 설치한 뒤에는 `./install.sh`를 **다시 한번 실행**하세요. systemd 서비스는
기본 PATH가 짧아(`/usr/bin:/bin` 등) `npm install -g`로 깐 `claude`를 못 찾는 경우가 흔한데,
`install.sh`가 재실행 시점에 `command -v claude`로 실제 설치 위치를 감지해 서비스 유닛의 PATH에
자동으로 넣어줍니다. `claude` 없이 먼저 서비스가 등록되어 있었다면 반드시 재실행이 필요합니다.

`AI_BACKEND=api`로 바꾸면 CLI 설치 없이 `ANTHROPIC_API_KEY`만으로 Anthropic API SDK를 직접
호출합니다 — CLI 설치/PATH 문제를 아예 피하고 싶다면 이 방법이 가장 간단합니다.

### Vercel
Vercel 프로젝트 설정 → Environment Variables 에 `MONGODB_URI`를 추가하세요. 코드 재배포 없이
다음 요청부터 실제 데이터가 조회됩니다 (`web/lib/reports.ts` 참고).

## 1. 라즈베리파이 설치

```bash
git clone <this-repo>
cd stock_analyzer_plus/pipeline
cp .env.example .env
# .env 를 열어 위에서 발급받은 값들을 채워 넣는다
nano .env

chmod +x install.sh
./install.sh
```

`install.sh`가 하는 일 ("서비스형 상시 운용"을 위한 트리거 스크립트):
1. `venv` 생성 + `requirements.txt` 설치
2. `pipeline/systemd/*.unit` 템플릿을 실제 경로/사용자로 치환해 `/etc/systemd/system/`에 설치
3. `systemctl enable --now stock-analyzer.timer` 로 타이머 활성화

한 번 실행해두면 재부팅 후에도 스케줄이 유지됩니다 (systemd timer는 크론과 달리 부팅 시
자동으로 다시 등록되고, 실행 로그가 `journalctl`에 남습니다).

## 2. 동작 확인

```bash
# 지금 바로 1회 수동 실행 (스케줄과 무관하게)
sudo systemctl start stock-analyzer.service

# 실시간 로그
journalctl -u stock-analyzer.service -f

# 다음 실행 예정 시각
systemctl list-timers | grep stock-analyzer
```

MongoDB Atlas 웹 UI(Collections)에서 `stock_analyzer.reports` 컬렉션에 문서가 생성되었는지
확인하거나, `web/.env`에 같은 `MONGODB_URI`를 넣고 `npm run dev` 후 `/reports`에서 확인하세요.

로컬(맥/윈도우 등)에서 코드만 테스트하고 싶다면:

```bash
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run_pipeline.py --dry-run --date 2026-08-04 --hour 19
```

`--dry-run`은 MongoDB에 쓰지 않고 `pipeline/data/<date>/<hour>/*.json`에만 중간/최종 산출물을 남깁니다.

## 3. universe.json 검수

`universe.json`은 시가총액 상위 100종목(KOSPI 40 + KOSDAQ 10 + NASDAQ 28 + NYSE 22) 시드
리스트입니다. 시가총액 순위는 주기적으로 바뀌므로 **정기적으로 직접 검토/수정**하는 걸
권장합니다. 이 파일에 없는 종목은 AI가 언급하더라도 최종 추천에서 자동 제외됩니다.

## 4. 구조

| 파일/디렉터리 | 역할 |
|---|---|
| `config.py` | 환경변수 로딩 + methodology.html 파라미터 |
| `ai_client.py` | Claude 호출 추상화 (CLI/API 전환, JSON 파싱 실패 시 최대 3회 재시도, 호출 예산 26회) |
| `collectors/` | Stage 1: Naver/Marketaux 뉴스 수집 |
| `processing/clean.py` | Stage 2: 전처리/필터링 |
| `processing/classify.py` | Stage 3: AI 기사 분류 |
| `processing/summarize.py` | Stage 4: 카테고리별 요약 |
| `processing/candidates.py` | Stage 5: 종목 후보 도출 |
| `processing/technical.py` | Stage 5b: 기술적 분석 (yfinance) |
| `processing/sentiment.py` | Stage S: 감성 분석 |
| `processing/recommend.py` | Stage 6: 최종 추천 선별 + 병합 |
| `storage/mongo_writer.py` | Stage 7: MongoDB 저장 (365일 TTL) |
| `run_pipeline.py` | 오케스트레이터 (CLI 진입점) |
| `systemd/`, `install.sh` | Pi 서비스 등록 |

## 5. 트러블슈팅

- **`claude` CLI를 찾을 수 없다는 오류**: Pi에 Claude Code CLI가 설치되어 있는지 확인
  (`which claude`), 또는 `.env`의 `AI_BACKEND=api`로 전환.
- **Claude JSON 파싱 실패 (`Extra data`, `Expecting value` 등)**: 응답이 ```` ```json ... ``` ````
  코드펜스 뒤에 설명 텍스트를 덧붙이거나 형식을 어길 때 발생합니다. `ai_client.call_claude_json`이
  같은 프롬프트로 최대 3회까지 자동 재시도하므로 대부분 자연 복구됩니다. 6단계(최종 추천 선별)는
  재시도까지 모두 실패하면 예외를 던지는 대신 `recommend._heuristic_selection`으로 넘어가
  후보 신뢰도 기준 규칙 기반 선별로 대체하고, 저장된 리포트에 `selectionDegraded: true`를 남깁니다.
  (다른 단계는 여전히 재시도 실패 시 파이프라인을 중단합니다.)
- **Claude 호출 예산 초과 오류**: 기사 수가 비정상적으로 많거나 배치가 파싱 재시도를 반복하는
  경우입니다. `MAX_CLAUDE_CALLS`(기본 26 = 정상 호출분 + 재시도 여유분)를 늘리기보다 원인(API 응답
  형식 오류 등)을 먼저 확인하세요. 예산 초과 시 파이프라인은 리포트를 저장하지 않고 안전하게
  중단됩니다.
- **yfinance가 일부 종목 데이터를 못 가져옴**: 해당 종목은 이번 회차 추천에서 자동 제외됩니다
  (`recommend.py`). 반복되면 해당 티커의 야후파이낸스 심볼 표기를 확인하세요.
- **MongoDB 연결 실패**: Atlas Network Access에 Pi의 현재 공인 IP가 허용되어 있는지, 비밀번호에
  특수문자가 있다면 URL 인코딩이 되어 있는지 확인하세요.
