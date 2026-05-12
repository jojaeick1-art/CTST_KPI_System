import { createBrowserSupabase } from "@/src/lib/supabase";
import { canEditCampus2Schedule } from "@/src/lib/rbac";
import {
  CURRENT_KPI_YEAR,
  evidenceFileNameFromStoredValue,
  evidencePathFromStoredValue,
  uploadEvidenceFile,
} from "@/src/lib/kpi-queries";

export type Campus2WeekKey = string;

export type Campus2WeekColumn = {
  key: Campus2WeekKey;
  month: number;
  weekInMonth: number;
  label: string;
  start: Date;
  end: Date;
};

export type Campus2ScheduleTask = {
  id: string;
  sortOrder: number;
  title: string;
  planStart: string;
  planEnd: string;
};

export type Campus2WeeklyPerformance = {
  id: string;
  taskId: string;
  year: number;
  weekKey: Campus2WeekKey;
  achievementRate: number;
  description: string | null;
  evidenceUrl: string | null;
  evidenceUrls: string[];
  evidenceOriginalFilenames: string[];
  updatedAt: string | null;
};

export type Campus2ScheduleBundle = {
  year: number;
  tasks: Campus2ScheduleTask[];
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  overallAchievement: number;
  overallAchievementEditable: boolean;
};

const DEFAULT_TASKS: Omit<Campus2ScheduleTask, "id">[] = [
  {
    sortOrder: 1,
    title: "구매 및 제작 자재 준비",
    planStart: "2026-04-18",
    planEnd: "2026-05-09",
  },
  {
    sortOrder: 2,
    title: "SMT Line 공사 우선 진행",
    planStart: "2026-04-18",
    planEnd: "2026-05-26",
  },
  {
    sortOrder: 3,
    title: "신형 SMT Line Set-up",
    planStart: "2026-05-27",
    planEnd: "2026-06-05",
  },
  {
    sortOrder: 4,
    title: "2층 SMT Line 이전 및 Set-up",
    planStart: "2026-06-08",
    planEnd: "2026-06-13",
  },
  {
    sortOrder: 5,
    title: "1층 잔여 구역 공사",
    planStart: "2026-05-27",
    planEnd: "2026-06-07",
  },
  {
    sortOrder: 6,
    title: "2층 Advan T5588 이전 및 Set-up",
    planStart: "2026-06-08",
    planEnd: "2026-06-14",
  },
  {
    sortOrder: 7,
    title: "2층 Auto P-RDT, LPDDR, Laser M/K 설비 이전 및 Set-up",
    planStart: "2026-06-06",
    planEnd: "2026-06-12",
  },
  {
    sortOrder: 8,
    title: "2층 Layout, 전기, 공조, 공압 공사",
    planStart: "2026-06-09",
    planEnd: "2026-06-12",
  },
  {
    sortOrder: 9,
    title: "1Camps Die Tester 36Para 이전 및 Set-up",
    planStart: "2026-06-13",
    planEnd: "2026-06-20",
  },
];

function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map((part) => Number(part));
  return new Date(y, m - 1, d);
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

async function ensureCampus2ScheduleEditor(): Promise<void> {
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
    throw new Error("공사 일정 실적 등록/수정은 그룹장·팀장·관리자만 할 수 있습니다.");
  }
}

export function campus2WeekKey(year: number, month: number, weekInMonth: number): Campus2WeekKey {
  return `${year}-${String(month).padStart(2, "0")}-W${weekInMonth}`;
}

function campus2MondayBasedWeekInMonth(year: number, month: number, day: number): number {
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  return Math.floor((day - 1 + firstDow) / 7) + 1;
}

function campus2MaxWeekInMonth(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  return campus2MondayBasedWeekInMonth(year, month, lastDay);
}

function campus2WeekDayRange(
  year: number,
  month: number,
  weekInMonth: number
): { dayStart: number; dayEnd: number } | null {
  const lastDay = new Date(year, month, 0).getDate();
  let dayStart = 0;
  let dayEnd = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    if (campus2MondayBasedWeekInMonth(year, month, day) !== weekInMonth) continue;
    if (!dayStart) dayStart = day;
    dayEnd = day;
  }
  if (!dayStart) return null;
  return { dayStart, dayEnd };
}

