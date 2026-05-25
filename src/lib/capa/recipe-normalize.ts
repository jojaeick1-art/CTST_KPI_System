import {
  CAPA_RECIPE_SCHEMA_VERSION,
  type CapaProcess,
  type CapaRecipe,
  type CapaRecipeFile,
} from "@/src/types/capa-recipe";

/** v1.0 레거시 설비 노드 */
type LegacyEquipment = {
  id?: string;
  name?: string;
  ctSec?: number;
  defaultUptimeRate?: number;
  sortOrder?: number;
  isActive?: boolean;
};

type LegacyProcess = Partial<CapaProcess> & {
  equipments?: LegacyEquipment[];
};

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 연배 — 1 이상 정수, 기본 1 */
export function normalizeArrayMultiplier(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function resolveArrayMultiplier(
  meta: { arrayMultiplier?: number } | null | undefined
): number {
  return normalizeArrayMultiplier(meta?.arrayMultiplier);
}

function clampUptime(rate: number): number {
  if (!Number.isFinite(rate)) return 0.9;
  if (rate > 1) return Math.min(1, rate / 100);
  return Math.min(1, Math.max(0.01, rate));
}

function normalizeEquipmentCount(
  raw: unknown,
  legacyEquipmentCount: number
): number {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  if (legacyEquipmentCount > 0) return legacyEquipmentCount;
  return 1;
}

function normalizeProcess(raw: LegacyProcess, index: number): CapaProcess {
  const legacyEq = (raw.equipments ?? []).filter((e) => e?.isActive !== false);

  let ctSec = Number(raw.ctSec);
  let uptime = raw.defaultUptimeRate;

  if ((!Number.isFinite(ctSec) || ctSec <= 0) && legacyEq.length > 0) {
    ctSec = Math.max(...legacyEq.map((e) => Number(e.ctSec) || 1));
    uptime = Math.min(
      ...legacyEq.map((e) => clampUptime(Number(e.defaultUptimeRate) || 0.9))
    );
  }

  return {
    id: raw.id?.trim() || newId(),
    processName: raw.processName?.trim() || `공정 ${index + 1}`,
    seqNo: Number.isFinite(raw.seqNo) ? Number(raw.seqNo) : index + 1,
    ctSec: Math.max(0.001, Number.isFinite(ctSec) && ctSec > 0 ? ctSec : 1),
    defaultUptimeRate: clampUptime(
      uptime != null ? Number(uptime) : 0.9
    ),
    equipmentCount: normalizeEquipmentCount(
      raw.equipmentCount,
      legacyEq.length
    ),
    isActive: raw.isActive !== false,
  };
}

/** JSON 파싱·정렬·기본값 보정 (v1.0 설비 배열 → 공정 C/T·가동률로 승격) */
export function normalizeCapaRecipeFile(raw: unknown): CapaRecipe {
  const obj =
    raw && typeof raw === "object" ? (raw as Partial<CapaRecipeFile>) : {};

  const now = new Date().toISOString();
  const meta = (obj.meta && typeof obj.meta === "object"
    ? obj.meta
    : {}) as Partial<CapaRecipe["meta"]>;

  const processes = ((obj.processes ?? []) as LegacyProcess[])
    .filter((p) => p?.isActive !== false)
    .map((p, i) => normalizeProcess(p, i))
    .sort((a, b) => a.seqNo - b.seqNo)
    .map((p, i) => ({ ...p, seqNo: i + 1 }));

  return {
    schemaVersion: CAPA_RECIPE_SCHEMA_VERSION,
    meta: {
      id: meta.id?.trim() || newId(),
      name: meta.name?.trim() || "새 레시피",
      arrayMultiplier: normalizeArrayMultiplier(meta.arrayMultiplier),
      description: meta.description?.trim() || undefined,
      lineTopology: meta.lineTopology,
      createdAt: meta.createdAt?.trim() || now,
      updatedAt: meta.updatedAt?.trim() || now,
      authorId: meta.authorId,
      authorName: meta.authorName,
    },
    processes,
  };
}

export function parseCapaRecipeJson(text: string): CapaRecipe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("레시피 JSON 형식이 올바르지 않습니다.");
  }
  return normalizeCapaRecipeFile(parsed);
}

export function serializeCapaRecipe(recipe: CapaRecipe): string {
  return JSON.stringify(recipe, null, 2);
}

export function createEmptyCapaRecipe(name = "새 레시피"): CapaRecipe {
  const now = new Date().toISOString();
  return normalizeCapaRecipeFile({
    schemaVersion: CAPA_RECIPE_SCHEMA_VERSION,
    meta: {
      id: newId(),
      name,
      createdAt: now,
      updatedAt: now,
    },
    processes: [
      {
        id: newId(),
        processName: "공정 1",
        seqNo: 1,
        ctSec: 10,
        defaultUptimeRate: 0.9,
        equipmentCount: 1,
      },
    ],
  });
}

export function createDefaultProcess(seqNo: number): CapaProcess {
  return normalizeProcess(
    {
      id: newId(),
      processName: `공정 ${seqNo}`,
      seqNo,
      ctSec: 10,
      defaultUptimeRate: 0.9,
      equipmentCount: 1,
    },
    seqNo - 1
  );
}
