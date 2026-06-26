import { normalizeArrayMultiplier } from "@/src/lib/capa/recipe-normalize";
import type { ThroughputBasis } from "@/src/types/capa-recipe";

/** C/T(초) ↔ UPH(시간당 생산수) 환산 — 참고 표시용. UPH = (3600 / C/T) × 연배 */
export function uphFromCtSec(
  ctSec: number,
  arrayMultiplier: number = 1
): number {
  if (!Number.isFinite(ctSec) || ctSec <= 0) return 0;
  const arr = normalizeArrayMultiplier(arrayMultiplier);
  return (3600 / ctSec) * arr;
}

export function ctSecFromUph(
  uph: number,
  arrayMultiplier: number = 1
): number {
  if (!Number.isFinite(uph) || uph <= 0) return 1;
  const arr = normalizeArrayMultiplier(arrayMultiplier);
  return (3600 * arr) / uph;
}

export function formatUphForInput(uph: number): string {
  if (!Number.isFinite(uph) || uph <= 0) return "";
  return uph.toFixed(2);
}

/** UI 표시·입력용 C/T(초) — 소수 2자리 */
export function formatCtSecForInput(ctSec: number): string {
  if (!Number.isFinite(ctSec) || ctSec <= 0) return "";
  return ctSec.toFixed(2);
}

export function roundCtSec(ctSec: number): number {
  if (!Number.isFinite(ctSec) || ctSec <= 0) return 1;
  return Math.round(ctSec * 100) / 100;
}

export function roundUph(uph: number): number {
  if (!Number.isFinite(uph) || uph <= 0) return 1;
  return Math.round(uph * 100) / 100;
}

export function resolveThroughputBasis(
  basis: ThroughputBasis | null | undefined
): ThroughputBasis {
  return basis === "uph" ? "uph" : "ct";
}

/** 화면 표시용 C/T — ct 기준이면 저장값, uph 기준이면 UPH에서 환산(참고) */
export function displayCtSec(
  ctSec: number,
  stdUph: number | undefined,
  throughputBasis: ThroughputBasis | undefined,
  arrayMultiplier: number = 1
): number {
  const basis = resolveThroughputBasis(throughputBasis);
  if (basis === "uph" && stdUph != null && stdUph > 0) {
    return ctSecFromUph(stdUph, arrayMultiplier);
  }
  return ctSec;
}

/** 화면 표시용 UPH — uph 기준이면 저장값, ct 기준이면 C/T에서 환산(참고) */
export function displayUph(
  ctSec: number,
  stdUph: number | undefined,
  throughputBasis: ThroughputBasis | undefined,
  arrayMultiplier: number = 1
): number {
  const basis = resolveThroughputBasis(throughputBasis);
  if (basis === "uph" && stdUph != null && stdUph > 0) {
    return stdUph;
  }
  return uphFromCtSec(ctSec, arrayMultiplier);
}