export function buildCampus2WeekColumns(
  year: number,
  tasks: Pick<Campus2ScheduleTask, "planStart" | "planEnd">[] = []
): Campus2WeekColumn[] {
  if (!tasks.length) {
    return buildCampus2WeekColumnsForMonthRange(year, 4, 6);
  }

  let min = parseIsoDate(tasks[0]!.planStart);
  let max = endOfDay(parseIsoDate(tasks[0]!.planEnd));
  for (const task of tasks) {
    const start = parseIsoDate(task.planStart);
    const end = endOfDay(parseIsoDate(task.planEnd));
    if (start < min) min = start;
    if (end > max) max = end;
  }

  const columns: Campus2WeekColumn[] = [];
  const startMonth = min.getMonth() + 1;
  const endMonth = max.getMonth() + 1;
  for (let month = startMonth; month <= endMonth; month += 1) {
    const maxWeek = campus2MaxWeekInMonth(year, month);
    for (let weekInMonth = 1; weekInMonth <= maxWeek; weekInMonth += 1) {
      const range = campus2WeekDayRange(year, month, weekInMonth);
      if (!range) continue;
      const start = new Date(year, month - 1, range.dayStart);
      const end = endOfDay(new Date(year, month - 1, range.dayEnd));
      if (end < min || start > max) continue;
      columns.push({
        key: campus2WeekKey(year, month, weekInMonth),
        month,
        weekInMonth,
        label: `${month}월 ${weekInMonth}주`,
        start,
        end,
      });
    }
  }
  return columns;
}

function buildCampus2WeekColumnsForMonthRange(
  year: number,
  startMonth: number,
  endMonth: number
): Campus2WeekColumn[] {
  const columns: Campus2WeekColumn[] = [];
  for (let month = startMonth; month <= endMonth; month += 1) {
    const maxWeek = campus2MaxWeekInMonth(year, month);
    for (let weekInMonth = 1; weekInMonth <= maxWeek; weekInMonth += 1) {
      const range = campus2WeekDayRange(year, month, weekInMonth);
      if (!range) continue;
      columns.push({
        key: campus2WeekKey(year, month, weekInMonth),
        month,
        weekInMonth,
        label: `${month}월 ${weekInMonth}주`,
        start: new Date(year, month - 1, range.dayStart),
        end: endOfDay(new Date(year, month - 1, range.dayEnd)),
      });
    }
  }
  return columns;
}

export function formatCampus2PlanRange(planStart: string, planEnd: string): string {
  const start = parseIsoDate(planStart);
  const end = parseIsoDate(planEnd);
  return `${start.getMonth() + 1}/${start.getDate()}~${end.getMonth() + 1}/${end.getDate()}`;
}

export function campus2TaskBarSpan(
  task: Pick<Campus2ScheduleTask, "planStart" | "planEnd">,
  columns: Campus2WeekColumn[]
): { startIndex: number; span: number } | null {
  if (!columns.length) return null;
  const taskStart = parseIsoDate(task.planStart);
  const taskEnd = endOfDay(parseIsoDate(task.planEnd));
  const indexes = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.end >= taskStart && column.start <= taskEnd)
    .map(({ index }) => index);
  if (!indexes.length) return null;
  const startIndex = indexes[0]!;
  const endIndex = indexes[indexes.length - 1]!;
  return { startIndex, span: endIndex - startIndex + 1 };
}

export function campus2CurrentWeekKey(
  columns: Campus2WeekColumn[],
  now = new Date()
): Campus2WeekKey | null {
  const match = columns.find((column) => now >= column.start && now <= column.end);
  return match?.key ?? null;
}

function fallbackTasks(): Campus2ScheduleTask[] {
  return DEFAULT_TASKS.map((task, index) => ({
    id: `fallback-${index + 1}`,
    ...task,
  }));
}

