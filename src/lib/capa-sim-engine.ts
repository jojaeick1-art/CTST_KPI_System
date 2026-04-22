import type { ShiftPreset } from "@/src/types/capa";

/**
 * 교대 프리셋별 일별 유효 가동 시간(h)
 * - 8h: 단일 교대 8시간 기준
 * - 12h: 2교대 맞교대로 설비 24시간 가동 가정
 */
export function effectiveHoursPerDay(preset: ShiftPreset): number {
  return preset === "8h" ? 8 : 24;
}

export function bottleneckCtSecFromEquipments(
  ctList: number[]
): number | null {
  if (!ctList.length) return null;
  const max = Math.max(...ctList.map((c) => Number(c)));
  return Number.isFinite(max) && max > 0 ? max : null;
}

export type ProcessSimResult = {
  processId: string;
  processName: string;
  seqNo: number;
  bottleneckCtSec: number;
  uptimeRate: number;
  availableTimeSec: number;
  capacityUnits: number;
  uph: number;
  loadRate: number | null;
};

export function computeProcessSimulation(input: {
  bottleneckCtSec: number;
  uptimeRate: number;
  shiftPreset: ShiftPreset;
  workDays: number;
  demand: number | null;
}): Omit<ProcessSimResult, "processId" | "processName" | "seqNo"> {
  const hoursPerDay = effectiveHoursPerDay(input.shiftPreset);
  const uptime = Math.min(1, Math.max(0.01, input.uptimeRate));
  const bt = Math.max(0.001, input.bottleneckCtSec);
  const days = Math.max(0.001, input.workDays);

  const availableTimeSec = hoursPerDay * 3600 * days * uptime;
  const capacityUnits = Math.floor(availableTimeSec / bt);
  const uph = 3600 / bt;

  let loadRate: number | null = null;
  if (
    input.demand != null &&
    input.demand > 0 &&
    capacityUnits > 0
  ) {
    loadRate = input.demand / capacityUnits;
  }

  return {
    bottleneckCtSec: bt,
    uptimeRate: uptime,
    availableTimeSec,
    capacityUnits,
    uph,
    loadRate,
  };
}

export type TrafficLight = "green" | "yellow" | "red";

export function trafficLightFromLoad(loadRate: number | null): TrafficLight {
  if (loadRate == null || loadRate <= 0) return "green";
  if (loadRate < 0.85) return "green";
  if (loadRate <= 1) return "yellow";
  return "red";
}

/** 직렬 라인에서 기간 내 처리 가능한 최소 물량(공정 중 가장 작은 처리량) */
export function lineBottleneckCapacity(processCapacities: number[]): number {
  if (!processCapacities.length) return 0;
  return Math.min(...processCapacities);
}
