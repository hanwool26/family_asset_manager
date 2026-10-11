import type { FxAnalysis, FxOutlook, FxStance } from "@/lib/types";
import { formatSignedPct } from "@/lib/format";

const STANCE_LABEL: Record<FxStance, string> = {
  favorable: "유리",
  neutral: "중립",
  unfavorable: "불리",
};

const STANCE_TONE: Record<FxStance, string> = {
  favorable: "bg-emerald-50 text-emerald-700 border-emerald-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  unfavorable: "bg-amber-50 text-amber-700 border-amber-200",
};

const OUTLOOK_LABEL: Record<FxOutlook, string> = {
  up: "환율 상승(원화 약세) 우위",
  down: "환율 하락(원화 강세) 우위",
  sideways: "박스권 등락",
};

const TREND_LABEL: Record<FxAnalysis["emaTrend"], string> = {
  up: "상승 추세",
  down: "하락 추세",
  neutral: "혼조",
};

function changeTone(value: number | null): string {
  if (value == null) return "text-slate-400";
  return value > 0 ? "text-red-600" : value < 0 ? "text-blue-600" : "text-slate-500";
}

function formatRate(value: number): string {
  return value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StanceBlock({ title, stance }: { title: string; stance?: { stance: FxStance; comment: string } }) {
  if (!stance) return null;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STANCE_TONE[stance.stance]}`}>
          {STANCE_LABEL[stance.stance]}
        </span>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{stance.comment}</p>
    </div>
  );
}

// "오늘의 시장 분석" 아래에 붙는 원/달러 환율 카드 (pipeline/processing/fx_analysis.py가 생성).
// 환율 상승 = 원화 약세이므로, 등락 색상은 앱 전체 규칙(상승 빨강/하락 파랑)을 그대로 따른다.
export default function FxAnalysisCard({ fx }: { fx: FxAnalysis }) {
  const range = fx.high3m - fx.low3m;
  const positionPct = range > 0 ? Math.min(100, Math.max(0, ((fx.rate - fx.low3m) / range) * 100)) : 50;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">💱 원/달러 환율</h2>
          {fx.outlook && <p className="text-xs text-slate-400 mt-0.5">AI 1~2주 전망: {OUTLOOK_LABEL[fx.outlook]}</p>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatRate(fx.rate)}
            <span className="text-sm font-normal text-slate-400">원</span>
          </div>
          <div className={`text-xs font-semibold tabular-nums ${changeTone(fx.changePct)}`}>
            {fx.changePct != null ? `전일 대비 ${formatSignedPct(fx.changePct)}` : "-"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 mb-4">
        <div>
          <div className="text-slate-400">1주</div>
          <div className={`font-semibold tabular-nums ${changeTone(fx.change1wPct)}`}>
            {fx.change1wPct != null ? formatSignedPct(fx.change1wPct) : "-"}
          </div>
        </div>
        <div>
          <div className="text-slate-400">1개월</div>
          <div className={`font-semibold tabular-nums ${changeTone(fx.change1mPct)}`}>
            {fx.change1mPct != null ? formatSignedPct(fx.change1mPct) : "-"}
          </div>
        </div>
        <div>
          <div className="text-slate-400">RSI(14)</div>
          <div className="font-semibold tabular-nums text-slate-700">{fx.rsi ?? "-"}</div>
        </div>
        <div>
          <div className="text-slate-400">이평 추세</div>
          <div className="font-semibold text-slate-700">{TREND_LABEL[fx.emaTrend]}</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-[11px] text-slate-400 mb-1 tabular-nums">
          <span>3개월 저점 {formatRate(fx.low3m)}</span>
          <span>고점 {formatRate(fx.high3m)}</span>
        </div>
        <div className="relative h-1.5 rounded-full bg-slate-100">
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-700 shadow"
            style={{ left: `${positionPct}%` }}
            title={`현재 ${formatRate(fx.rate)}원`}
          />
        </div>
      </div>

      {fx.aiDegraded ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠️ 이번 회차는 AI 환율 분석 생성에 실패해 지표만 표시합니다.
        </p>
      ) : (
        <>
          {fx.summary && <p className="text-sm text-slate-700 leading-relaxed mb-3">{fx.summary}</p>}
          <div className="grid gap-3 sm:grid-cols-2 mb-3">
            <StanceBlock title="원 → 달러 환전" stance={fx.krwToUsd} />
            <StanceBlock title="달러 → 원 환전" stance={fx.usdToKrw} />
          </div>
          {fx.drivers && fx.drivers.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-slate-400 mb-1">핵심 요인</p>
              <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                {fx.drivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {fx.context.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {fx.context.map((c) => (
            <span key={c.label} className="rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 tabular-nums">
              {c.label} {c.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              <span className={`ml-1 ${changeTone(c.changePct)}`}>
                {c.changePct != null ? formatSignedPct(c.changePct) : ""}
              </span>
            </span>
          ))}
        </div>
      )}

      {fx.headlines.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-400 mb-1.5">참고 기사</p>
          <ul className="space-y-1">
            {fx.headlines.map((h, i) => (
              <li key={i} className="text-xs">
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {h.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        환율 예측은 불확실성이 큰 참고 정보이며, 환전 권유가 아닙니다. AI Investor 미국 슬리브 환전 시 참고용입니다.
      </p>
    </div>
  );
}
