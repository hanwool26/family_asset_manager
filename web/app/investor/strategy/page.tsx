import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export const dynamic = "force-static";

// logic_strategy/ 는 저장소 최상위 .gitignore에 걸려있어 Vercel 배포에 포함되지 않는다 —
// 그래서 이 문서는 web/ 안(content/)에 둬서 빌드에 함께 실린다.
const STRATEGY_MD_PATH = path.join(process.cwd(), "content", "ai-investor-strategy.md");

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mb-3 mt-8 text-xl font-bold text-slate-900 first:mt-0">{children}</h1>,
  h2: ({ children }) => (
    <h2 className="mb-3 mt-8 border-b border-slate-200 pb-1.5 text-base font-bold text-slate-900">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed text-slate-700">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 rounded-r-md border-l-4 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-slate-200" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 text-slate-500">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-slate-100 last:border-0">{children}</tr>,
  th: ({ children, style }) => (
    <th className="whitespace-nowrap px-3 py-2 font-medium" style={style}>
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td className="px-3 py-2 align-top text-slate-700" style={style}>
      {children}
    </td>
  ),
};

export default function InvestorStrategyPage() {
  const content = fs.readFileSync(STRATEGY_MD_PATH, "utf-8");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/investor" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-800">
        ← AI Investor로 돌아가기
      </Link>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
