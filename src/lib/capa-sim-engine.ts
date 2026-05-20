import type { ShiftPreset } from "@/src/types/capa";
import {
  bottleneckCtSecFromEquipments,
  effectiveUptimeFromEquipments,
} from "@/src/lib/capa/process-capacity";
import {
  lineBottleneckCapacity,
  trafficLightFromLoad,
} from "@/src/lib/capa/line-simulation";

export {
  bottleneckCtSecFromEquipments,
  lineBottleneckCapacity,
  trafficLightFromLoad,
};
export type { TrafficLight } from "@/src/types/capa-simulation";

/**
 * @deprecated ShiftSelection + SimulationCalendar 사용 권장
 */
export function effectiveHoursPerDay(preset: ShiftPreset): number {
  return preset === "8h" ? 8 : 24;
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

/** @deprecated runSingleSimulation 사용 권장 */
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
  if (input.demand != null && input.demand > 0 && capacityUnits > 0) {
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

export { effectiveUptimeFromEquipments };
