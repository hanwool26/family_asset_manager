import { NextRequest, NextResponse } from "next/server";
import { KAKAO_FAMILY_MEMBERS, saveTokenForMember } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// 카카오 로그인 동의 완료 후 브라우저가 되돌아오는 Redirect URI.
// GET /api/kakao/callback?code=...&state=<member>  (또는 사용자가 동의를 취소하면 ?error=...)
export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const member = request.nextUrl.searchParams.get("state");

  const redirectBack = new URL("/investor", request.nextUrl.origin);

  if (error) {
    redirectBack.searchParams.set("kakao", "denied");
    return NextResponse.redirect(redirectBack);
  }
  if (!code || !member || !(KAKAO_FAMILY_MEMBERS as readonly string[]).includes(member)) {
    redirectBack.searchParams.set("kakao", "error");
    return NextResponse.redirect(redirectBack);
  }

  try {
    await saveTokenForMember(member, code, request.nextUrl.origin);
    redirectBack.searchParams.set("kakao", "connected");
  } catch (err) {
    console.error("[kakao] 토큰 교환 실패:", err);
    redirectBack.searchParams.set("kakao", "error");
  }

  return NextResponse.redirect(redirectBack);
}
