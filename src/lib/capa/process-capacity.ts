import { normalizeArrayMultiplier } from "@/src/lib/capa/recipe-normalize";
import type { CapaProcess } from "@/src/types/capa-recipe";
import type { ProcessSimResult } from "@/src/types/capa-simulation";

/** @deprecated 레거시 DB 설비 목록 집계용 */
export function bottleneckCtSecFromEquipments(ctSecList: number[]): number | null {
  if (!ctSecList.length) return null;
  return Math.max(...ctSecList.map((v) => Number(v) || 0));
}

/** @deprecated 레거시 DB 설비 목록 집계용 */
export function effectiveUptimeFromEquipments(uptimeList: number[]): number {
  if (!uptimeList.length) return 0.9;
  return Math.min(...uptimeList.map((v) => Number(v) || 0));
}

export function calcProcessSimulation(input: {
  process: CapaProcess;
  effectiveMinutes: number;
  targetQty: number;
  arrayMultiplier?: number;
}): ProcessSimResult {
  const p = input.process;
  const ct = Math.max(0.001, p.ctSec);
  const uptime = Math.min(1, Math.max(0.01, p.defaultUptimeRate));
  const equipmentCount = Math.max(
    1,
    Math.floor(Number(p.equipmentCount)) || 1
  );
  const arrayMultiplier = normalizeArrayMultiplier(input.arrayMultiplier);
  const minutes = input.effectiveMinutes * uptime;
  const capacityUnits =
    Math.floor((minutes * 60) / ct) * equipmentCount * arrayMultiplier;
  const loadRate =
    input.targetQty > 0 && capacityUnits > 0
      ? input.targetQty / capacityUnits
      : 0;

  return {
    processId: p.id,
    processName: p.processName,
    seqNo: p.seqNo,
    ctSec: ct,
    uptimeRate: uptime,
    equipmentCount,
    capacityUnits,
    loadRate,
    shortageUnits: Math.max(0, input.targetQty - capacityUnits),
    isBottleneck: false,
  };
}
