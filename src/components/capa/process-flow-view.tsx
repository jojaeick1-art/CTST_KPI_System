"use client";

import type { ProcessSimResult } from "@/src/types/capa-simulation";
import { trafficLightFromLoad } from "@/src/lib/capa/line-simulation";

function barColor(
  loadRate: number,
  isBottleneck: boolean,
  scheduleSufficient: boolean
): string {
  if (scheduleSufficient) return "bg-emerald-500";
  if (isBottleneck) return "bg-red-500";
  const t = trafficLightFromLoad(loadRate);
  if (t === "green") return "bg-emerald-500";
  if (t === "yellow") return "bg-amber-400";
  return "bg-red-500";
}

export function ProcessFlowView({
  processes,
  selectedProcessId,
  onSelectProcess,
  scheduleSufficient = false,
}: {
  processes: ProcessSimResult[];
  selectedProcessId: string | null;
  onSelectProcess: (processId: string) => void;
  /** 총 소요일 ≤ 근무일수(시뮬 기간)이면 true */
  scheduleSufficient?: boolean;
}) {
  if (!processes.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        레시피를 불러온 뒤 시뮬레이션을 실행하세요.
      </p>
    );
  }

  const showBottleneck = processes.length >= 2;
  const maxLoad = Math.max(...processes.map((p) => p.loadRate), 0.01);

  return (
    <div className="overflow-x-auto rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        공정 플로우 (좌 → 우)
      </p>
      <div className="flex min-w-max items-stretch gap-3">
        {processes.map((p, idx) => {
          const pct = Math.min(100, (p.loadRate / maxLoad) * 100);
          const selected = p.processId === selectedProcessId;
          const highlightBottleneck =
            showBottleneck && p.isBottleneck && !scheduleSufficient;
          return (
            <div key={p.processId} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onSelectProcess(p.processId)}
                className={`flex w-44 flex-col rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-sky-400 ring-2 ring-sky-200"
                    : highlightBottleneck
                      ? "border-red-300 bg-red-50/50"
                      : "border-slate-200 hover:border-sky-200"
                }`}
              >
                <span className="text-[10px] font-medium text-slate-400">
                  Step #{p.seqNo}
                </span>
                <span className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800">
                  {p.processName}
                </span>
                <span className="mt-1 text-[10px] font-medium text-sky-700">
                  설비 {p.equipmentCount}대
                </span>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${barColor(
                      p.loadRate,
                      p.isBottleneck,
                      scheduleSufficient
                    )}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="mt-2 text-xs tabular-nums text-slate-600">
                  부하 {(p.loadRate * 100).toFixed(0)}%
                </span>
                {highlightBottleneck ? (
                  <span className="mt-1 text-[10px] font-semibold uppercase text-red-600">
                    병목
                  </span>
                ) : null}
              </button>
              {idx < processes.length - 1 ? (
                <span className="text-slate-300" aria-hidden>
                  →
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
