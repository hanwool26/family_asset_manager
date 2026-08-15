import { NextRequest, NextResponse } from "next/server";
import { KAKAO_FAMILY_MEMBERS, getAuthorizeUrl, isKakaoConfigured } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// 가족 구성원이 "카카오 알림 연동하기" 버튼을 누르면 이 라우트를 거쳐 카카오 로그인 동의 화면으로 이동한다.
// GET /api/kakao/authorize?member=이한울
export async function GET(request: NextRequest) {
  if (!isKakaoConfigured()) {
    return NextResponse.json({ error: "KAKAO_REST_API_KEY가 서버에 설정되어 있지 않습니다." }, { status: 503 });
  }

  const member = request.nextUrl.searchParams.get("member");
  if (!member || !(KAKAO_FAMILY_MEMBERS as readonly string[]).includes(member)) {
    return NextResponse.json({ error: "알 수 없는 member입니다." }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  return NextResponse.redirect(getAuthorizeUrl(origin, member));
}
