"use client";

import { useEffect, useState } from "react";
import {
  capaInputClass,
  capaToolbarInputClass,
  capaMetricInputWidthClass,
} from "@/src/components/capa/capa-input-classes";
import {
  ctSecFromUph,
  formatCtSecForInput,
  formatUphForInput,
  roundCtSec,
  uphFromCtSec,
} from "@/src/lib/capa/throughput";

export type ThroughputInputMode = "ct" | "uph";

const modeBtnBase =
  "flex h-full items-center rounded-md px-3 text-sm font-medium transition-colors";
const modeBtnActive = "bg-sky-600 text-white shadow-sm";
const modeBtnIdle = "text-slate-600 hover:bg-slate-100";

function formatForMode(
  ctSec: number,
  mode: ThroughputInputMode,
  arrayMultiplier: number
): string {
  return mode === "ct"
    ? formatCtSecForInput(ctSec)
    : formatUphForInput(uphFromCtSec(ctSec, arrayMultiplier));
}

function ctSecFromDraft(
  raw: string,
  mode: ThroughputInputMode,
  arrayMultiplier: number
): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "." || trimmed === "-") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return mode === "ct"
    ? roundCtSec(n)
    : roundCtSec(ctSecFromUph(n, arrayMultiplier));
}

export function ProcessThroughputInput({
  ctSec,
  mode,
  onModeChange,
  onCtSecChange,
  arrayMultiplier = 1,
  layout = "default",
  inlineInputWidthClass,
}: {
  ctSec: number;
  mode: ThroughputInputMode;
  onModeChange: (mode: ThroughputInputMode) => void;
  onCtSecChange: (ctSec: number) => void;
  /** 연배 — UPH 표시·역산에 반영 */
  arrayMultiplier?: number;
  layout?: "default" | "inline";
  inlineInputWidthClass?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!editing) return;
    setDraft(formatForMode(ctSec, mode, arrayMultiplier));
  }, [mode, editing, ctSec, arrayMultiplier]);

  const displayValue = editing
    ? draft
    : formatForMode(ctSec, mode, arrayMultiplier);

  function commitDraft(raw: string) {
    const next = ctSecFromDraft(raw, mode, arrayMultiplier);
    if (next != null) {
      onCtSecChange(next);
      return;
    }
    setDraft(formatForMode(ctSec, mode, arrayMultiplier));
  }

  const inputClass =
    layout === "inline"
      ? `${inlineInputWidthClass ?? "w-24"} ${capaToolbarInputClass}`
      : `shrink-0 ${capaMetricInputWidthClass} ${capaInputClass}`;
  const toggleHeight = "h-10";

  const controls = (
    <>
      <div
        className={`inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 ${toggleHeight}`}
      >
        <button
          type="button"
          className={`${modeBtnBase} ${mode === "ct" ? modeBtnActive : modeBtnIdle}`}
          onClick={() => onModeChange("ct")}
        >
          C/T
        </button>
        <button
          type="button"
          className={`${modeBtnBase} ${mode === "uph" ? modeBtnActive : modeBtnIdle}`}
          onClick={() => onModeChange("uph")}
        >
          UPH
        </button>
      </div>
      <input
        type="text"
        inputMode="decimal"
        className={inputClass}
        value={displayValue}
        onFocus={() => {
          setEditing(true);
          setDraft(formatForMode(ctSec, mode, arrayMultiplier));
        }}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={(ev) => {
          commitDraft(ev.target.value);
          setEditing(false);
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            commitDraft(ev.currentTarget.value);
            setEditing(false);
            ev.currentTarget.blur();
          }
        }}
      />
    </>
  );

  if (layout === "inline") {
    return <div className="flex items-stretch gap-2">{controls}</div>;
  }

  return (
    <div className="min-w-0 w-full">
      <span className="text-xs font-medium text-slate-600">측정 기준</span>
      <div className="mt-1 flex w-full min-w-0 items-stretch gap-2">{controls}</div>
    </div>
  );
}
