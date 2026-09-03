import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/src/lib/supabase-admin";
import {
  CURRENT_KPI_YEAR,
  evidenceFileNameFromStoredValue,
  evidencePathFromStoredValue,
  fetchDepartmentKpiDetail,
  type DepartmentKpiDetailItem,
  type KpiHoldDropStatus,
} from "@/src/lib/kpi-queries";

/**
 * 통합 Hub 읽기 전용 API가 쓰는 서버 전용 데이터 조회 모음.
 *
 * - 서비스 롤 클라이언트로 RLS를 우회해 조회하므로, 여기서 만드는 모든 응답은
 *   화면에 필요한 필드만 명시적으로 골라 내보낸다(`select('*')` 금지).
 * - 달성률·가중점수 등 "계산값"은 새로 만들지 않고 기존 화면이 쓰는
 *   `fetchDepartmentKpiDetail()`(kpi-queries.ts)을 그대로 재사용한다 —
 *   서버 전용 서비스 롤 클라이언트를 주입해서 호출한다.
 * - 이 파일에는 쓰기(INSERT/UPDATE/DELETE) 함수를 두지 않는다.
 */

export function getHubServiceClient(): SupabaseClient {
  return createServiceRoleSupabase();
}

// ---------------------------------------------------------------------------
// 컬럼 존재 여부 프로브 (kpi_items.created_at/updated_at 등 라이브 확인이 안 된 컬럼용)
// ---------------------------------------------------------------------------

const columnExistsCache = new Map<string, boolean>();

/**
 * `select(column).limit(1)` 로 컬럼 존재 여부를 프로브한다.
 * kpi-queries.ts의 `getKpiTargetsHasColumn()` 과 동일한 기법이며,
 * "확인되지 않은 컬럼을 가정하지 않는다"는 원칙에 따라 kpi_items 등
 * 라이브 DDL을 직접 확인하지 못한 테이블에 쓴다.
 */
export async function probeColumnExists(
  client: SupabaseClient,
  table: string,
  column: string
): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = columnExistsCache.get(key);
  if (cached !== undefined) return cached;
  const { error } = await client.from(table).select(column).limit(1);
  const exists = !error;
  columnExistsCache.set(key, exists);
  return exists;
}

// ---------------------------------------------------------------------------
// 부서
// ---------------------------------------------------------------------------

export type HubDepartment = {
  department_id: string;
  name: string;
};

