/** 로컬 JSON 파일 스키마 버전 (2.0: 레시피 > 공정, 설비 계층 제거) */
export const CAPA_RECIPE_SCHEMA_VERSION = "2.0" as const;
export type CapaRecipeSchemaVersion = typeof CAPA_RECIPE_SCHEMA_VERSION;

/** 라인 구성: 직렬(공정 순차) | 병렬(유사 공정 다수 호기) */
export type CapaLineTopology = "serial" | "parallel";

/** 생산성 입력 기준 — C/T 또는 UPH 중 사용자가 입력한 쪽이 100% 가동 기준 */
export type ThroughputBasis = "ct" | "uph";

export type CapaRecipeMeta = {
  id: string;
  name: string;
  /** 레시피가 속한 상위 공정 그룹 (예: SMT, Die Test 등) */
  processGroup?: string;
  /** 연배(한 사이클당 생산 패널 수). UPH·CAPA = 기본식 × 배열, 기본 1 */
  arrayMultiplier?: number;
  description?: string;
  lineTopology?: CapaLineTopology;
  createdAt: string;
  updatedAt: string;
  authorId?: string;
  authorName?: string;
};

export type CapaProcess = {
  id: string;
  processName: string;
  seqNo: number;
  /** 표준 Cycle Time (초) — throughputBasis가 ct일 때 100% 가동 기준 */
  ctSec: number;
  /** 표준 UPH(시간당, 연배 반영) — throughputBasis가 uph일 때 100% 가동 기준 */
  stdUph?: number;
  /** 생산성 계산·표시 기준 (기본 ct, 레거시 호환) */
  throughputBasis?: ThroughputBasis;
  /** 기본 가동률 0~1 */
  defaultUptimeRate: number;
  /** 동일 공정 내 병렬 설비(호기) 수 — CAPA = (가용시간/C/T) × 설비 대수 */
  equipmentCount: number;
  isActive?: boolean;
};

/** 로컬 PC에 저장되는 레시피 파일 본문 */
export type CapaRecipeFile = {
  schemaVersion: CapaRecipeSchemaVersion;
  meta: CapaRecipeMeta;
  processes: CapaProcess[];
};

export type CapaRecipe = CapaRecipeFile;
