import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getInvestorSettings } from "@/lib/investor-settings";
import { computeCashKrw } from "@/lib/investor-state";

export const dynamic = "force-dynamic";

// 라즈베리파이 파이프라인(pipeline/investor_client.py)이 AI Investor 현재 상태(보유종목/현금/설정)를
// 가져오기 위해 호출하는 전용 엔드포인트. web/app/api/portfolio/movers/route.ts와 동일한 인증 패턴.
function isAuthorized(request: NextRequest): boolean {
  const token = process.env.PIPELINE_API_TOKEN;
  if (!token) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return provided === token;
}

export async function GET(request: NextRequest) {
  if (!process.env.PIPELINE_API_TOKEN) {
    return NextResponse.json({ error: "PIPELINE_API_TOKEN이 서버에 설정되어 있지 않습니다." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  const [holdings, settings, transactions] = await Promise.all([
    // 전량 매도(EXIT) 종목은 거래내역 보존을 위해 삭제하지 않고 quantity=0으로 남겨두므로
    // (web/lib/investor-execution.ts 참고) 현재 보유종목 조회 시엔 반드시 걸러야 한다.
    prisma.investorHolding.findMany({ where: { quantity: { gt: 0 } }, orderBy: { createdAt: "asc" } }),
    getInvestorSettings(),
    prisma.investorTransaction.findMany(),
  ]);

  // 승인 시 즉시 페이퍼 트레이딩(모의 체결)되므로 실제 InvestorTransaction이 쌓이며, cashKrw는
  // 시드금액에서 매수/매도 순매수금액을 뺀 값이다. Phase C(실주문 연동) 전까지는 이 체결이
  // 실계좌와는 무관한 시뮬레이션이라는 점에 유의.
  const cashKrw = computeCashKrw(settings.seedCapitalKrw, transactions);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    holdings: holdings.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      quantity: h.quantity,
      avgPrice: h.avgPrice,
      currency: h.currency,
    })),
    cashKrw,
    settings,
  });
}
