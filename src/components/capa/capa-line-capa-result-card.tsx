"use client";

import { trafficLightFromLoad } from "@/src/lib/capa/line-simulation";
import type { LineSimResult } from "@/src/types/capa-simulation";

function formatInt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function trafficColor(loadRate: number): string {
  const t = trafficLightFromLoad(loadRate);
  if (t === "green") return "bg-emerald-500";
  if (t === "yellow") return "bg-amber-400";
  return "bg-red-500";
}

export function CapaLineCapaResultCard({ result }: { result: LineSimResult }) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white px-5 py-4 shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-7 w-7 shrink-0 rounded-full shadow-inner ${trafficColor(
              result.overloadRate + 1
            )}`}
            aria-hidden
          />
          <span className="text-xl font-bold tracking-tight text-slate-800">
            CAPA Simulator 산출 결과
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 sm:justify-end">
          <p className="text-base text-slate-600 sm:text-lg">
            가능 수량{" "}
            <span className="font-bold tabular-nums text-slate-900">
              {formatInt(result.lineCapacityUnits)}
            </span>
            <span className="mx-1 text-slate-400">/</span>
            목표{" "}
            <span className="font-bold tabular-nums text-slate-900">
              {formatInt(result.targetQty)}
            </span>
          </p>
          <p className="text-base text-slate-600 sm:text-lg">
            총 소요{" "}
            <span className="font-bold tabular-nums text-slate-900">
              {result.requiredCalendarDays}일
            </span>
          </p>
          <p className="text-base text-slate-600 sm:text-lg">
            과부하율:{" "}
            <span className="font-bold tabular-nums text-slate-900">
              {(Math.max(0, result.overloadRate) * 100).toFixed(1)}%
            </span>
          </p>
          {result.processes.length >= 2 &&
          result.bottleneckProcessName &&
          result.bottleneckProcessName !== "—" ? (
            <p className="text-base text-slate-600 sm:text-lg">
              병목:{" "}
              <span className="font-bold text-red-700">
                {result.bottleneckProcessName}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
