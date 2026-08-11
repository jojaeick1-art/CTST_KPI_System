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
  type Campus2WeekColumn,
  type Campus2WeeklyPerformance,
} from "@/src/lib/campus2-schedule";

/**
 * 공사/Set-up 메뉴는 동일한 구조를 쓰고 테이블만 다르다.
 * 도메인 설정으로 대상 테이블·표시 문구·공사비용 사용 여부를 분기한다.
 */
export type ConstructionCategory = "construction" | "setup";

export type ConstructionDomain = {
  category: ConstructionCategory;
  tasksTable: string;
  weeklyTable: string;
  /** 공사비용 컬럼 사용 여부 (Set-up 은 비용 없음) */
  hasCost: boolean;
  labels: {
    /** "공사 항목" / "Set-up 항목" */
    projectNoun: string;
    /** 목록 표 첫 열 머리글 */
    projectTitleColumn: string;
    /** "주요 공사" / "주요 일정" */
    taskNoun: string;
    /** 상세 일정표 첫 열 머리글 */
    taskColumnHeader: string;
  };
};

export const CONSTRUCTION_DOMAIN: ConstructionDomain = {
  category: "construction",
  tasksTable: "campus2_schedule_tasks",
  weeklyTable: "campus2_schedule_weekly",
  hasCost: true,
  labels: {
    projectNoun: "공사 항목",
    projectTitleColumn: "공사 제목",
    taskNoun: "주요 공사",
    taskColumnHeader: "주요 공사 일정",
  },
};

export const SETUP_DOMAIN: ConstructionDomain = {
  category: "setup",
  tasksTable: "smt_setup_schedule_tasks",
  weeklyTable: "smt_setup_schedule_weekly",
  hasCost: false,
  labels: {
    projectNoun: "Set-up 항목",
    projectTitleColumn: "Set-up 제목",
    taskNoun: "주요 일정",
    taskColumnHeader: "Set-up 일정",
  },
};

/** 담당자가 직접 지정하는 상태. 지연/정상은 일정 대비 실적으로 자동 판단한다. */
export type ConstructionStatus = "in_progress" | "completed" | "hold" | "drop";

/** 일정 대비 실적으로 자동 계산되는 진행 상태 (status가 in_progress일 때만 의미 있음) */
export type ConstructionPace = "not_started" | "on_track" | "delayed";

export type ConstructionProject = {
  id: string;
  title: string;
  description: string | null;
  managerName: string | null;
  status: ConstructionStatus;
  sortOrder: number;
};

export type ConstructionTask = {
  id: string;
  projectId: string | null;
  sortOrder: number;
  title: string;
  planStart: string;
  planEnd: string;
  cost: number;
  progressRate: number;
  status: ConstructionStatus;
  evidenceUrls: string[];
  evidenceOriginalFilenames: string[];
};

export type ConstructionProjectSummary = {
  project: ConstructionProject;
  tasks: ConstructionTask[];
  /** 드랍 제외 주요공사 공사비용 합계 */
  totalCost: number;
  /** 드랍 제외 주요공사 진행률 평균 (완료 상태는 100으로 계산) */
  progressRate: number;
  delayedTaskCount: number;
};

export type ConstructionBundle = {
  year: number;
  projects: ConstructionProjectSummary[];
  weekly: Campus2WeeklyPerformance[];
  /** 프로젝트별 주차 컬럼 (projectId → columns) */
  weekColumnsByProject: Record<string, Campus2WeekColumn[]>;
};

export const CONSTRUCTION_STATUS_LABELS: Record<ConstructionStatus, string> = {
  in_progress: "진행중",
  completed: "완료",
  hold: "홀딩",
  drop: "드랍",
};

/** 지연 판정 허용 오차(%p) — 계획 대비 이만큼까지는 정상으로 본다 */
const PACE_TOLERANCE_PERCENT = 5;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map((part) => Number(part));
  return new Date(y, m - 1, d);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function normalizeStatus(value: unknown): ConstructionStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "completed" || raw === "hold" || raw === "drop") return raw;
  return "in_progress";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** `₩157,000` — 금액 표시는 항상 원화 기호 + 천단위 구분 */
