"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { PlanPoint } from "@/lib/goal-plan";
import { formatKrw } from "@/lib/format";

function shortWon(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  return `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`;
}

export default function GoalPlanChart({ points, targetMonth }: { points: PlanPoint[]; targetMonth: string }) {
  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
        목표일이 이번 달이라 월별 흐름을 표시할 수 없습니다.
      </div>
    );
  }

  const data = points.map((p) => ({ month: p.month, 잔액: p.balance, 목표지출: p.cost > 0 ? -p.cost : null }));
  const hasNegative = points.some((p) => p.balance < 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" fontSize={11} stroke="#94a3b8" minTickGap={24} />
          <YAxis fontSize={11} stroke="#94a3b8" width={60} tickFormatter={shortWon} />
          <Tooltip formatter={(v) => formatKrw(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {hasNegative && <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />}
          <ReferenceLine x={targetMonth} stroke="#0f172a" strokeDasharray="3 3" label={{ value: "목표일", fontSize: 11, position: "top" }} />
          <Area type="monotone" dataKey="잔액" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2} />
          <Bar dataKey="목표지출" fill="#f59e0b" barSize={14} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-slate-400">
        잔액 = 가용 현금 + 누적 순저축 − 누적 목표 지출. 0 아래로 내려가는 구간이 대출이나 추가 자금이 필요한 시점입니다.
      </p>
    </div>
  );
}
