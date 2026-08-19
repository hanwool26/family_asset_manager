import type { Region } from "./types";

export function formatPrice(price: number, region: Region): string {
  if (region === "KR") {
    return `${Math.round(price).toLocaleString("ko-KR")}원`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSignedPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatSignedKrw(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatCurrency(value: number, currency: string): string {
  if (currency === "USD") {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return formatKrw(value);
}

/** 리포트 생성 슬롯 시각 표시. minute 없는 과거 문서(07:00/12:00/19:00 시절)는 0으로 취급. */
export function formatReportTime(hour: number, minute?: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
}

/**
 * 금액 입력칸용 원시값(콤마 없는 숫자 문자열, 입력 도중의 "-"·"." 포함 가능) -> 화면 표시값 변환.
 * 정수부에만 천단위 콤마를 붙이고 소수부/부호는 그대로 유지한다.
 */
export function formatAmountInput(raw: string): string {
  if (!raw) return "";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [intPart, ...rest] = unsigned.split(".");
  const digits = intPart.replace(/^0+(?=\d)/, "");
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimal = rest.length > 0 ? `.${rest.join("")}` : "";
  return `${sign}${withCommas}${decimal}`;
}

/** 사용자가 입력한 문자열(콤마 등 포맷 문자 포함 가능)에서 순수 숫자 원시값만 남긴다. 부호는 맨 앞, 소수점은 1개까지만 허용. */
export function sanitizeAmountInput(value: string): string {
  const negative = value.trim().startsWith("-");
  const stripped = value.replace(/[^0-9.]/g, "");
  const firstDot = stripped.indexOf(".");
  const digitsOnly =
    firstDot === -1
      ? stripped
      : stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, "");
  return (negative ? "-" : "") + digitsOnly;
}
