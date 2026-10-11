"use client";

import { useState, useTransition } from "react";
import type { InvestorProposal, InvestorProposalItem } from "@/app/generated/prisma/client";
import { approveProposal, rejectProposal } from "@/app/investor/actions";
import { formatDateOnlyKorean } from "@/lib/date";

export type ProposalWithItems = InvestorProposal & { items: InvestorProposalItem[] };

const ACTION_LABEL: Record<string, string> = {
  NEW_BUY: "신규 편입",
  ADD: "비중 확대",
  TRIM: "비중 축소",
  EXIT: "편출",
  HOLD: "유지",
};

const ACTION_TONE: Record<string, string> = {
  NEW_BUY: "bg-red-50 text-red-600 border-red-200",
  ADD: "bg-red-50 text-red-600 border-red-200",
  TRIM: "bg-blue-50 text-blue-600 border-blue-200",
  EXIT: "bg-blue-50 text-blue-600 border-blue-200",
  HOLD: "bg-slate-100 text-slate-500 border-slate-200",
};

const REGION_LABEL: Record<string, string> = { KR: "🇰🇷 한국", US: "🇺🇸 미국" };

const STATUS_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  REJECTED: "거절됨",
  EXECUTED: "모의 체결 완료",
  FAILED: "실패",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  FILLED: "체결",
  SKIPPED: "보류(스킵)",
  FAILED: "실패",
};

// 승인/거절 후에는 로컬 state를 직접 패치하지 않고 revalidatePath(서버 액션 내부)가 트리거하는
// Next.js의 자동 라우터 리프레시에 맡긴다 — 이래야 executeProposalPaper가 채운 실제 체결 결과
// (items[].orderStatus 등)까지 정확히 반영된다 (web/components/HoldingsTable.tsx와 동일한 패턴).
export default function InvestorProposalCard({ proposal }: { proposal: ProposalWithItems }) {
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const status = proposal.status;

  function handleApprove() {
    if (
      !window.confirm(
        "이 제안을 승인하면 오늘 시세로 즉시 모의 체결(페이퍼 트레이딩)됩니다. 아직 실제 토스 주문은 아니지만, " +
          "AI Investor의 보유종목/현금에는 실제로 반영됩니다." +
          (proposal.region === "US"
            ? " 달러 현금이 부족하면 원화 대기자금에서 부족분이 현재 환율로 자동 환전됩니다."
            : "") +
          " 계속할까요?"
      )
    )
      return;
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await approveProposal(proposal.id);
      if (result?.error) setError(result.error);
      else if (result?.warning) setWarning(result.warning);
    });
  }

  function handleReject() {
    if (!window.confirm("이 제안을 거절할까요?")) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectProposal(proposal.id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div>
          <span className="mr-1.5 text-[11px] font-semibold text-slate-400">{REGION_LABEL[proposal.region] ?? proposal.region}</span>
          <span className="text-sm font-semibold text-slate-900">
            {formatDateOnlyKorean(proposal.weekOf)} 기준 주간 제안
          </span>
        </div>
        <span
          className={
            "text-[11px] font-semibold px-2 py-0.5 rounded-full border " +
            (status === "PENDING"
              ? "bg-amber-50 text-amber-600 border-amber-200"
              : status === "REJECTED"
                ? "bg-slate-100 text-slate-500 border-slate-200"
                : status === "FAILED"
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-blue-50 text-blue-600 border-blue-200")
          }
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {proposal.degraded && (
        <p className="mx-5 mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠️ AI 판단 생성에 실패해 이번 회차는 빈 제안으로 안전 정지되었습니다 (규칙 기반 대체 매매 없음).
        </p>
      )}

      <p className="px-5 pt-3 text-sm text-slate-600">{proposal.marketContext}</p>

      {proposal.items.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-400">
              <tr className="text-left">
                <th className="px-5 py-2 font-medium">종목</th>
                <th className="px-4 py-2 font-medium">액션</th>
                <th className="px-4 py-2 font-medium text-right">현재 → 목표 비중</th>
                <th className="px-4 py-2 font-medium text-right">컨빅션</th>
                <th className="px-4 py-2 font-medium">근거</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proposal.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-5 py-2.5">
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-400">{item.ticker}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ACTION_TONE[item.action] ?? ""}`}
                    >
                      {ACTION_LABEL[item.action] ?? item.action}
                    </span>
                    {item.orderStatus !== "NOT_EXECUTED" && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        {ORDER_STATUS_LABEL[item.orderStatus] ?? item.orderStatus}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {item.currentWeightPct.toFixed(1)}% → {item.targetWeightPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{item.convictionScore}%</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-sm">
                    {item.rationale}
                    {item.riskFlags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.riskFlags.map((flag) => (
                          <span key={flag} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <p className="text-[11px] text-slate-400">
          {status === "EXECUTED"
            ? "승인 시점 시세로 모의 체결(페이퍼 트레이딩)되었습니다 — 아직 실제 토스 주문은 아닙니다."
            : "투자 권유가 아닌 AI Investor 참고 제안입니다."}
        </p>
        {status === "PENDING" && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReject}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              거절
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={pending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "처리 중..." : "승인"}
            </button>
          </div>
        )}
      </div>
      {warning && <p className="px-5 pb-3 text-xs text-amber-600">⚠️ {warning}</p>}
      {error && <p className="px-5 pb-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
