import { normalizeArrayMultiplier } from "@/src/lib/capa/recipe-normalize";
import { resolveThroughputBasis } from "@/src/lib/capa/throughput";
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

function capacityFromCt(input: {
  ctSec: number;
  effectiveMinutes: number;
  uptime: number;
  equipmentCount: number;
  arrayMultiplier: number;
}): number {
  const ct = Math.max(0.001, input.ctSec);
  const minutes = input.effectiveMinutes * input.uptime;
  return (
    Math.floor((minutes * 60) / ct) *
    input.equipmentCount *
    input.arrayMultiplier
  );
}

function capacityFromUph(input: {
  stdUph: number;
  effectiveMinutes: number;
  uptime: number;
  equipmentCount: number;
}): number {
  const uph = Math.max(0.001, input.stdUph);
  const effectiveHours = (input.effectiveMinutes * input.uptime) / 60;
  return Math.floor(effectiveHours * uph) * input.equipmentCount;
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
  const throughputBasis = resolveThroughputBasis(p.throughputBasis);

  const capacityUnits =
    throughputBasis === "uph" && p.stdUph != null && p.stdUph > 0
      ? capacityFromUph({
          stdUph: p.stdUph,
          effectiveMinutes: input.effectiveMinutes,
          uptime,
          equipmentCount,
        })
      : capacityFromCt({
          ctSec: ct,
          effectiveMinutes: input.effectiveMinutes,
          uptime,
          equipmentCount,
          arrayMultiplier,
        });

  const loadRate =
    input.targetQty > 0 && capacityUnits > 0
      ? input.targetQty / capacityUnits
      : 0;

  return {
    processId: p.id,
    processName: p.processName,
    seqNo: p.seqNo,
    ctSec: ct,
    stdUph: p.stdUph,
    throughputBasis,
    uptimeRate: uptime,
    equipmentCount,
    capacityUnits,
    loadRate,
    shortageUnits: Math.max(0, input.targetQty - capacityUnits),
    isBottleneck: false,
  };
}
