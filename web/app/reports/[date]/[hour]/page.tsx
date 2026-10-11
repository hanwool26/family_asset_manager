import { notFound } from "next/navigation";
import { getReport } from "@/lib/reports";
import { formatReportTime } from "@/lib/format";
import RecommendationTabs from "@/components/RecommendationTabs";
import CategoryIssueCard from "@/components/CategoryIssueCard";
import FxAnalysisCard from "@/components/FxAnalysisCard";

// MongoDB에서 매번 최신 리포트를 읽어야 하므로 정적 프리렌더링을 막는다.
export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ date: string; hour: string }>;
}) {
  const { date, hour } = await params;
  const report = await getReport(date, Number(hour));

  if (!report) {
    notFound();
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-xl font-bold text-slate-900 mb-1">
          {report.date} {formatReportTime(report.hour, report.minute)} 리포트
        </h1>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-3">
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
