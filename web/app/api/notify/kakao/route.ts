import { NextRequest, NextResponse } from "next/server";
import { notifyFamily } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// 라즈베리파이 파이프라인(pipeline/notify_client.py)이 리포트 발행 등 이벤트 발생 시 호출하는
// 전용 엔드포인트. web/app/api/portfolio/movers/route.ts와 동일한 Bearer 인증 패턴을 쓴다.
function isAuthorized(request: NextRequest): boolean {
  const token = process.env.PIPELINE_API_TOKEN;
  if (!token) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return provided === token;
}

export async function POST(request: NextRequest) {
  if (!process.env.PIPELINE_API_TOKEN) {
    return NextResponse.json({ error: "PIPELINE_API_TOKEN이 서버에 설정되어 있지 않습니다." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON body 입니다." }, { status: 400 });
  }
  const { message, webUrl, mobileWebUrl, buttonTitle } = (body ?? {}) as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message는 필수 문자열입니다." }, { status: 400 });
  }

  // 카카오 발송 실패는 파이프라인 쪽 재시도를 유발하지 않도록 항상 200으로 응답한다.
  // 다만 "조용한 실패"를 curl 한 번으로 진단할 수 있도록 구성원별 결과를 그대로 실어 보낸다
  // (예: kakao_not_configured = Vercel에 KAKAO_REST_API_KEY 미등록, not_connected = 해당 구성원이
  // 아직 /investor 페이지에서 카카오 로그인 연동을 안 함).
  const results = await notifyFamily(message, typeof webUrl === "string" ? {
    webUrl,
    mobileWebUrl: typeof mobileWebUrl === "string" ? mobileWebUrl : undefined,
    buttonTitle: typeof buttonTitle === "string" ? buttonTitle : undefined,
  } : undefined);

  return NextResponse.json({ ok: true, results });
}
