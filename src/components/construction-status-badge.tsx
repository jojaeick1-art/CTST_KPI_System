"use client";

import {
  CONSTRUCTION_STATUS_LABELS,
  type ConstructionPace,
  type ConstructionStatus,
} from "@/src/lib/construction-projects";

const STATUS_CLASS: Record<ConstructionStatus, string> = {
  in_progress: "bg-sky-50 text-sky-800 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  hold: "bg-amber-50 text-amber-800 ring-amber-200",
  drop: "bg-rose-50 text-rose-700 ring-rose-200",
};

const PACE_LABEL: Record<ConstructionPace, string> = {
  not_started: "시작 전",
  on_track: "정상",
  delayed: "지연",
};

const PACE_CLASS: Record<ConstructionPace, string> = {
  not_started: "bg-slate-50 text-slate-600 ring-slate-200",
  on_track: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  delayed: "bg-red-50 text-red-700 ring-red-200",
};

export function ConstructionStatusBadge({
  status,
  size = "sm",
}: {
  status: ConstructionStatus;
  size?: "sm" | "xs";
}) {
  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-semibold ring-1 ${STATUS_CLASS[status]} ${sizeClass}`}
    >
      {CONSTRUCTION_STATUS_LABELS[status]}
    </span>
  );
}

/** 일정 대비 실적으로 자동 판단된 진행 상태. 담당자 지정 상태가 진행중일 때만 표시한다. */
export function ConstructionPaceBadge({
  pace,
  size = "sm",
}: {
  pace: ConstructionPace | null;
  size?: "sm" | "xs";
}) {
  if (pace === null) return null;
  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-semibold ring-1 ${PACE_CLASS[pace]} ${sizeClass}`}
    >
      {PACE_LABEL[pace]}
    </span>
  );
}
