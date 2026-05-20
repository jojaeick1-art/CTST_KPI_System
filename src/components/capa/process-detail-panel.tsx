"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import type { ProcessSimResult } from "@/src/types/capa-simulation";
import { capaInputClassCompact } from "@/src/components/capa/capa-input-classes";
import {
  ProcessThroughputInput,
  type ThroughputInputMode,
} from "@/src/components/capa/process-throughput-input";
import { uphFromCtSec } from "@/src/lib/capa/throughput";

function formatInt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function MetricBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="shrink-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function ProcessDetailRow({
  process,
  sandboxMode,
  onOverride,
  onSelect,
  highlighted,
}: {
  process: ProcessSimResult;
  sandboxMode?: boolean;
  onOverride?: (
    processId: string,
    patch: { ctSec?: number; uptimeRate?: number; equipmentCount?: number }
  ) => void;
  onSelect?: (processId: string) => void;
  highlighted?: boolean;
}) {
  const [throughputMode, setThroughputMode] =
    useState<ThroughputInputMode>("ct");

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, button, textarea, select, a")) return;
    onSelect?.(process.processId);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if ((event.target as HTMLElement).closest("input, button")) return;
        event.preventDefault();
        onSelect?.(process.processId);
      }}
      className={`cursor-pointer rounded-2xl border px-5 py-4 shadow-sm transition-colors ${
        highlighted
          ? "border-sky-400 bg-sky-50/40 ring-1 ring-sky-200"
          : "border-sky-200 bg-white hover:border-sky-300"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="shrink-0 lg:min-w-[140px] lg:pr-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {process.processName}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">Step #{process.seqNo}</p>
        </div>

        <dl className="flex min-w-0 flex-1 flex-wrap items-end gap-x-6 gap-y-3 text-sm">
          <MetricBlock label="설비 대수">
            {sandboxMode && onOverride ? (
              <input
                type="number"
                min={1}
                step={1}
                key={`eq-${process.processId}-${process.equipmentCount}`}
                defaultValue={process.equipmentCount}
                onBlur={(ev) => {
                  const v = Math.floor(Number(ev.target.value));
                  if (v >= 1)
                    onOverride(process.processId, { equipmentCount: v });
                }}
                className={`w-20 ${capaInputClassCompact}`}
              />
            ) : (
              <span className="font-semibold tabular-nums text-slate-900">
                {process.equipmentCount}
              </span>
            )}
          </MetricBlock>

          <MetricBlock label={throughputMode === "ct" ? "C/T (초)" : "UPH"}>
            {sandboxMode && onOverride ? (
              <ProcessThroughputInput
                layout="inline"
                ctSec={process.ctSec}
                mode={throughputMode}
                onModeChange={setThroughputMode}
                onCtSecChange={(ctSec) =>
                  onOverride(process.processId, { ctSec })
                }
              />
            ) : (
              <span className="font-semibold tabular-nums text-slate-900">
                {throughputMode === "ct"
                  ? process.ctSec.toFixed(1)
                  : uphFromCtSec(process.ctSec).toFixed(2)}
              </span>
            )}
          </MetricBlock>

          <MetricBlock label="가동률 (%)">
            {sandboxMode && onOverride ? (
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                defaultValue={Math.round(process.uptimeRate * 100)}
                onBlur={(ev) => {
                  const v = Number(ev.target.value);
                  if (v > 0)
                    onOverride(process.processId, { uptimeRate: v / 100 });
                }}
                className={`w-24 ${capaInputClassCompact}`}
              />
            ) : (
              <span className="font-semibold tabular-nums text-slate-900">
                {(process.uptimeRate * 100).toFixed(0)}%
              </span>
            )}
          </MetricBlock>

          <MetricBlock label="가능 수량">
            <span className="font-semibold tabular-nums text-slate-900">
              {formatInt(process.capacityUnits)}
            </span>
          </MetricBlock>

          <MetricBlock label="부족 수량">
            <span
              className={`font-semibold tabular-nums ${
                process.shortageUnits > 0 ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {formatInt(process.shortageUnits)}
            </span>
          </MetricBlock>

          <MetricBlock label="부하율">
            <span className="font-semibold tabular-nums text-slate-900">
              {(process.loadRate * 100).toFixed(1)}%
            </span>
          </MetricBlock>
        </dl>
      </div>
    </div>
  );
}

export function ProcessDetailPanel({
  processes,
  selectedProcessId,
  sandboxMode,
  onOverride,
  onSelectProcess,
}: {
  processes: ProcessSimResult[];
  selectedProcessId?: string | null;
  sandboxMode?: boolean;
  onOverride?: (
    processId: string,
    patch: { ctSec?: number; uptimeRate?: number; equipmentCount?: number }
  ) => void;
  onSelectProcess?: (processId: string) => void;
}) {
  if (!processes.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
        레시피를 불러오고 근무조를 선택하면 공정별 조건을 편집할 수 있습니다.
      </div>
    );
  }

  const sorted = [...processes].sort((a, b) => a.seqNo - b.seqNo);

  return (
    <div className="space-y-3">
      {sorted.map((process) => (
        <ProcessDetailRow
          key={process.processId}
          process={process}
          sandboxMode={sandboxMode}
          onOverride={onOverride}
          onSelect={onSelectProcess}
          highlighted={selectedProcessId === process.processId}
        />
      ))}
    </div>
  );
}
