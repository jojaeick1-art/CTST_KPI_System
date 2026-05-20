/** 로컬 JSON 파일 스키마 버전 (2.0: 레시피 > 공정, 설비 계층 제거) */
export const CAPA_RECIPE_SCHEMA_VERSION = "2.0" as const;
export type CapaRecipeSchemaVersion = typeof CAPA_RECIPE_SCHEMA_VERSION;

/** 라인 구성: 직렬(공정 순차) | 병렬(유사 공정 다수 호기) */
export type CapaLineTopology = "serial" | "parallel";

export type CapaRecipeMeta = {
  id: string;
  name: string;
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
  /** 표준 Cycle Time (초) */
  ctSec: number;
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
