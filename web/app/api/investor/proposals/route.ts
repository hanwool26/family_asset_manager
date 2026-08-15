import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyFamily } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// 라즈베리파이 파이프라인(pipeline/investor_client.py)이 주 1회 생성한 AI Investor 리밸런싱 제안을
// 저장하기 위해 호출하는 전용 엔드포인트. web/app/api/portfolio/movers/route.ts와 동일한 인증 패턴.
// 이 라우트는 저장만 한다 — 실주문은 이 시점에 발생하지 않는다(Phase C 미연동).
function isAuthorized(request: NextRequest): boolean {
  const token = process.env.PIPELINE_API_TOKEN;
  if (!token) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return provided === token;
}

interface ProposalItemInput {
  ticker: string;
  name: string;
  action: "NEW_BUY" | "ADD" | "TRIM" | "EXIT" | "HOLD";
  targetWeightPct: number;
  currentWeightPct: number;
  convictionScore: number;
  rationale: string;
  riskFlags?: string[];
}

interface ProposalInput {
  weekOf: string; // "YYYY-MM-DD"
  marketContext: string;
  degraded?: boolean;
  items: ProposalItemInput[];
}

const VALID_ACTIONS = new Set(["NEW_BUY", "ADD", "TRIM", "EXIT", "HOLD"]);

function validate(body: unknown): body is ProposalInput {
  if (!body || typeof body !== "object") return false;
  const b = body as Partial<ProposalInput>;
  if (typeof b.weekOf !== "string" || Number.isNaN(Date.parse(b.weekOf))) return false;
  if (typeof b.marketContext !== "string") return false;
  if (!Array.isArray(b.items)) return false;
  return b.items.every(
    (item) =>
      item &&
      typeof item.ticker === "string" &&
      typeof item.name === "string" &&
      VALID_ACTIONS.has(item.action) &&
      typeof item.targetWeightPct === "number" &&
      typeof item.currentWeightPct === "number" &&
      typeof item.convictionScore === "number" &&
      typeof item.rationale === "string"
  );
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
  if (!validate(body)) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다 (weekOf/marketContext/items 확인)." }, { status: 400 });
  }

  const proposal = await prisma.investorProposal.create({
    data: {
      weekOf: new Date(body.weekOf),
      marketContext: body.marketContext,
      degraded: body.degraded ?? false,
      items: {
        create: body.items.map((item) => ({
          ticker: item.ticker,
          name: item.name,
          action: item.action,
          targetWeightPct: item.targetWeightPct,
          currentWeightPct: item.currentWeightPct,
          convictionScore: item.convictionScore,
          rationale: item.rationale,
          riskFlags: item.riskFlags ?? [],
        })),
      },
    },
    select: { id: true },
  });

  // 카카오 알림은 실패해도 제안 저장 자체는 이미 끝난 뒤라 응답에 영향 없음(notifyFamily 내부에서 삼킴).
  const buyCount = body.items.filter((item) => item.action !== "HOLD").length;
  await notifyFamily(
    `📈 AI Investor 새 리밸런싱 제안이 도착했어요 (${body.weekOf} 기준, ${buyCount}건 매매 검토 필요). 앱에서 승인/거절해주세요.`,
    { webUrl: `${request.nextUrl.origin}/investor`, buttonTitle: "제안 확인하기" }
  );

  return NextResponse.json({ id: proposal.id }, { status: 201 });
}