/** `departments` — id/name 외 컬럼은 라이브 확인이 안 돼 포함하지 않는다. */
export async function fetchHubDepartments(
  client: SupabaseClient
): Promise<HubDepartment[]> {
  const { data, error } = await client
    .from("departments")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(`departments 조회 실패: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((row) => {
      const r = row;
      return {
        department_id: typeof r.id === "string" ? r.id : "",
        name: typeof r.name === "string" ? r.name : "",
      };
    })
    .filter((d) => d.department_id.length > 0);
}

// ---------------------------------------------------------------------------
// KPI 항목 + 계산값 (fetchDepartmentKpiDetail 재사용)
// ---------------------------------------------------------------------------

export type HubDepartmentBundle = {
  department: HubDepartment;
  items: DepartmentKpiDetailItem[];
  aggregates: {
    department_average_achievement: number | null;
    threshold_score: number | null;
    progress_score: number | null;
    qualitative_score: number | null;
    composite_score: number | null;
  };
};

/**
 * 부서별로 기존 화면과 동일한 `fetchDepartmentKpiDetail()`을 호출해 모은다.
 * `department_id`가 주어지면 해당 부서만, 없으면 전체 부서를 순회한다.
 * (부서 수가 적다는 전제 — `KPI_READONLY_API_ANALYSIS.md` 0번 요약 참고)
 */
export async function fetchHubDepartmentBundles(
  client: SupabaseClient,
  opts: { year: number; departmentId?: string | null }
): Promise<HubDepartmentBundle[]> {
  const allDepartments = await fetchHubDepartments(client);
  const targetDepartments = opts.departmentId
    ? allDepartments.filter((d) => d.department_id === opts.departmentId)
    : allDepartments;

  const bundles: HubDepartmentBundle[] = [];
  for (const dept of targetDepartments) {
    const detail = await fetchDepartmentKpiDetail(
      dept.department_id,
      opts.year,
      client
    );
    bundles.push({
      department: dept,
      items: detail.items,
      aggregates: {
        department_average_achievement: detail.departmentAverageAchievement,
        threshold_score: detail.thresholdScore,
        progress_score: detail.progressScore,
        qualitative_score: detail.qualitativeScore,
        composite_score: detail.compositeScore,
      },
    });
  }
  return bundles;
}

export type HubKpiItem = {
  kpi_item_id: string;
  department_id: string;
  year: number;
  main_topic: string;
  sub_topic: string;
  detail_activity: string;
  bm: string;
  weight: string;
  owner_name: string;
  /** `kpi_items`에는 담당자를 가리키는 FK가 없다(자유 텍스트 이름만 존재) — 항상 null. */
  owner_id: null;
  evaluation_type: string | null;
  unit: string | null;
  indicator_type: string;
  target_value: number | null;
  target_direction: "up" | "down" | "na";
  aggregation_type: string | null;
  target_fill_policy: string | null;
  achievement_cap: number | null;
  period_start_month: number | null;
  period_end_month: number | null;
  target_final_value: number | null;
  status: string;
  is_final_completed: boolean;
  hold_drop_status: KpiHoldDropStatus | null;
  hold_drop_reason: string | null;
  primary_kpi_id: string | null;
  needs_structure_review: boolean;
  average_achievement: number | null;
};

export function toHubKpiItem(
  departmentId: string,
  year: number,
  item: DepartmentKpiDetailItem
): HubKpiItem {
  return {
    kpi_item_id: item.id,
    department_id: departmentId,
    year,
    main_topic: item.mainTopic,
    sub_topic: item.subTopic,
    detail_activity: item.detailActivity,
    bm: item.bm,
    weight: item.weight,
    owner_name: item.owner,
    owner_id: null,
    evaluation_type: item.evaluationType,
    unit: item.unit,
    indicator_type: item.indicatorType,
    target_value: item.targetPpm,
    target_direction: item.targetDirection,
    aggregation_type: item.aggregationType,
    target_fill_policy: item.targetFillPolicy,
    achievement_cap:
      typeof item.achievementCap === "number" ? item.achievementCap : null,
    period_start_month: item.periodStartMonth,
    period_end_month: item.periodEndMonth,
    target_final_value: item.targetFinalValue,
    status: item.status,
    is_final_completed: item.isFinalCompleted,
    hold_drop_status: item.holdDropStatus,
    hold_drop_reason: item.holdDropReason,
    primary_kpi_id: item.primaryKpiId,
    needs_structure_review: item.needsStructureReview,
    average_achievement: item.averageAchievement,
  };
}

export type HubCalculatedResult = {
  kpi_item_id: string;
  department_id: string;
  year: number;
  monthly_achievement_rates: Record<string, number>;
  /** `month` 필터를 준 경우에만 채워짐 — 해당 월의 달성률 */
  month_achievement: number | null;
  average_achievement: number | null;
  current_approval_step: string | null;
  hold_drop_status: KpiHoldDropStatus | null;
  hold_drop_active: boolean;
  is_final_completed: boolean;
  needs_structure_review: boolean;
};

export function toHubCalculatedResult(
  departmentId: string,
  year: number,
  item: DepartmentKpiDetailItem,
  month: number | null
): HubCalculatedResult {
  const monthlyRates: Record<string, number> = {};
  for (const [key, value] of Object.entries(item.monthlyAchievementRates)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      monthlyRates[key] = value;
    }
  }
  return {
    kpi_item_id: item.id,
    department_id: departmentId,
    year,
    monthly_achievement_rates: monthlyRates,
    month_achievement:
      month !== null ? item.monthlyAchievementRates[month] ?? null : null,
    average_achievement: item.averageAchievement,
    current_approval_step: item.currentApprovalStep,
    hold_drop_status: item.holdDropStatus,
    hold_drop_active: item.holdDropStatus !== null,
    is_final_completed: item.isFinalCompleted,
    needs_structure_review: item.needsStructureReview,
  };
}

export type HubDepartmentAggregate = {
  department_id: string;
  department_name: string;
  year: number;
  department_average_achievement: number | null;
  threshold_score: number | null;
  progress_score: number | null;
  qualitative_score: number | null;
  composite_score: number | null;
};

// ---------------------------------------------------------------------------
// 실적 (kpi_targets 원본 필드 — 계산값 아님, 직접 조회)
// ---------------------------------------------------------------------------

/** 라이브 DB에서 확인된 kpi_targets 컬럼만 선택한다(select('*') 금지). */
const KPI_TARGETS_COLUMNS =
  "id, kpi_id, year, quarter, half_type, schedule, effect, " +
  "h1_target, h1_result, h1_rate, h1_effect, h1_target_value, h1_target_pct, " +
  "h2_schedule, h2_target, h2_result, h2_rate, h2_effect, h2_target_value, h2_target_pct, " +
  "challenge_goal, remarks, approval_step, rejection_reason, " +
  "performance_monthly, performance_submitted_by, kpi_items!inner(dept_id)";

const HUB_APPROVAL_STEPS = [
  "draft",
  "pending_primary",
  "pending_final",
  "approved",
  "pending",
] as const;
export type HubApprovalStep = (typeof HUB_APPROVAL_STEPS)[number];
export function isHubApprovalStep(value: string): value is HubApprovalStep {
  return (HUB_APPROVAL_STEPS as readonly string[]).includes(value);
}

export type HubPerformance = {
  performance_id: string;
  kpi_item_id: string;
  department_id: string | null;
  year: number | null;
  quarter: string | null;
  half_type: string | null;
  schedule: string | null;
  effect: string | null;
  h1_target: string | null;
  h1_result: number | null;
  h1_rate: number | null;
  h1_effect: string | null;
  h1_target_value: number | null;
  h1_target_pct: number | null;
  h2_schedule: string | null;
  h2_target: string | null;
  h2_result: number | null;
  h2_rate: number | null;
  h2_effect: string | null;
  h2_target_value: number | null;
  h2_target_pct: number | null;
  challenge_goal: string | null;
  remarks: string | null;
  approval_step: string | null;
  rejection_reason: string | null;
  /** 월별 실적(jsonb) — 키는 "1"~"15"(1~12월 + 익년 1~3월), 값은 실적/증빙/승인 이력 셀 */
  performance_monthly: Record<string, unknown> | null;
  performance_submitted_by: string | null;
};

function toNullableString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function toNullableNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapHubPerformanceRow(row: Record<string, unknown>): HubPerformance {
  const kpiItemsJoin = row.kpi_items;
  const joined = Array.isArray(kpiItemsJoin) ? kpiItemsJoin[0] : kpiItemsJoin;
  const departmentId =
    joined && typeof (joined as Record<string, unknown>).dept_id === "string"
      ? ((joined as Record<string, unknown>).dept_id as string)
      : null;
  return {
    performance_id: String(row.id ?? ""),
    kpi_item_id: String(row.kpi_id ?? ""),
    department_id: departmentId,
    year: toNullableNumber(row.year),
    quarter: toNullableString(row.quarter),
    half_type: toNullableString(row.half_type),
    schedule: toNullableString(row.schedule),
    effect: toNullableString(row.effect),
    h1_target: toNullableString(row.h1_target),
    h1_result: toNullableNumber(row.h1_result),
    h1_rate: toNullableNumber(row.h1_rate),
    h1_effect: toNullableString(row.h1_effect),
    h1_target_value: toNullableNumber(row.h1_target_value),
    h1_target_pct: toNullableNumber(row.h1_target_pct),
    h2_schedule: toNullableString(row.h2_schedule),
    h2_target: toNullableString(row.h2_target),
    h2_result: toNullableNumber(row.h2_result),
    h2_rate: toNullableNumber(row.h2_rate),
    h2_effect: toNullableString(row.h2_effect),
    h2_target_value: toNullableNumber(row.h2_target_value),
    h2_target_pct: toNullableNumber(row.h2_target_pct),
    challenge_goal: toNullableString(row.challenge_goal),
    remarks: toNullableString(row.remarks),
    approval_step: toNullableString(row.approval_step),
    rejection_reason: toNullableString(row.rejection_reason),
    performance_monthly:
      row.performance_monthly && typeof row.performance_monthly === "object"
        ? (row.performance_monthly as Record<string, unknown>)
        : null,
    performance_submitted_by: toNullableString(row.performance_submitted_by),
  };
}

export async function fetchHubPerformancesPage(
  client: SupabaseClient,
  filters: {
    year?: number;
    departmentId?: string;
    kpiItemId?: string;
    approvalStep?: HubApprovalStep;
  },
  range: { from: number; to: number }
): Promise<{ rows: HubPerformance[]; total: number }> {
  let query = client
    .from("kpi_targets")
    .select(KPI_TARGETS_COLUMNS, { count: "exact" });

  if (filters.year !== undefined) query = query.eq("year", filters.year);
  if (filters.kpiItemId) query = query.eq("kpi_id", filters.kpiItemId);
  if (filters.approvalStep) query = query.eq("approval_step", filters.approvalStep);
  if (filters.departmentId) {
    query = query.eq("kpi_items.dept_id", filters.departmentId);
  }

  const { data, error, count } = await query
    .order("id", { ascending: true })
    .range(range.from, range.to);
  if (error) throw new Error(`kpi_targets 조회 실패: ${error.message}`);

  // KPI_TARGETS_COLUMNS 가 문자열 연결로 조립돼 있어 supabase-js 가 select 결과의
  // 행 타입을 리터럴로 추론하지 못한다(GenericStringError) — unknown 을 거쳐 캐스팅한다.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return {
    rows: rows.map((row) => mapHubPerformanceRow(row)),
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 첨부파일 — kpi_targets.evidence_url(레거시) + performance_monthly 셀별 증빙을 정규화
// ---------------------------------------------------------------------------

const HUB_EVIDENCE_BUCKET = "kpi-evidence";

type RawEvidenceTargetRow = {
  id: string;
  kpi_id: string;
  year: number | null;
  evidence_url: string | null;
  performance_monthly: Record<string, unknown> | null;
  department_id: string | null;
};

async function fetchRawTargetsForAttachments(
  client: SupabaseClient,
  filters: { year?: number; departmentId?: string; kpiItemId?: string }
): Promise<RawEvidenceTargetRow[]> {
  let query = client
    .from("kpi_targets")
    .select("id, kpi_id, year, evidence_url, performance_monthly, kpi_items!inner(dept_id)");

  if (filters.year !== undefined) query = query.eq("year", filters.year);
  if (filters.kpiItemId) query = query.eq("kpi_id", filters.kpiItemId);
  if (filters.departmentId) query = query.eq("kpi_items.dept_id", filters.departmentId);

  const { data, error } = await query;
  if (error) throw new Error(`kpi_targets(증빙) 조회 실패: ${error.message}`);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const r = row;
    const joined = Array.isArray(r.kpi_items) ? r.kpi_items[0] : r.kpi_items;
    const departmentId =
      joined && typeof (joined as Record<string, unknown>).dept_id === "string"
        ? ((joined as Record<string, unknown>).dept_id as string)
        : null;
    return {
      id: String(r.id ?? ""),
      kpi_id: String(r.kpi_id ?? ""),
      year: toNullableNumber(r.year),
      evidence_url: toNullableString(r.evidence_url),
      performance_monthly:
        r.performance_monthly && typeof r.performance_monthly === "object"
          ? (r.performance_monthly as Record<string, unknown>)
          : null,
      department_id: departmentId,
    };
  });
}

type EvidenceEntry = {
  storagePath: string;
  originalFilename: string;
  month: number | null;
};

/**
 * kpi_targets 한 행에서 증빙 경로를 전부 뽑아 중복 제거한다.
 * 레거시 단일 `evidence_url` 컬럼 + 월별 `performance_monthly[month].evidence_urls` 셀을 모두 본다.
 * (이 셀 단위 추출은 단순 필드 매핑이라 "계산값"이 아니므로 별도 재구현했다 —
 *  달성률 등 계산 로직은 전부 kpi-queries.ts 를 그대로 재사용한다.)
 */
function extractEvidenceEntries(row: RawEvidenceTargetRow): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [];
  const seen = new Set<string>();

  const legacyPath = evidencePathFromStoredValue(row.evidence_url);
  if (legacyPath && !seen.has(legacyPath)) {
    seen.add(legacyPath);
    entries.push({
      storagePath: legacyPath,
      originalFilename: evidenceFileNameFromStoredValue(row.evidence_url),
      month: null,
    });
  }

  if (row.performance_monthly) {
    for (const [key, cellRaw] of Object.entries(row.performance_monthly)) {
      const month = Number(key);
      if (!Number.isInteger(month) || month < 1 || month > 15) continue;
      const cell =
        cellRaw && typeof cellRaw === "object"
          ? (cellRaw as Record<string, unknown>)
          : {};
      const rawUrls: string[] = [];
      if (Array.isArray(cell.evidence_urls)) {
        for (const v of cell.evidence_urls) {
          if (typeof v === "string" && v.trim()) rawUrls.push(v.trim());
        }
      }
      if (typeof cell.evidence_url === "string" && cell.evidence_url.trim()) {
        rawUrls.push(cell.evidence_url.trim());
      }
      const names = Array.isArray(cell.evidence_original_filenames)
        ? cell.evidence_original_filenames
        : [];
      rawUrls.forEach((raw, index) => {
        const path = evidencePathFromStoredValue(raw);
        if (!path || seen.has(path)) return;
        seen.add(path);
        const nameFromMeta =
          typeof names[index] === "string" ? (names[index] as string).trim() : "";
        entries.push({
          storagePath: path,
          originalFilename: nameFromMeta || evidenceFileNameFromStoredValue(raw),
          month,
        });
      });
    }
  }

  return entries;
}

type StorageObjectMeta = {
  ownerId: string | null;
  createdAt: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
};

/** `storage.objects` 메타데이터를 경로 목록으로 일괄 조회한다(스키마 교차 조회). */
async function fetchStorageMetadataByPath(
  client: SupabaseClient,
  paths: string[]
): Promise<Map<string, StorageObjectMeta>> {
  const map = new Map<string, StorageObjectMeta>();
  if (paths.length === 0) return map;

  const { data, error } = await client
    .schema("storage")
    .from("objects")
    .select("name, owner, created_at, metadata")
    .eq("bucket_id", HUB_EVIDENCE_BUCKET)
    .in("name", paths);
  if (error) {
    // 첨부 메타데이터 보강은 부가 정보라 실패해도 목록 자체는 내려준다.
    return map;
  }

  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const r = row;
    const name = typeof r.name === "string" ? r.name : "";
    if (!name) continue;
    const metaObj =
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {};
    const sizeRaw = metaObj.size;
    map.set(name, {
      ownerId: typeof r.owner === "string" ? r.owner : null,
      createdAt: typeof r.created_at === "string" ? r.created_at : null,
      sizeBytes:
        typeof sizeRaw === "number"
          ? sizeRaw
          : typeof sizeRaw === "string" && Number.isFinite(Number(sizeRaw))
            ? Number(sizeRaw)
            : null,
      mimeType: typeof metaObj.mimetype === "string" ? metaObj.mimetype : null,
    });
  }
  return map;
}

export type HubAttachment = {
  attachment_id: string;
  performance_id: string;
  kpi_item_id: string;
  department_id: string | null;
  year: number | null;
  month: number | null;
  bucket: typeof HUB_EVIDENCE_BUCKET;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string | null;
  uploader_id: string | null;
};

export function encodeHubAttachmentId(bucket: string, storagePath: string): string {
  return Buffer.from(`${bucket}:${storagePath}`, "utf8").toString("base64url");
}

export function decodeHubAttachmentId(
  attachmentId: string
): { bucket: string; storagePath: string } | null {
  try {
    const raw = Buffer.from(attachmentId, "base64url").toString("utf8");
    const idx = raw.indexOf(":");
    if (idx <= 0) return null;
    const bucket = raw.slice(0, idx);
    const storagePath = raw.slice(idx + 1);
    if (!bucket || !storagePath) return null;
    return { bucket, storagePath };
  } catch {
    return null;
  }
}

export async function fetchHubAttachments(
  client: SupabaseClient,
  filters: { year?: number; departmentId?: string; kpiItemId?: string }
): Promise<HubAttachment[]> {
  const rows = await fetchRawTargetsForAttachments(client, filters);

  const withEntries = rows.flatMap((row) =>
    extractEvidenceEntries(row).map((entry) => ({ row, entry }))
  );
  const allPaths = withEntries.map(({ entry }) => entry.storagePath);
  const metaByPath = await fetchStorageMetadataByPath(client, allPaths);

  return withEntries.map(({ row, entry }) => {
    const meta = metaByPath.get(entry.storagePath);
    return {
      attachment_id: encodeHubAttachmentId(HUB_EVIDENCE_BUCKET, entry.storagePath),
      performance_id: row.id,
      kpi_item_id: row.kpi_id,
      department_id: row.department_id,
      year: row.year,
      month: entry.month,
      bucket: HUB_EVIDENCE_BUCKET,
      storage_path: entry.storagePath,
      original_filename: entry.originalFilename,
      mime_type: meta?.mimeType ?? null,
      size_bytes: meta?.sizeBytes ?? null,
      uploaded_at: meta?.createdAt ?? null,
      uploader_id: meta?.ownerId ?? null,
    };
  });
}

/**
 * 첨부파일 경로가 실제로 어떤 kpi_targets 실적에 연결돼 있는지 검증한다.
 * (임의 Storage 경로에 서명 URL을 내주지 않기 위한 필수 검증)
 */
export async function isHubAttachmentPathLinked(
  client: SupabaseClient,
  storagePath: string
): Promise<boolean> {
  const rows = await fetchRawTargetsForAttachments(client, {});
  for (const row of rows) {
    const entries = extractEvidenceEntries(row);
    if (entries.some((e) => e.storagePath === storagePath)) return true;
  }
  return false;
}

export async function createHubSignedUrl(
  client: SupabaseClient,
  storagePath: string,
  expiresInSeconds: number
): Promise<string> {
  const { data, error } = await client.storage
    .from(HUB_EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`서명 URL 발급 실패: ${error?.message ?? "알 수 없는 오류"}`);
  }
  return data.signedUrl;
}

export { CURRENT_KPI_YEAR };
