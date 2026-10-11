import type { InvestorHoldingValuation } from "@/lib/investor-state";
import { formatCurrency, formatKrw, formatSignedCurrency, formatSignedPct } from "@/lib/format";

// 포트폴리오 탭의 HoldingsTable과 달리 수동 추가/삭제 UI가 없다 — AI Investor 종목은
// 오직 승인된 InvestorProposal 집행(Phase C)을 통해서만 편입/편출된다.
// 금액은 종목 통화(KR=원, US=달러) 기준으로 표시하고, 미국 종목은 원화 환산액을 함께 보여준다.
// 비중의 분모는 해당 시장 슬리브의 총 평가금액(현금 포함)이다.
export default function InvestorHoldingsTable({
  holdings,
  sleeveTotalKrw,
}: {
  holdings: InvestorHoldingValuation[];
  sleeveTotalKrw: number;
}) {
  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
        아직 AI Investor가 보유한 종목이 없습니다. 제안이 승인·집행되면 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-400">
            <tr className="text-left">
              <th className="px-4 py-2.5 font-medium">종목</th>
              <th className="px-4 py-2.5 font-medium text-right">수량</th>
              <th className="px-4 py-2.5 font-medium text-right">시세/평단가</th>
              <th className="px-4 py-2.5 font-medium text-right">매입/평가금액</th>
              <th className="px-4 py-2.5 font-medium text-right">비중</th>
              <th className="px-4 py-2.5 font-medium text-right">평가손익</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {holdings.map((h) => {
              const weightPct = sleeveTotalKrw > 0 ? (h.valueKrw / sleeveTotalKrw) * 100 : 0;
              const isUsd = h.currency === "USD";
              return (
                <tr key={h.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                      {h.name}
                      {!h.isLive && (
                        <span
                          title="실시간 시세 조회에 실패해 평단가 기준으로 표시합니다."
                          className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300"
                        />
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{h.ticker}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.quantity.toLocaleString("ko-KR")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="text-[11px] text-slate-400">{h.livePrice != null ? formatCurrency(h.livePrice, h.currency) : "-"}</div>
                    <div>{formatCurrency(h.avgPrice, h.currency)}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    <div className="text-[11px] font-normal text-slate-400">{formatCurrency(h.costNative, h.currency)}</div>
                    <div>{formatCurrency(h.valueNative, h.currency)}</div>
                    {isUsd && <div className="text-[11px] font-normal text-slate-400">≈ {formatKrw(h.valueKrw)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{weightPct.toFixed(1)}%</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-semibold ${
                      h.returnPct > 0 ? "text-red-600" : h.returnPct < 0 ? "text-blue-600" : "text-slate-500"
                    }`}
                  >
                    <div className="text-[11px] font-normal">{formatSignedCurrency(h.valueNative - h.costNative, h.currency)}</div>
                    <div>{formatSignedPct(h.returnPct)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