export function formatKrw(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

/** 완료 상태는 진행률 입력값과 무관하게 100%로 계산한다. */
export function effectiveTaskProgress(task: Pick<ConstructionTask, "status" | "progressRate">): number {
  if (task.status === "completed") return 100;
  return clampPercent(task.progressRate);
}

/** 오늘 기준 계획상 기대 진행률 (0~100) */
export function expectedProgressPercent(
  planStart: string,
  planEnd: string,
  now: Date = new Date()
): number {
  const start = parseIsoDate(planStart).getTime();
  const end = endOfDay(parseIsoDate(planEnd)).getTime();
  const current = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return current >= end ? 100 : 0;
  }
  if (current <= start) return 0;
  if (current >= end) return 100;
  return clampPercent(((current - start) / (end - start)) * 100);
}

/**
 * 일정 대비 실적으로 지연 여부를 판단한다.
 * 담당자가 완료·홀딩·드랍으로 지정한 항목은 자동 판단 대상에서 제외(null).
 */
export function taskPace(task: ConstructionTask, now: Date = new Date()): ConstructionPace | null {
  if (task.status !== "in_progress") return null;
  const expected = expectedProgressPercent(task.planStart, task.planEnd, now);
  if (expected <= 0) return "not_started";
  const actual = effectiveTaskProgress(task);
  return actual + PACE_TOLERANCE_PERCENT < expected ? "delayed" : "on_track";
}

export function summarizeTasks(tasks: ConstructionTask[]): {
  totalCost: number;
  progressRate: number;
  delayedTaskCount: number;
} {
  const counted = tasks.filter((task) => task.status !== "drop");
  const totalCost = counted.reduce((sum, task) => sum + toNumber(task.cost), 0);
  const progressRate = counted.length
    ? counted.reduce((sum, task) => sum + effectiveTaskProgress(task), 0) / counted.length
    : 0;
  const delayedTaskCount = tasks.filter((task) => taskPace(task) === "delayed").length;
  return {
    totalCost,
    progressRate: clampPercent(progressRate),
    delayedTaskCount,
  };
}

function normalizeProjectRow(row: Record<string, unknown>): ConstructionProject | null {
  const id = typeof row.id === "string" ? row.id : null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!id || !title) return null;
  return {
    id,
    title,
    description:
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : null,
    managerName:
      typeof row.manager_name === "string" && row.manager_name.trim()
        ? row.manager_name.trim()
        : null,
    status: normalizeStatus(row.status),
    sortOrder: toNumber(row.sort_order),
  };
}

function normalizeTaskRow(row: Record<string, unknown>): ConstructionTask | null {
  const id = typeof row.id === "string" ? row.id : null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const planStart = typeof row.plan_start === "string" ? row.plan_start : null;
  const planEnd = typeof row.plan_end === "string" ? row.plan_end : null;
  if (!id || !title || !planStart || !planEnd) return null;
  return {
    id,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    sortOrder: toNumber(row.sort_order),
    title,
    planStart,
    planEnd,
    cost: toNumber(row.cost),
    progressRate: clampPercent(toNumber(row.progress_rate)),
    status: normalizeStatus(row.status),
    evidenceUrls: normalizeStringArray(row.evidence_urls),
    evidenceOriginalFilenames: normalizeStringArray(row.evidence_original_filenames),
  };
}

function normalizeWeeklyRow(row: Record<string, unknown>): Campus2WeeklyPerformance | null {
  const id = typeof row.id === "string" ? row.id : null;
  const taskId = typeof row.task_id === "string" ? row.task_id : null;
  const weekKey = typeof row.week_key === "string" ? row.week_key : null;
  const year = toNumber(row.year);
  if (!id || !taskId || !weekKey) return null;
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
    achievementRate: clampPercent(toNumber(row.achievement_rate)),
    description:
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : null,
    evidenceUrl,
    evidenceUrls: evidenceUrls.length ? evidenceUrls : evidenceUrl ? [evidenceUrl] : [],
    evidenceOriginalFilenames: normalizeStringArray(row.evidence_original_filenames),
    updatedAt:
      typeof row.updated_at === "string" && row.updated_at.trim() ? row.updated_at : null,
  };
}

async function ensureConstructionEditor(): Promise<void> {
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
    throw new Error("공사 항목 등록·수정·삭제는 그룹장·팀장·관리자만 할 수 있습니다.");
  }
}

