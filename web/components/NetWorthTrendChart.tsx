"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface TrendSeries {
  name: string;
  points: { date: string; netWorth: number }[]; // date: "YYYY-MM-DD"
}

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];

function buildChartData(series: TrendSeries[]) {
  const dateSet = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
  const dates = Array.from(dateSet).sort();

  return dates.map((date) => {
    const row: Record<string, string | number> = { date };
    series.forEach((s) => {
      const point = s.points.find((p) => p.date === date);
      if (point) row[s.name] = point.netWorth;
    });
    return row;
  });
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { date: string };
}

function makeDot(color: string, selectedDate?: string) {
  function TrendDot({ cx, cy, payload }: DotProps) {
    if (cx === undefined || cy === undefined) return <g />;
    const isSelected = payload?.date === selectedDate;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 6 : 3}
        fill={isSelected ? color : "#fff"}
        stroke={color}
        strokeWidth={2}
      />
    );
  }
  return TrendDot;
}

export default function NetWorthTrendChart({
  series,
  onPointClick,
  selectedDate,
  emptyMessage = "순자산 추이를 표시하려면 스냅샷이 2개 이상 필요합니다.",
}: {
  series: TrendSeries[];
  onPointClick?: (date: string) => void;
  selectedDate?: string;
  emptyMessage?: string;
}) {
  const totalPoints = series.reduce((s, ser) => s + ser.points.length, 0);

  if (totalPoints < 2) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const data = buildChartData(series);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          className={onPointClick ? "cursor-pointer" : undefined}
          onClick={(e) => {
            if (onPointClick && e && typeof e.activeLabel === "string") {
              onPointClick(e.activeLabel);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
          <YAxis
            fontSize={12}
            stroke="#94a3b8"
            tickFormatter={(v: number) => v.toLocaleString("ko-KR")}
            width={80}
          />
          <Tooltip formatter={(v) => Number(v).toLocaleString("ko-KR")} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => {
            const color = COLORS[i % COLORS.length];
            return (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={color}
                strokeWidth={2}
                dot={makeDot(color, selectedDate)}
                activeDot={{ r: 6 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
