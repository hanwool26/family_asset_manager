"use client";

import { useState, useTransition } from "react";
import { saveSnapshot } from "@/app/assets/actions";
import { DEFAULT_ASSET_CATEGORIES, DEFAULT_LIABILITY_CATEGORIES } from "@/lib/finance";
import { formatAmountInput, sanitizeAmountInput } from "@/lib/format";

const CUSTOM_CATEGORY = "__custom__";

interface Row {
  category: string;
  name: string;
  amount: string;
  note: string;
}

export interface InitialSnapshotItem {
  type: "ASSET" | "LIABILITY";
  category: string;
  name: string;
  amount: number;
  note?: string | null;
}

const emptyRow = (): Row => ({ category: "", name: "", amount: "", note: "" });

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

function toRows(items: InitialSnapshotItem[], type: "ASSET" | "LIABILITY"): Row[] {
  const rows = items
    .filter((i) => i.type === type)
    .map((i) => ({
      category: i.category,
      name: i.name,
      amount: String(i.amount),
      note: i.note ?? "",
    }));
  return rows.length > 0 ? rows : [emptyRow()];
}

function todayStr() {
  // 로컬 달력 기준 "오늘"을 기본값으로 사용 (UTC 변환 시 자정 근처에 날짜가 밀리는 것을 방지)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function RowsEditor({
  title,
  rows,
  setRows,
  presetCategories,
}: {
  title: string;
  rows: Row[];
  setRows: (rows: Row[]) => void;
  presetCategories: string[];
}) {
  function updateRow(i: number, field: keyof Row, value: string) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function removeRow(i: number) {
    setRows(rows.filter((_, idx) => idx !== i));
  }
  function handleAmountChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const caret = input.selectionStart ?? input.value.length;
    const significantBeforeCaret = countSignificantChars(input.value.slice(0, caret));
    const sanitized = sanitizeAmountInput(input.value);
    updateRow(i, "amount", sanitized);
    requestAnimationFrame(() => {
      const formatted = formatAmountInput(sanitized);
      const newCaret = caretAfterSignificantChars(formatted, significantBeforeCaret);
      input.setSelectionRange(newCaret, newCaret);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <button
          type="button"
          onClick={() => setRows([...rows, emptyRow()])}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          + 항목 추가
        </button>
      </div>
      <div className="space-y-3 sm:space-y-2">
        {rows.map((row, i) => {
          const isCustom = !presetCategories.includes(row.category);
          return (
            <div
              key={i}
              className="grid grid-cols-2 gap-1.5 items-start border-b border-slate-100 pb-3 sm:grid-cols-12 sm:border-0 sm:pb-0"
            >
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-4">
                <select
                  value={isCustom ? CUSTOM_CATEGORY : row.category}
                  onChange={(e) =>
                    updateRow(i, "category", e.target.value === CUSTOM_CATEGORY ? "" : e.target.value)
                  }
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                >
                  {presetCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={CUSTOM_CATEGORY}>직접 입력</option>
                </select>
                {isCustom && (
                  <input
                    placeholder="분류 직접 입력"
                    value={row.category}
                    onChange={(e) => updateRow(i, "category", e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  />
                )}
              </div>
              <input
                placeholder="항목명 (예: 국내주식)"
                value={row.name}
                onChange={(e) => updateRow(i, "name", e.target.value)}
                className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-xs sm:col-span-3"
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="금액"
                value={formatAmountInput(row.amount)}
                onChange={(e) => handleAmountChange(i, e)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-right tabular-nums sm:col-span-3"
              />
              <input
                placeholder="비고"
                value={row.note}
                onChange={(e) => updateRow(i, "note", e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs sm:col-span-1"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="col-span-2 justify-self-end text-xs text-red-500 hover:underline sm:col-span-1 sm:justify-self-auto"
              >
                삭제
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="text-xs text-slate-400">항목이 없습니다. &quot;+ 항목 추가&quot;로 입력하세요.</p>
        )}
      </div>
    </div>
  );
}

interface SnapshotFormDialogProps {
  memberId: string;
  assetCategories: string[];
  liabilityCategories: string[];
  /** 지정하면 "수정" 모드로 동작: 날짜는 고정되고 기존 항목이 미리 채워집니다. */
  initial?: {
    date: string; // "YYYY-MM-DD"
    memo?: string | null;
    items: InitialSnapshotItem[];
  };
  /** 추가 모드에서 최근 스냅샷을 템플릿으로 미리 채울 때 전달 (날짜는 오늘로 유지됩니다). */
  template?: {
    memo?: string | null;
    items: InitialSnapshotItem[];
  };
}

export default function SnapshotFormDialog({
  memberId,
  assetCategories,
  liabilityCategories,
  initial,
  template,
}: SnapshotFormDialogProps) {
  const isEdit = Boolean(initial);
  const source = initial ?? template;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initial?.date ?? todayStr());
  const [memo, setMemo] = useState(source?.memo ?? "");
  const [assetRows, setAssetRows] = useState<Row[]>(
    source ? toRows(source.items, "ASSET") : [emptyRow()]
  );
  const [liabilityRows, setLiabilityRows] = useState<Row[]>(
    source ? toRows(source.items, "LIABILITY") : [emptyRow()]
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const assetPresets = Array.from(new Set([...DEFAULT_ASSET_CATEGORIES, ...assetCategories]));
  const liabilityPresets = Array.from(new Set([...DEFAULT_LIABILITY_CATEGORIES, ...liabilityCategories]));

  function reset() {
    setDate(initial?.date ?? todayStr());
    setMemo(source?.memo ?? "");
    setAssetRows(source ? toRows(source.items, "ASSET") : [emptyRow()]);
    setLiabilityRows(source ? toRows(source.items, "LIABILITY") : [emptyRow()]);
    setError(null);
  }

  /** 템플릿을 무시하고 완전히 빈 입력으로 초기화 (신규 생성) */
  function resetBlank() {
    setDate(todayStr());
    setMemo("");
    setAssetRows([emptyRow()]);
    setLiabilityRows([emptyRow()]);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const items = [
      ...assetRows
        .filter((r) => r.name.trim() && r.amount.trim() !== "")
        .map((r) => ({
          type: "ASSET" as const,
          category: r.category.trim() || "기타",
          name: r.name.trim(),
          amount: Number(r.amount),
          note: r.note.trim() || undefined,
        })),
      ...liabilityRows
        .filter((r) => r.name.trim() && r.amount.trim() !== "")
        .map((r) => ({
          type: "LIABILITY" as const,
          category: r.category.trim() || "기타",
          name: r.name.trim(),
          amount: Number(r.amount),
          note: r.note.trim() || undefined,
        })),
    ];

    if (items.length === 0) {
      setError("자산 또는 부채 항목을 1개 이상 입력해주세요.");
      return;
    }

    startTransition(async () => {
      try {
        await saveSnapshot({ memberId, date, memo: memo.trim() || undefined, items });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    });
  }

  return (
    <div>
      {isEdit ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          수정
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-slate-900 text-white text-sm font-semibold px-4 py-2 hover:bg-slate-700 transition-colors"
        >
          + 스냅샷 추가
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <div className="w-full max-w-2xl rounded-xl bg-white p-4 sm:p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              자산 스냅샷 {isEdit ? "수정" : "추가"}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {isEdit
                ? "날짜는 수정할 수 없습니다. 날짜를 바꾸려면 삭제 후 새로 추가해주세요."
                : template
                ? "최근 스냅샷 내용을 불러왔습니다. 변경된 부분만 수정해주세요. (같은 날짜로 저장하면 기존 항목을 덮어씁니다)"
                : "같은 날짜로 다시 저장하면 해당 날짜의 기존 항목을 덮어씁니다."}
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-slate-500">
                  기준일
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    disabled={isEdit}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  메모 (선택)
                  <input
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </label>
              </div>

              <RowsEditor
                title="자산"
                rows={assetRows}
                setRows={setAssetRows}
                presetCategories={assetPresets}
              />
              <RowsEditor
                title="부채"
                rows={liabilityRows}
                setRows={setLiabilityRows}
                presetCategories={liabilityPresets}
              />

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                {!isEdit && template && (
                  <button
                    type="button"
                    onClick={resetBlank}
                    className="mr-auto rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                  >
                    신규 생성
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {pending ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
