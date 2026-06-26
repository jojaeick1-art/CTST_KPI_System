"use client";

import { useEffect, useState } from "react";
import {
  capaInputClass,
  capaToolbarInputClass,
  capaMetricInputWidthClass,
} from "@/src/components/capa/capa-input-classes";
import {
  displayCtSec,
  displayUph,
  formatCtSecForInput,
  formatUphForInput,
  roundCtSec,
  roundUph,
} from "@/src/lib/capa/throughput";
import type { ThroughputBasis } from "@/src/types/capa-recipe";

export type ThroughputInputMode = ThroughputBasis;

export type ThroughputChange = {
  throughputBasis: ThroughputInputMode;
  ctSec?: number;
  stdUph?: number;
};

const modeBtnBase =
  "flex h-full items-center rounded-md px-3 text-sm font-medium transition-colors";
const modeBtnActive = "bg-sky-600 text-white shadow-sm";
const modeBtnIdle = "text-slate-600 hover:bg-slate-100";

function formatForMode(
  ctSec: number,
  stdUph: number | undefined,
  throughputBasis: ThroughputBasis,
  mode: ThroughputInputMode,
  arrayMultiplier: number
): string {
  return mode === "ct"
    ? formatCtSecForInput(
        displayCtSec(ctSec, stdUph, throughputBasis, arrayMultiplier)
      )
    : formatUphForInput(
        displayUph(ctSec, stdUph, throughputBasis, arrayMultiplier)
      );
}

export function ProcessThroughputInput({
  ctSec,
  stdUph,
  throughputBasis = "ct",
  mode,
  onModeChange,
  onThroughputChange,
  arrayMultiplier = 1,
  layout = "default",
  inlineInputWidthClass,
}: {
  ctSec: number;
  stdUph?: number;
  throughputBasis?: ThroughputBasis;
  mode: ThroughputInputMode;
  onModeChange: (mode: ThroughputInputMode) => void;
  onThroughputChange: (change: ThroughputChange) => void;
  /** 연배 — ct 기준 UPH 참고 표시에만 사용 */
  arrayMultiplier?: number;
  layout?: "default" | "inline";
  inlineInputWidthClass?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!editing) return;
    setDraft(
      formatForMode(ctSec, stdUph, throughputBasis, mode, arrayMultiplier)
    );
  }, [mode, editing, ctSec, stdUph, throughputBasis, arrayMultiplier]);

  const displayValue = editing
    ? draft
    : formatForMode(ctSec, stdUph, throughputBasis, mode, arrayMultiplier);

  function commitDraft(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "." || trimmed === "-") {
      setDraft(
        formatForMode(ctSec, stdUph, throughputBasis, mode, arrayMultiplier)
      );
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      setDraft(
        formatForMode(ctSec, stdUph, throughputBasis, mode, arrayMultiplier)
      );
      return;
    }

    if (mode === "ct") {
      onThroughputChange({
        throughputBasis: "ct",
        ctSec: roundCtSec(n),
      });
      return;
    }

    onThroughputChange({
      throughputBasis: "uph",
      stdUph: roundUph(n),
    });
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
          setDraft(
            formatForMode(ctSec, stdUph, throughputBasis, mode, arrayMultiplier)
          );
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