export async function fetchConstructionBundle(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
): Promise<ConstructionBundle> {
  const supabase = createBrowserSupabase();
  const { labels } = domain;

  const { data: projectRows, error: projectError } = await supabase
    .from("construction_projects")
    .select("id, title, description, manager_name, status, sort_order")
    .eq("category", domain.category)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (projectError) {
    throw new Error(`${labels.projectNoun} 목록을 불러오지 못했습니다: ${projectError.message}`);
  }

  const projects = (projectRows ?? [])
    .map((row) => normalizeProjectRow(row as Record<string, unknown>))
    .filter((row): row is ConstructionProject => row !== null);

  const taskColumns = [
    "id",
    "project_id",
    "sort_order",
    "title",
    "plan_start",
    "plan_end",
    ...(domain.hasCost ? ["cost"] : []),
    "progress_rate",
    "status",
    "evidence_urls",
    "evidence_original_filenames",
  ].join(", ");

  const { data: taskRows, error: taskError } = await supabase
    .from(domain.tasksTable)
    .select(taskColumns)
    .order("sort_order", { ascending: true });
  if (taskError) {
    throw new Error(`${labels.taskNoun} 일정을 불러오지 못했습니다: ${taskError.message}`);
  }

  // 컬럼 목록을 도메인별로 조립하므로 supabase-js 가 행 타입을 추론하지 못한다.
  const tasks = ((taskRows ?? []) as unknown as Record<string, unknown>[])
    .map((row) => normalizeTaskRow(row))
    .filter((row): row is ConstructionTask => row !== null);

  const { data: weeklyRows } = await supabase
    .from(domain.weeklyTable)
    .select(
      "id, task_id, year, week_key, achievement_rate, description, evidence_url, evidence_urls, evidence_original_filenames, updated_at"
    )
    .eq("year", year);

  const weekly = (weeklyRows ?? [])
    .map((row) => normalizeWeeklyRow(row as Record<string, unknown>))
    .filter((row): row is Campus2WeeklyPerformance => row !== null);

  const weekColumnsByProject: Record<string, Campus2WeekColumn[]> = {};
  const summaries: ConstructionProjectSummary[] = projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    weekColumnsByProject[project.id] = buildCampus2WeekColumns(year, projectTasks);
    return {
      project,
      tasks: projectTasks,
      ...summarizeTasks(projectTasks),
    };
  });

  return { year, projects: summaries, weekly, weekColumnsByProject };
}

