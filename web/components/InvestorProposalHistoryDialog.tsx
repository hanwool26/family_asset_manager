"use client";

import { useEffect, useState } from "react";
import InvestorProposalCard, { type ProposalWithItems } from "./InvestorProposalCard";

// "지난 제안" 섹션에는 카드 스택이 계속 쌓여 보유 종목이 아래로 밀리는 문제가 있었다.
// 화면에는 최신 지난 제안 1건만 노출하고, 나머지(최대 4건 더 = 총 5건)는 이 모달에서
// 버튼을 눌렀을 때만 확인하도록 분리한다.
export default function InvestorProposalHistoryDialog({ proposals }: { proposals: ProposalWithItems[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        히스토리
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-bold text-slate-900">지난 제안 히스토리 (최근 {proposals.length}건)</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
              {proposals.length === 0 ? (
                <p className="text-center text-sm text-slate-400">지난 제안이 없습니다.</p>
              ) : (
                proposals.map((p) => <InvestorProposalCard key={p.id} proposal={p} />)
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
