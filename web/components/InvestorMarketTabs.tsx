"use client";

import { useState, type ReactNode } from "react";
import type { Region } from "@/lib/types";

// 탭 내용(InvestorSleeveSection)은 서버 컴포넌트로 미리 렌더링해 넘겨받고, 여기선 표시 전환만 한다
// (web/components/RecommendationTabs.tsx와 같은 pill 스타일).
export default function InvestorMarketTabs({
  tabs,
  initialRegion = "KR",
}: {
  tabs: { region: Region; label: string; badge?: string; content: ReactNode }[];
  initialRegion?: Region;
}) {
  const [region, setRegion] = useState<Region>(initialRegion);
  const active = tabs.find((t) => t.region === region) ?? tabs[0];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.region}
            type="button"
            onClick={() => setRegion(tab.region)}
            className={
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
              (active.region === tab.region ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100")
            }
          >
            {tab.label}
            {tab.badge && (
              <span
                className={
                  "ml-1.5 text-[11px] " + (active.region === tab.region ? "text-slate-300" : "text-slate-400")
                }
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      {active.content}
    </div>
  );
}
