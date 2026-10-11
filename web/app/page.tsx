import { getLatestReport } from "@/lib/reports";
import { formatReportTime } from "@/lib/format";
import RecommendationTabs from "@/components/RecommendationTabs";
import CategoryIssueCard from "@/components/CategoryIssueCard";
import FxAnalysisCard from "@/components/FxAnalysisCard";

// MongoDB에서 매번 최신 리포트를 읽어야 하므로 정적 프리렌더링을 막는다.
// (누락 시 배포 시점 스냅샷으로 캐시되어 파이프라인이 새 리포트를 써도 반영되지 않음)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const report = await getLatestReport();

  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900 mb-2">오늘의 시장 분석</h1>
        <p className="text-sm text-slate-500">
          아직 생성된 리포트가 없습니다. 파이프라인이 처음 실행되면 이 화면에 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-xl font-bold text-slate-900 mb-2">오늘의 시장 분석</h1>
        <p className="text-xs text-slate-400 mb-3">
          기준 시점 {report.date} {formatReportTime(report.hour, report.minute)} KST
          &middot; 매일 07:30 / 19:30 (평일) 자동 갱신
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-700 leading-relaxed">{report.marketContext}</p>
        </div>
        {report.fxAnalysis && (
          <div className="mt-4">
            <FxAnalysisCard fx={report.fxAnalysis} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">추천 종목 TOP 5</h2>
        <RecommendationTabs recommendations={report.recommendations} />
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">카테고리별 이슈</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {report.categorySummaries.map((summary) => (
            <CategoryIssueCard key={summary.category} summary={summary} />
          ))}
        </div>
      </section>
    </div>
  );
}
