import { createBrowserSupabase } from "@/src/lib/supabase";
import { canEditCampus2Schedule } from "@/src/lib/rbac";
import {
  CURRENT_KPI_YEAR,
  evidenceFileNameFromStoredValue,
  evidencePathFromStoredValue,
  uploadEvidenceFile,
} from "@/src/lib/kpi-queries";
import {
  buildCampus2WeekColumns,
  campus2CurrentWeekKey,
  campus2DateRangeLabel,
  campus2EvidenceDisplayName,
  campus2EvidenceStoragePath,
  campus2TaskBarSpan,
  campus2WeekLabelFromKey,
  campus2WeeksForTask,
  formatCampus2PlanRange,
  type Campus2ScheduleBundle,
  type Campus2ScheduleTask,
  type Campus2WeekColumn,
  type Campus2WeekKey,
  type Campus2WeeklyPerformance,
} from "@/src/lib/campus2-schedule";

export type SmtSetupWeekKey = Campus2WeekKey;
export type SmtSetupWeekColumn = Campus2WeekColumn;
export type SmtSetupScheduleTask = Campus2ScheduleTask;
export type SmtSetupWeeklyPerformance = Campus2WeeklyPerformance;
export type SmtSetupScheduleBundle = Campus2ScheduleBundle;

export {
  buildCampus2WeekColumns as buildSmtSetupWeekColumns,
  formatCampus2PlanRange as formatSmtSetupPlanRange,
  campus2TaskBarSpan as smtSetupTaskBarSpan,
  campus2CurrentWeekKey as smtSetupCurrentWeekKey,
  campus2WeekLabelFromKey as smtSetupWeekLabelFromKey,
  campus2WeeksForTask as smtSetupWeeksForTask,
  campus2DateRangeLabel as smtSetupDateRangeLabel,
  campus2EvidenceDisplayName as smtSetupEvidenceDisplayName,
  campus2EvidenceStoragePath as smtSetupEvidenceStoragePath,
};

const DEFAULT_TASKS: Omit<SmtSetupScheduleTask, "id">[] = [
  {
    sortOrder: 1,
    title: "1. SMT 신규 라인 · 인프라 공사",
    planStart: "2026-04-23",
    planEnd: "2026-05-26",
  },
  {
    sortOrder: 2,
    title: "1. SMT 신규 라인 · 설비 셋업",
    planStart: "2026-05-26",
    planEnd: "2026-05-29",
  },
  {
    sortOrder: 3,
    title: "1. SMT 신규 라인 · 검증 및 Qual",
    planStart: "2026-05-29",
    planEnd: "2026-06-05",
  },
  {
    sortOrder: 4,
    title: "1. SMT 신규 라인 · 양산가동",
    planStart: "2026-06-08",
    planEnd: "2026-06-30",
  },
  {
    sortOrder: 5,
    title: "2. SMT 이설 라인 · 인프라 공사",
    planStart: "2026-06-08",
    planEnd: "2026-06-09",
  },
  {
    sortOrder: 6,
    title: "2. SMT 이설 라인 · 설비 셋업",
    planStart: "2026-06-09",
    planEnd: "2026-06-11",
  },
  {
    sortOrder: 7,
    title: "2. SMT 이설 라인 · 검증 및 Qual",
    planStart: "2026-06-10",
    planEnd: "2026-06-13",
  },
  {
    sortOrder: 8,
    title: "2. SMT 이설 라인 · 통합 양산",
    planStart: "2026-06-15",
    planEnd: "2026-06-30",
  },
];

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

async function ensureSmtSetupScheduleEditor(): Promise<void> {
  const supabase = createBrowserSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    throw new Error("권한 정보를 확인하지 못했습니다.");
  }
  const role =
    profile && typeof (profile as { role?: unknown }).role === "string"
      ? (profile as { role: string }).role
      : null;
  if (!canEditCampus2Schedule(role)) {
    throw new Error(
      "SMT Line Set-up 실적 등록·수정·삭제는 그룹장·팀장·관리자만 할 수 있습니다."
    );
  }
}

