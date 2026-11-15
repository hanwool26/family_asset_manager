import { prisma } from "@/lib/db";
import AssetsSubNav from "@/components/AssetsSubNav";
import LoanCalculator from "@/components/LoanCalculator";
import BlurGate from "@/components/BlurGate";

export const dynamic = "force-dynamic";

export default async function LoanCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ principal?: string; goalId?: string }>;
}) {
  const [{ principal, goalId }, members] = await Promise.all([
    searchParams,
    prisma.familyMember.findMany({ orderBy: { order: "asc" } }),
  ]);
  // 목표 상세 화면의 "부족액으로 대출 계산" 링크가 ?principal=&goalId=로 원금과 목표를 넘겨준다
  const initialPrincipal = Number(principal);
  const goal = goalId ? await prisma.familyGoal.findUnique({ where: { id: goalId }, select: { id: true, name: true } }) : null;

  return (
    <BlurGate>
    <div>
      <div className="mb-1">
        <h1 className="text-xl font-bold text-slate-900">가계자산</h1>
        <p className="text-sm text-slate-500 mt-0.5">대출 원리금 상환 스케줄과 DSR·스트레스 DSR 한도를 계산합니다.</p>
      </div>

      <AssetsSubNav members={members.map((m) => ({ id: m.id, name: m.name }))} />

      <LoanCalculator
        initialPrincipal={Number.isFinite(initialPrincipal) && initialPrincipal > 0 ? initialPrincipal : undefined}
        goal={goal ?? undefined}
      />
    </div>
    </BlurGate>
  );
}