export async function createConstructionProject(input: {
  domain: ConstructionDomain;
  title: string;
  description: string;
  managerName: string;
  status: ConstructionStatus;
}): Promise<string> {
  await ensureConstructionEditor();
  const supabase = createBrowserSupabase();
  const { domain } = input;
  const title = input.title.trim();
  if (!title) throw new Error("제목을 입력해 주세요.");

  const { data: lastRow } = await supabase
    .from("construction_projects")
    .select("sort_order")
    .eq("category", domain.category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = toNumber((lastRow as { sort_order?: unknown } | null)?.sort_order) + 1;

  const { data, error } = await supabase
    .from("construction_projects")
    .insert({
      title,
      description: input.description.trim() || null,
      manager_name: input.managerName.trim() || null,
      status: input.status,
      sort_order: nextSortOrder,
      category: domain.category,
    })
    .select("id")
    .single();
  if (error) throw new Error(`${domain.labels.projectNoun} 등록 실패: ${error.message}`);
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new Error("등록된 항목 ID를 확인하지 못했습니다.");
  return id;
}

export async function updateConstructionProject(input: {
  id: string;
  title: string;
  description: string;
  managerName: string;
  status: ConstructionStatus;
}): Promise<void> {
  await ensureConstructionEditor();
  const supabase = createBrowserSupabase();
  const title = input.title.trim();
  if (!title) throw new Error("공사 제목을 입력해 주세요.");
  const { error } = await supabase
    .from("construction_projects")
    .update({
      title,
      description: input.description.trim() || null,
      manager_name: input.managerName.trim() || null,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(`공사 항목 수정 실패: ${error.message}`);
}

export async function deleteConstructionProject(projectId: string): Promise<void> {
  await ensureConstructionEditor();
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("construction_projects")
    .delete()
    .eq("id", projectId);
  if (error) throw new Error(`공사 항목 삭제 실패: ${error.message}`);
}

export type ConstructionTaskInput = {
  domain: ConstructionDomain;
  projectId: string;
  title: string;
  planStart: string;
  planEnd: string;
  cost: number;
  progressRate: number;
  status: ConstructionStatus;
};

/** 공사비용은 공사 도메인에서만 저장한다(Set-up 테이블에는 cost 컬럼이 없음). */
function taskWritePayload(input: ConstructionTaskInput): Record<string, unknown> {
  return {
    title: input.title.trim(),
    plan_start: input.planStart,
    plan_end: input.planEnd,
    progress_rate: clampPercent(input.progressRate),
    status: input.status,
    ...(input.domain.hasCost ? { cost: Math.max(0, toNumber(input.cost)) } : {}),
  };
}

function validateTaskInput(input: ConstructionTaskInput): void {
  if (!input.title.trim()) {
    throw new Error(`${input.domain.labels.taskNoun}명을 입력해 주세요.`);
  }
  if (!input.planStart || !input.planEnd) {
    throw new Error("계획 시작일과 종료일을 입력해 주세요.");
  }
  if (input.planEnd < input.planStart) {
    throw new Error("종료일은 시작일보다 같거나 뒤여야 합니다.");
  }
}

export async function createConstructionTask(input: ConstructionTaskInput): Promise<string> {
  await ensureConstructionEditor();
  validateTaskInput(input);
  const supabase = createBrowserSupabase();
  const { domain } = input;

  const { data: lastRow } = await supabase
    .from(domain.tasksTable)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = toNumber((lastRow as { sort_order?: unknown } | null)?.sort_order) + 1;

  const { data, error } = await supabase
    .from(domain.tasksTable)
    .insert({
      ...taskWritePayload(input),
      project_id: input.projectId,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(`${domain.labels.taskNoun} 등록 실패: ${error.message}`);
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") {
    throw new Error(`${domain.labels.taskNoun} ID를 확인하지 못했습니다.`);
  }
  return id;
}

export async function updateConstructionTask(
  input: ConstructionTaskInput & { id: string }
): Promise<void> {
  await ensureConstructionEditor();
  validateTaskInput(input);
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from(input.domain.tasksTable)
    .update(taskWritePayload(input))
    .eq("id", input.id);
  if (error) throw new Error(`${input.domain.labels.taskNoun} 수정 실패: ${error.message}`);
}

export async function deleteConstructionTask(input: {
  domain: ConstructionDomain;
  taskId: string;
}): Promise<void> {
  await ensureConstructionEditor();
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from(input.domain.tasksTable)
    .delete()
    .eq("id", input.taskId);
  if (error) throw new Error(`${input.domain.labels.taskNoun} 삭제 실패: ${error.message}`);
}

/** 주요공사(일정) 단위 증빙 첨부 — 주차 선택 없이 항목에 바로 붙는다. */
export async function uploadConstructionTaskEvidence(input: {
  domain: ConstructionDomain;
  taskId: string;
  files: File[];
  existingUrls: string[];
  existingOriginalFilenames: string[];
}): Promise<void> {
  await ensureConstructionEditor();
  if (!input.files.length) return;
  const supabase = createBrowserSupabase();
  const storageTargetId = input.taskId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!storageTargetId) {
    throw new Error(`${input.domain.labels.taskNoun} 정보를 확인하지 못했습니다.`);
  }

  const uploadedPaths: string[] = [];
  const uploadedNames: string[] = [];
  for (const file of input.files) {
    const uploaded = await uploadEvidenceFile(storageTargetId, file);
    uploadedPaths.push(uploaded.fullPath);
    uploadedNames.push(file.name);
  }

  const evidenceUrls = [...input.existingUrls, ...uploadedPaths];
  const evidenceOriginalFilenames = [
    ...input.existingOriginalFilenames,
    ...uploadedNames,
  ];

  const { error } = await supabase
    .from(input.domain.tasksTable)
    .update({
      evidence_urls: evidenceUrls.length ? evidenceUrls : null,
      evidence_original_filenames: evidenceOriginalFilenames.length
        ? evidenceOriginalFilenames
        : null,
    })
    .eq("id", input.taskId);
  if (error) throw new Error(`증빙 파일 저장 실패: ${error.message}`);
}

export async function removeConstructionTaskEvidence(input: {
  domain: ConstructionDomain;
  taskId: string;
  index: number;
  existingUrls: string[];
  existingOriginalFilenames: string[];
}): Promise<void> {
  await ensureConstructionEditor();
  const supabase = createBrowserSupabase();
  const target = input.existingUrls[input.index];
  const evidenceUrls = input.existingUrls.filter((_, i) => i !== input.index);
  const evidenceOriginalFilenames = input.existingOriginalFilenames.filter(
    (_, i) => i !== input.index
  );

  const { error } = await supabase
    .from(input.domain.tasksTable)
    .update({
      evidence_urls: evidenceUrls.length ? evidenceUrls : null,
      evidence_original_filenames: evidenceOriginalFilenames.length
        ? evidenceOriginalFilenames
        : null,
    })
    .eq("id", input.taskId);
  if (error) throw new Error(`증빙 파일 삭제 실패: ${error.message}`);

  const storagePath = target ? evidencePathFromStoredValue(target) : null;
  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from("kpi-evidence")
      .remove([storagePath]);
    if (storageError && process.env.NODE_ENV === "development") {
      console.warn("[construction] 증빙 Storage 삭제 실패(무시):", storageError.message);
    }
  }
}

/** 주간 실적 저장 — 도메인별 weekly 테이블에 upsert */
export async function upsertConstructionWeekly(input: {
  domain: ConstructionDomain;
  taskId: string;
  year: number;
  weekKey: string;
  achievementRate: number;
  description: string;
  evidenceUrls?: string[];
  evidenceOriginalFilenames?: string[];
}): Promise<{ id: string }> {
  await ensureConstructionEditor();
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const payload: Record<string, unknown> = {
    task_id: input.taskId,
    year: input.year,
    week_key: input.weekKey,
    achievement_rate: clampPercent(input.achievementRate),
    description: input.description.trim() || null,
    updated_by: session?.user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.evidenceUrls !== undefined) {
    const urls = input.evidenceUrls.map((v) => v.trim()).filter(Boolean);
    payload.evidence_url = urls[0] ?? null;
    payload.evidence_urls = urls.length ? urls : null;
  }
  if (input.evidenceOriginalFilenames !== undefined) {
    payload.evidence_original_filenames = input.evidenceOriginalFilenames.length
      ? input.evidenceOriginalFilenames
      : null;
  }

  const { data, error } = await supabase
    .from(input.domain.weeklyTable)
    .upsert(payload, { onConflict: "task_id,year,week_key" })
    .select("id")
    .single();
  if (error) throw new Error(`주간 실적 저장 실패: ${error.message}`);
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new Error("주간 실적 ID를 확인하지 못했습니다.");
  return { id };
}

export async function updateConstructionWeeklyEvidence(input: {
  domain: ConstructionDomain;
  weeklyId: string;
  evidenceUrls: string[];
  evidenceOriginalFilenames: string[];
}): Promise<void> {
  await ensureConstructionEditor();
  const supabase = createBrowserSupabase();
  const urls = input.evidenceUrls.map((v) => v.trim()).filter(Boolean);
  const { error } = await supabase
    .from(input.domain.weeklyTable)
    .update({
      evidence_url: urls[0] ?? null,
      evidence_urls: urls.length ? urls : null,
      evidence_original_filenames: input.evidenceOriginalFilenames.length
        ? input.evidenceOriginalFilenames
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.weeklyId);
  if (error) throw new Error(`증빙 URL 저장 실패: ${error.message}`);
}

/** 주간 실적 증빙 업로드 — 저장 경로는 실적 레코드 ID 기준이라 도메인과 무관 */
export async function uploadConstructionWeeklyEvidenceFiles(
  weeklyId: string,
  files: File[]
): Promise<{ paths: string[]; originalFilenames: string[] }> {
  if (!files.length) return { paths: [], originalFilenames: [] };
  const storageTargetId = weeklyId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!storageTargetId) {
    throw new Error("실적 정보 생성 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  const paths: string[] = [];
  const originalFilenames: string[] = [];
  for (const file of files) {
    const uploaded = await uploadEvidenceFile(storageTargetId, file);
    paths.push(uploaded.fullPath);
    originalFilenames.push(file.name);
  }
  return { paths, originalFilenames };
}

export function constructionEvidenceDisplayName(
  storedValue: string,
  originalFilenames: string[],
  index: number
): string {
  const fromMeta = originalFilenames[index]?.trim();
  if (fromMeta) return fromMeta;
  return evidenceFileNameFromStoredValue(storedValue);
}

export function constructionEvidenceStoragePath(storedValue: string): string | null {
  return evidencePathFromStoredValue(storedValue);
}
