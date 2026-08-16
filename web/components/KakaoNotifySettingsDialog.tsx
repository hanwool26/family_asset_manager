"use client";

import { useState } from "react";

interface KakaoNotifySettingsDialogProps {
  configured: boolean;
  status: Record<string, boolean>;
}

export default function KakaoNotifySettingsDialog({ configured, status }: KakaoNotifySettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const members = Object.keys(status);
  const connectedCount = members.filter((m) => status[m]).length;

  const label = !configured
    ? "카카오 미설정"
    : connectedCount === 0
      ? "카카오 알림 미연동"
      : `카카오 알림 ${connectedCount}/${members.length}명 연동됨`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          "rounded-full border px-3 py-1.5 text-sm font-medium " +
          (configured && connectedCount > 0
            ? "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
            : "border-dashed border-amber-400 text-amber-600 hover:border-amber-500")
        }
      >
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          {!configured ? (
            <p className="text-xs text-slate-500">
              서버에 KAKAO_REST_API_KEY가 설정되어 있지 않습니다. 환경변수를 등록한 뒤 다시 시도하세요.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                리포트 발행 / AI Investor 승인 요청을 카카오톡 &quot;나에게 보내기&quot;로 받습니다.
              </p>
              <ul className="space-y-1.5">
                {members.map((member) => (
                  <li key={member} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {member}
                      {status[member] && <span className="ml-1.5 text-xs font-medium text-emerald-600">연동됨</span>}
                    </span>
                    <a
                      href={`/api/kakao/authorize?member=${encodeURIComponent(member)}`}
                      className={
                        status[member]
                          ? "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
                          : "rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      }
                    >
                      {status[member] ? "재연동" : "연동하기"}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
