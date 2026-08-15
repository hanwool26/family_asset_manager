import { prisma } from "@/lib/db";

// 카카오톡 "나에게 보내기" 알림. 리포트 발행 / AI Investor 승인 요청을 카카오톡으로 받기 위한 최소 구현.
// 사업자등록/알림톡 심사가 필요 없는 개인용 카카오 로그인(talk_message scope) 방식을 쓴다 —
// 앱이 "개발중" 상태로 유지되는 한, 카카오 개발자 콘솔 "팀 관리"에 등록된 계정만 로그인/발송 대상이 될 수 있다.
//
// 흐름: /api/kakao/authorize(로그인 동의 시작) -> 카카오 동의 화면 -> /api/kakao/callback(코드 교환,
// 토큰 저장) -> notifyFamily()가 저장된 access_token으로 발송(만료 시 자동 refresh).
//
// 토큰은 새 테이블 없이 기존 AppSetting(key/value)에 JSON 문자열로 저장한다(web/lib/settings.ts와 동일 패턴).

// 알림을 받을 가족 구성원 키 목록. 새 구성원을 추가하려면: (1) 카카오 개발자 콘솔 팀 관리에 초대,
// (2) 아래 배열에 이름 추가, (3) 그 사람이 /api/kakao/authorize?member=<이름> 으로 최초 1회 로그인 동의.
export const KAKAO_FAMILY_MEMBERS = ["이한울"] as const;
export type KakaoFamilyMember = (typeof KAKAO_FAMILY_MEMBERS)[number];

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;

interface StoredKakaoToken {
  accessToken: string;
  refreshToken: string;
  obtainedAt: number; // epoch ms
  expiresIn: number; // seconds
}

interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  refresh_token_expires_in?: number;
}

function settingKey(member: string): string {
  return `kakao_token:${member}`;
}

export function isKakaoConfigured(): boolean {
  return Boolean(KAKAO_REST_API_KEY);
}

export function buildRedirectUri(origin: string): string {
  return `${origin}/api/kakao/callback`;
}

export function getAuthorizeUrl(origin: string, member: string): string {
  if (!KAKAO_REST_API_KEY) throw new Error("KAKAO_REST_API_KEY가 설정되어 있지 않습니다.");
  const params = new URLSearchParams({
    client_id: KAKAO_REST_API_KEY,
    redirect_uri: buildRedirectUri(origin),
    response_type: "code",
    scope: "talk_message",
    state: member,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

async function requestToken(params: Record<string, string>): Promise<KakaoTokenResponse> {
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`카카오 토큰 요청 실패: ${json.error ?? res.status} ${json.error_description ?? ""}`);
  }
  return json as KakaoTokenResponse;
}

async function saveTokens(member: string, accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  const stored: StoredKakaoToken = {
    accessToken,
    refreshToken,
    obtainedAt: Date.now(),
    expiresIn,
  };
  await prisma.appSetting.upsert({
    where: { key: settingKey(member) },
    create: { key: settingKey(member), value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  });
}

// 로그인 동의 콜백(/api/kakao/callback)에서 인가 코드를 최종 토큰으로 교환해 저장한다.
export async function saveTokenForMember(member: string, code: string, origin: string): Promise<void> {
  if (!KAKAO_REST_API_KEY) throw new Error("KAKAO_REST_API_KEY가 설정되어 있지 않습니다.");
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: KAKAO_REST_API_KEY,
    redirect_uri: buildRedirectUri(origin),
    code,
  };
  if (KAKAO_CLIENT_SECRET) params.client_secret = KAKAO_CLIENT_SECRET;
  const token = await requestToken(params);
  if (!token.refresh_token) {
    throw new Error("카카오 응답에 refresh_token이 없습니다.");
  }
  await saveTokens(member, token.access_token, token.refresh_token, token.expires_in);
}

async function loadStoredToken(member: string): Promise<StoredKakaoToken | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: settingKey(member) } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as StoredKakaoToken;
  } catch {
    return null;
  }
}

// access_token 만료 5분 전부터는 미리 refresh한다.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function getValidAccessToken(member: string): Promise<string | null> {
  const stored = await loadStoredToken(member);
  if (!stored) return null;

  const expiresAt = stored.obtainedAt + stored.expiresIn * 1000;
  if (Date.now() < expiresAt - EXPIRY_BUFFER_MS) {
    return stored.accessToken;
  }

  // 만료 임박 -> refresh_token으로 갱신.
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: KAKAO_REST_API_KEY ?? "",
    refresh_token: stored.refreshToken,
  };
  if (KAKAO_CLIENT_SECRET) params.client_secret = KAKAO_CLIENT_SECRET;
  const token = await requestToken(params);
  // 카카오는 refresh_token 응답에 새 refresh_token을 항상 주지는 않는다 — 있으면 갱신, 없으면 기존 값 유지.
  await saveTokens(member, token.access_token, token.refresh_token ?? stored.refreshToken, token.expires_in);
  return token.access_token;
}

interface NotifyLink {
  webUrl: string;
  mobileWebUrl?: string;
  buttonTitle?: string;
}

async function sendMemo(accessToken: string, text: string, link?: NotifyLink): Promise<void> {
  const templateObject: Record<string, unknown> = {
    object_type: "text",
    text: text.slice(0, 190),
    link: link
      ? { web_url: link.webUrl, mobile_web_url: link.mobileWebUrl ?? link.webUrl }
      : { web_url: "https://developers.kakao.com", mobile_web_url: "https://developers.kakao.com" },
  };
  if (link?.buttonTitle) templateObject.button_title = link.buttonTitle;

  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`카카오 메시지 발송 실패 (${res.status}): ${body}`);
  }
}

export interface NotifyResult {
  member: string;
  sent: boolean;
  reason?: string; // sent=false일 때만: "not_connected" | 에러 메시지
}

// 알림 전송 실패는(토큰 미연동/만료/카카오 장애 등) 호출부의 핵심 로직(리포트 저장, 제안 생성)을
// 절대 막아서는 안 되므로 이 함수는 예외를 던지지 않는다. 대신 구성원별 성공/실패/스킵 사유를
// 반환해서, 호출한 라우트가 응답에 실어 보내면 "조용히 실패"를 curl/로그로 바로 진단할 수 있다.
export async function notifyFamily(text: string, link?: NotifyLink): Promise<NotifyResult[]> {
  if (!isKakaoConfigured()) {
    return KAKAO_FAMILY_MEMBERS.map((member) => ({ member, sent: false, reason: "kakao_not_configured" }));
  }
  return Promise.all(
    KAKAO_FAMILY_MEMBERS.map(async (member): Promise<NotifyResult> => {
      try {
        const accessToken = await getValidAccessToken(member);
        if (!accessToken) return { member, sent: false, reason: "not_connected" }; // 아직 연동 안 한 구성원
        await sendMemo(accessToken, text, link);
        console.log(`[kakao] ${member}에게 알림 전송 성공`);
        return { member, sent: true };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[kakao] ${member}에게 알림 전송 실패:`, err);
        return { member, sent: false, reason };
      }
    })
  );
}

export async function getKakaoConnectionStatus(): Promise<Record<string, boolean>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: KAKAO_FAMILY_MEMBERS.map(settingKey) } },
  });
  const connected = new Set(rows.map((r) => r.key));
  const status: Record<string, boolean> = {};
  for (const member of KAKAO_FAMILY_MEMBERS) {
    status[member] = connected.has(settingKey(member));
  }
  return status;
}