function normalizeTaskRow(row: Record<string, unknown>): Campus2ScheduleTask | null {
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

function normalizeWeeklyRow(row: Record<string, unknown>): Campus2WeeklyPerformance | null {
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
    evidenceOriginalFilenames: normalizeStringArray(row.evidence_original_filenames),
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

export async function fetchCampus2ScheduleBundle(
  year: number = CURRENT_KPI_YEAR
): Promise<Campus2ScheduleBundle> {
  const supabase = createBrowserSupabase();
  const fallback = fallbackTasks();

  const { data: taskRows, error: taskError } = await supabase
    .from("campus2_schedule_tasks")
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
    .filter((row): row is Campus2ScheduleTask => row !== null);

  const resolvedTasks = tasks.length ? tasks : fallback;
  const weekColumns = buildCampus2WeekColumns(year, resolvedTasks);

  const { data: weeklyRows, error: weeklyError } = await supabase
    .from("campus2_schedule_weekly")
    .select(
      "id, task_id, year, week_key, achievement_rate, description, evidence_url, evidence_urls, evidence_original_filenames, updated_at"
    )
    .eq("year", year);

  const weekly = weeklyError
    ? []
    : (weeklyRows ?? [])
        .map((row) => normalizeWeeklyRow(row as Record<string, unknown>))
        .filter((row): row is Campus2WeeklyPerformance => row !== null);

  const { data: summaryRow } = await supabase
    .from("campus2_schedule_summary")
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

export async function upsertCampus2WeeklyPerformance(input: {
  taskId: string;
  year: number;
  weekKey: Campus2WeekKey;
  achievementRate: number;
  description: string;
  evidenceUrl?: string | null;
  evidenceUrls?: string[];
  evidenceOriginalFilenames?: string[];
}): Promise<{ id: string }> {
  await ensureCampus2ScheduleEditor();
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
    .from("campus2_schedule_weekly")
    .upsert(payload, { onConflict: "task_id,year,week_key" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`2Campus 주간 실적 저장 실패: ${error.message}`);
  }

  const id =
    data && typeof (data as { id?: unknown }).id === "string"
      ? (data as { id: string }).id
      : "";
  if (!id) {
    throw new Error("2Campus 주간 실적 ID를 확인하지 못했습니다.");
  }
  return { id };
}

export async function upsertCampus2OverallAchievement(input: {
  year: number;
  achievementRate: number;
}): Promise<void> {
  await ensureCampus2ScheduleEditor();
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  const { error } = await supabase.from("campus2_schedule_summary").upsert(
    {
      year: input.year,
      overall_achievement_rate: clampPercent(input.achievementRate),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "year" }
  );
  if (error) {
    throw new Error(`2Campus 종합 달성률 저장 실패: ${error.message}`);
  }
}

export async function updateCampus2WeeklyEvidence(input: {
  weeklyId: string;
  evidenceUrls: string[];
  evidenceOriginalFilenames: string[];
}): Promise<void> {
  await ensureCampus2ScheduleEditor();
  const supabase = createBrowserSupabase();
  const evidenceUrls = input.evidenceUrls.map((value) => value.trim()).filter(Boolean);
  const { error } = await supabase
    .from("campus2_schedule_weekly")
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
    throw new Error(`2Campus 증빙 URL 저장 실패: ${error.message}`);
  }
}

export function mergeCampus2WeeklyEvidenceLists(input: {
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

export async function uploadCampus2EvidenceFiles(
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

export function campus2EvidenceDisplayName(
  storedValue: string,
  originalFilenames: string[],
  index: number
): string {
  const fromMeta = originalFilenames[index]?.trim();
  if (fromMeta) return fromMeta;
  return evidenceFileNameFromStoredValue(storedValue);
}

export function campus2EvidenceStoragePath(storedValue: string): string | null {
  return evidencePathFromStoredValue(storedValue);
}

export function campus2WeekLabelFromKey(
  weekKey: Campus2WeekKey,
  columns: Campus2WeekColumn[]
): string {
  const match = columns.find((column) => column.key === weekKey);
  return match?.label ?? weekKey;
}

export function campus2WeeksForTask(
  task: Pick<Campus2ScheduleTask, "planStart" | "planEnd">,
  columns: Campus2WeekColumn[]
): Campus2WeekColumn[] {
  const taskStart = parseIsoDate(task.planStart);
  const taskEnd = endOfDay(parseIsoDate(task.planEnd));
  return columns.filter((column) => column.end >= taskStart && column.start <= taskEnd);
}

export function campus2DateRangeLabel(planStart: string, planEnd: string): string {
  return `${formatIsoDate(parseIsoDate(planStart))} ~ ${formatIsoDate(parseIsoDate(planEnd))}`;
}