function fallbackTasks(): SmtSetupScheduleTask[] {
  return DEFAULT_TASKS.map((task, index) => ({
    id: `smt-fallback-${index + 1}`,
    ...task,
  }));
}

function normalizeTaskRow(row: Record<string, unknown>): SmtSetupScheduleTask | null {
  const id = typeof row.id === "string" ? row.id : null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const planStart = typeof row.plan_start === "string" ? row.plan_start : null;
  const planEnd = typeof row.plan_end === "string" ? row.plan_end : null;
  const sortOrder =
    typeof row.sort_order === "number"
      ? row.sort_order
      : Number(row.sort_order ?? 0);
  if (!id || !title || !planStart || !planEnd) return null;
  return {
    id,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    title,
    planStart,
    planEnd,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeWeeklyRow(
  row: Record<string, unknown>
): SmtSetupWeeklyPerformance | null {
  const id = typeof row.id === "string" ? row.id : null;
  const taskId = typeof row.task_id === "string" ? row.task_id : null;
  const weekKey = typeof row.week_key === "string" ? row.week_key : null;
  const year = typeof row.year === "number" ? row.year : Number(row.year ?? 0);
  const achievementRate =
    typeof row.achievement_rate === "number"
      ? row.achievement_rate
      : Number(row.achievement_rate ?? 0);
  if (!id || !taskId || !weekKey || !Number.isFinite(year)) return null;
  const evidenceUrls = normalizeStringArray(row.evidence_urls);
  const evidenceUrl =
    typeof row.evidence_url === "string" && row.evidence_url.trim()
      ? row.evidence_url.trim()
      : evidenceUrls[0] ?? null;
  return {
    id,
    taskId,
    year,
    weekKey,
    achievementRate: clampPercent(achievementRate),
    description:
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : null,
    evidenceUrl,
    evidenceUrls: evidenceUrls.length ? evidenceUrls : evidenceUrl ? [evidenceUrl] : [],
    evidenceOriginalFilenames: normalizeStringArray(
      row.evidence_original_filenames
    ),
    updatedAt:
      typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at
        : null,
  };
}

function normalizeSummaryRow(
  row: Record<string, unknown> | null | undefined
): number | null {
  if (!row) return null;
  const rate =
    typeof row.overall_achievement_rate === "number"
      ? row.overall_achievement_rate
      : Number(row.overall_achievement_rate ?? NaN);
  if (!Number.isFinite(rate)) return null;
  return clampPercent(rate);
}

export async function fetchSmtSetupScheduleBundle(
  year: number = CURRENT_KPI_YEAR
): Promise<SmtSetupScheduleBundle> {
  const supabase = createBrowserSupabase();
  const fallback = fallbackTasks();

  const { data: taskRows, error: taskError } = await supabase
    .from("smt_setup_schedule_tasks")
    .select("id, sort_order, title, plan_start, plan_end")
    .order("sort_order", { ascending: true });

  if (taskError) {
    const weekColumns = buildCampus2WeekColumns(year, fallback);
    return {
      year,
      tasks: fallback,
      weekly: [],
      weekColumns,
      overallAchievement: 0,
      overallAchievementEditable: false,
    };
  }

  const tasks = (taskRows ?? [])
    .map((row) => normalizeTaskRow(row as Record<string, unknown>))
    .filter((row): row is SmtSetupScheduleTask => row !== null);

  const resolvedTasks = tasks.length ? tasks : fallback;
  const weekColumns = buildCampus2WeekColumns(year, resolvedTasks);

  const { data: weeklyRows, error: weeklyError } = await supabase
    .from("smt_setup_schedule_weekly")
    .select(
      "id, task_id, year, week_key, achievement_rate, description, evidence_url, evidence_urls, evidence_original_filenames, updated_at"
    )
    .eq("year", year);

  const weekly = weeklyError
    ? []
    : (weeklyRows ?? [])
        .map((row) => normalizeWeeklyRow(row as Record<string, unknown>))
        .filter((row): row is SmtSetupWeeklyPerformance => row !== null);

  const { data: summaryRow } = await supabase
    .from("smt_setup_schedule_summary")
    .select("overall_achievement_rate")
    .eq("year", year)
    .maybeSingle();

  const overallAchievement =
    normalizeSummaryRow(summaryRow as Record<string, unknown> | null) ?? 0;

  return {
    year,
    tasks: resolvedTasks,
    weekly,
    weekColumns,
    overallAchievement,
    overallAchievementEditable: !weeklyError,
  };
}

export async function upsertSmtSetupWeeklyPerformance(input: {
  taskId: string;
  year: number;
  weekKey: SmtSetupWeekKey;
  achievementRate: number;
  description: string;
  evidenceUrl?: string | null;
  evidenceUrls?: string[];
  evidenceOriginalFilenames?: string[];
}): Promise<{ id: string }> {
  await ensureSmtSetupScheduleEditor();
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  const evidenceUrls = (input.evidenceUrls ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const evidenceUrl =
    input.evidenceUrl !== undefined
      ? input.evidenceUrl?.trim() || null
      : evidenceUrls[0] ?? null;
  const payload: Record<string, unknown> = {
    task_id: input.taskId,
    year: input.year,
    week_key: input.weekKey,
    achievement_rate: clampPercent(input.achievementRate),
    description: input.description.trim() || null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (input.evidenceUrl !== undefined || input.evidenceUrls !== undefined) {
    payload.evidence_url = evidenceUrl;
    payload.evidence_urls = evidenceUrls.length ? evidenceUrls : null;
  }
  if (input.evidenceOriginalFilenames !== undefined) {
    payload.evidence_original_filenames = input.evidenceOriginalFilenames.length
      ? input.evidenceOriginalFilenames
      : null;
  }

  const { data, error } = await supabase
    .from("smt_setup_schedule_weekly")
    .upsert(payload, { onConflict: "task_id,year,week_key" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`SMT Line Set-up 주간 실적 저장 실패: ${error.message}`);
  }

  const id =
    data && typeof (data as { id?: unknown }).id === "string"
      ? (data as { id: string }).id
      : "";
  if (!id) {
    throw new Error("SMT Line Set-up 주간 실적 ID를 확인하지 못했습니다.");
  }
  return { id };
}

export async function upsertSmtSetupOverallAchievement(input: {
  year: number;
  achievementRate: number;
}): Promise<void> {
  await ensureSmtSetupScheduleEditor();
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  const { error } = await supabase.from("smt_setup_schedule_summary").upsert(
    {
      year: input.year,
      overall_achievement_rate: clampPercent(input.achievementRate),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "year" }
  );
  if (error) {
    throw new Error(`SMT Line Set-up 종합 달성률 저장 실패: ${error.message}`);
  }
}

function evidenceStoragePathsFromDbRow(row: Record<string, unknown>): string[] {
  const urls = normalizeStringArray(row.evidence_urls);
  const single =
    typeof row.evidence_url === "string" && row.evidence_url.trim()
      ? row.evidence_url.trim()
      : null;
  const combined =
    urls.length > 0
      ? single && !urls.includes(single)
        ? [single, ...urls]
        : urls
      : single
        ? [single]
        : [];
  const paths = new Set<string>();
  for (const raw of combined) {
    const p = evidencePathFromStoredValue(raw);
    if (p) paths.add(p);
  }
  return [...paths];
}

export async function deleteSmtSetupWeeklyPerformance(input: {
  taskId: string;
  year: number;
  weekKey: SmtSetupWeekKey;
}): Promise<void> {
  await ensureSmtSetupScheduleEditor();
  const supabase = createBrowserSupabase();

  const { data: row, error: selectError } = await supabase
    .from("smt_setup_schedule_weekly")
    .select("id, evidence_url, evidence_urls")
    .eq("task_id", input.taskId)
    .eq("year", input.year)
    .eq("week_key", input.weekKey)
    .maybeSingle();

  if (selectError) {
    throw new Error(`SMT Line Set-up 주간 실적 조회 실패: ${selectError.message}`);
  }
  if (!row) return;

  const storagePaths = evidenceStoragePathsFromDbRow(row as Record<string, unknown>);

  const { error } = await supabase
    .from("smt_setup_schedule_weekly")
    .delete()
    .eq("task_id", input.taskId)
    .eq("year", input.year)
    .eq("week_key", input.weekKey);

  if (error) {
    throw new Error(`SMT Line Set-up 주간 실적 삭제 실패: ${error.message}`);
  }

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("kpi-evidence")
      .remove(storagePaths);
    if (storageError && process.env.NODE_ENV === "development") {
      console.warn("[smt-setup-schedule] 증빙 Storage 삭제 실패(무시):", storageError.message);
    }
  }
}

export async function updateSmtSetupWeeklyEvidence(input: {
  weeklyId: string;
  evidenceUrls: string[];
  evidenceOriginalFilenames: string[];
}): Promise<void> {
  await ensureSmtSetupScheduleEditor();
  const supabase = createBrowserSupabase();
  const evidenceUrls = input.evidenceUrls.map((value) => value.trim()).filter(Boolean);
  const { error } = await supabase
    .from("smt_setup_schedule_weekly")
    .update({
      evidence_url: evidenceUrls[0] ?? null,
      evidence_urls: evidenceUrls.length ? evidenceUrls : null,
      evidence_original_filenames: input.evidenceOriginalFilenames.length
        ? input.evidenceOriginalFilenames
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.weeklyId);
  if (error) {
    throw new Error(`SMT Line Set-up 증빙 URL 저장 실패: ${error.message}`);
  }
}

export function mergeSmtSetupWeeklyEvidenceLists(input: {
  existingUrls: string[];
  existingOriginalFilenames: string[];
  uploadedPaths: string[];
  uploadedOriginalFilenames: string[];
  replaceExisting: boolean;
}): { evidenceUrls: string[]; evidenceOriginalFilenames: string[] } {
  if (input.replaceExisting) {
    return {
      evidenceUrls: input.uploadedPaths,
      evidenceOriginalFilenames: input.uploadedOriginalFilenames,
    };
  }
  return {
    evidenceUrls: [...input.existingUrls, ...input.uploadedPaths],
    evidenceOriginalFilenames: [
      ...input.existingOriginalFilenames,
      ...input.uploadedOriginalFilenames,
    ],
  };
}

/** 일정표 2열 레이아웃 — 오른쪽 열 표기(「·」 뒤) */
export function smtSetupPhaseLabel(title: string): string {
  const sep = title.indexOf("·");
  if (sep >= 0) return title.slice(sep + 1).trim();
  return title.trim();
}

/** 일정표 2열 레이아웃 — 왼쪽 열 라인 그룹 (sort 1~4 신규, 5~8 이설) */
export function smtSetupLineGroupLabel(sortOrder: number): string {
  return sortOrder <= 4 ? "SMT 신규라인" : "SMT 이설라인";
}

export function smtSetupLineGroupLines(sortOrder: number): {
  line1: string;
  line2: string;
} {
  return {
    line1: "SMT",
    line2: sortOrder <= 4 ? "신규라인" : "이설라인",
  };
}

export const SMT_SETUP_LINE_GROUP_ROW_SPAN = 4;

export async function uploadSmtSetupEvidenceFiles(
  weeklyId: string,
  files: File[]
): Promise<{ paths: string[]; originalFilenames: string[] }> {
  if (!files.length) {
    return { paths: [], originalFilenames: [] };
  }
  const storageTargetId = weeklyId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!storageTargetId) {
    throw new Error("실적 정보 생성 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  const uploadedPaths: string[] = [];
  const originalFilenames: string[] = [];
  for (const file of files) {
    const uploaded = await uploadEvidenceFile(storageTargetId, file);
    uploadedPaths.push(uploaded.fullPath);
    originalFilenames.push(file.name);
  }
  return { paths: uploadedPaths, originalFilenames };
}
