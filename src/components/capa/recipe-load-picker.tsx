"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { CapaRecipeCatalogItem } from "@/src/lib/capa-recipe-transfer";

function formatRecipeDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export function RecipeLoadPicker({
  open,
  loading,
  items,
  selectingPath,
  onClose,
  onSelect,
  hint = "저장된 레시피를 선택하세요.",
}: {
  open: boolean;
  loading: boolean;
  items: CapaRecipeCatalogItem[];
  selectingPath: string | null;
  onClose: () => void;
  onSelect: (storagePath: string) => void;
  hint?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !selectingPath) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, selectingPath, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !selectingPath) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-load-picker-title"
        className="flex max-h-[min(32rem,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3
              id="recipe-load-picker-title"
              className="text-base font-semibold text-slate-900"
            >
              불러올 레시피
            </h3>
            <p className="mt-1 text-sm text-slate-500">{hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(selectingPath)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
              레시피 목록을 불러오는 중…
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-12 text-center text-sm text-slate-500">
              저장된 레시피가 없습니다.
              <br />
              레시피 마스터에서 저장한 뒤 다시 시도하세요.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => {
                const busy = selectingPath === item.storagePath;
                return (
                  <li key={item.storagePath}>
                    <button
                      type="button"
                      disabled={Boolean(selectingPath)}
                      onClick={() => onSelect(item.storagePath)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-sky-50 focus:bg-sky-50 focus:outline-none disabled:opacity-60"
                    >
                      <span className="min-w-0 font-medium text-slate-800">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                        ) : (
                          <>
                            {item.processCount != null
                              ? `공정 ${item.processCount} · `
                              : null}
                            {formatRecipeDate(item.updatedAt)}
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(selectingPath)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
