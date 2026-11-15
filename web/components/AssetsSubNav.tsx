"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AddMemberDialog from "./AddMemberDialog";

interface Member {
  id: string;
  name: string;
}

export default function AssetsSubNav({ members }: { members: Member[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3 mb-6">
      <Link
        href="/assets"
        className={
          "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
          (pathname === "/assets"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:bg-slate-100")
        }
      >
        Summary
      </Link>
      {members.map((m) => (
        <Link
          key={m.id}
          href={`/assets/${m.id}`}
          className={
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
            (pathname === `/assets/${m.id}`
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:bg-slate-100")
          }
        >
          {m.name}
        </Link>
      ))}
      <AddMemberDialog />
      <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
      <Link
        href="/assets/goals"
        className={
          "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
          (pathname.startsWith("/assets/goals")
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:bg-slate-100")
        }
      >
        목표
      </Link>
      <Link
        href="/assets/loan"
        className={
          "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
          (pathname === "/assets/loan"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:bg-slate-100")
        }
      >
        대출 계산기
      </Link>
    </div>
  );
}
