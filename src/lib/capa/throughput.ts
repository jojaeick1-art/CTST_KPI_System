import { normalizeArrayMultiplier } from "@/src/lib/capa/recipe-normalize";

/** C/T(초) ↔ UPH(시간당 생산수) 변환 — 저장값은 항상 ctSec. UPH = (3600 / C/T) × 연배 */
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
  if (uph >= 100) return String(Math.round(uph));
  if (uph >= 10) return uph.toFixed(1);
  return uph.toFixed(2);
}

/** UI 표시·입력용 C/T(초) — 소수 1자리 */
export function formatCtSecForInput(ctSec: number): string {
  if (!Number.isFinite(ctSec) || ctSec <= 0) return "";
  return ctSec.toFixed(1);
}

export function roundCtSec(ctSec: number): number {
  if (!Number.isFinite(ctSec) || ctSec <= 0) return 1;
  return Math.round(ctSec * 10) / 10;
}
