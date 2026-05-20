import type { CapaProcess, CapaRecipe } from "@/src/types/capa-recipe";
import type { RecipeOverrideMap } from "@/src/types/capa-simulation";

function applyProcessOverride(
  process: CapaProcess,
  override?: RecipeOverrideMap[string]
): CapaProcess {
  if (!override) return process;
  return {
    ...process,
    ctSec:
      override.ctSec != null && override.ctSec > 0
        ? override.ctSec
        : process.ctSec,
    defaultUptimeRate:
      override.uptimeRate != null && override.uptimeRate > 0
        ? override.uptimeRate > 1
          ? override.uptimeRate / 100
          : override.uptimeRate
        : process.defaultUptimeRate,
    equipmentCount:
      override.equipmentCount != null && override.equipmentCount > 0
        ? Math.floor(override.equipmentCount)
        : process.equipmentCount,
  };
}

/** 샌드박스 오버라이드를 적용한 복사본 (원본 불변) */
export function applyRecipeOverrides(
  baseline: CapaRecipe,
  overrides?: RecipeOverrideMap
): CapaRecipe {
  if (!overrides || !Object.keys(overrides).length) {
    return baseline;
  }

  const processes = baseline.processes.map((p) =>
    applyProcessOverride(p, overrides[p.id])
  );

  return { ...baseline, processes };
}
