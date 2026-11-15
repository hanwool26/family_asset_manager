"use client";

import { formatAmountInput, sanitizeAmountInput } from "@/lib/format";

/** 콤마 등을 제외한 "의미 있는" 문자(숫자·부호·소수점) 개수를 센다. */
function countSignificantChars(text: string): number {
  return (text.match(/[0-9.-]/g) ?? []).length;
}

/** 포맷된 문자열에서 앞쪽 의미 있는 문자를 n개 지난 지점의 커서 위치를 찾는다. */
function caretAfterSignificantChars(text: string, n: number): number {
  if (n <= 0) return 0;
  let count = 0;
  for (let idx = 0; idx < text.length; idx++) {
    if (/[0-9.-]/.test(text[idx])) {
      count++;
      if (count >= n) return idx + 1;
    }
  }
  return text.length;
}

/** 천단위 콤마가 붙는 금액 입력칸. value/onChange는 콤마 없는 원시 숫자 문자열이다. */
export default function AmountInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const caret = input.selectionStart ?? input.value.length;
    const significantBeforeCaret = countSignificantChars(input.value.slice(0, caret));
    const sanitized = sanitizeAmountInput(input.value);
    onChange(sanitized);
    requestAnimationFrame(() => {
      const formatted = formatAmountInput(sanitized);
      const newCaret = caretAfterSignificantChars(formatted, significantBeforeCaret);
      input.setSelectionRange(newCaret, newCaret);
    });
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={formatAmountInput(value)}
      onChange={handleChange}
      className={className}
    />
  );
}
