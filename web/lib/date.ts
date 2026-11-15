// 스냅샷 날짜는 시각 정보가 없는 "달력 날짜"이므로 항상 UTC 자정 기준으로
// 파싱/포맷해 타임존에 따라 하루가 밀리는 문제를 방지한다.

export function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function formatDateOnlyISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDateOnlyKorean(date: Date): string {
  const [y, m, d] = formatDateOnlyISO(date).split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/** 한국 시간 기준 오늘의 달력 날짜 ("YYYY-MM-DD"). 서버가 UTC로 돌아도 자정~09시 사이에 하루 밀리지 않게 한다. */
export function todayKstISO(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 위 formatDateOnlyKorean과 달리 시각을 포함한 실제 타임스탬프(예: 시세 조회 시각)를
// 포맷할 때 쓴다. 항상 한국 시간(Asia/Seoul) 기준으로 표시한다.
export function formatDateTimeKorean(date: Date): string {
  const datePart = date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
  return `${datePart} ${timePart}`;
}
