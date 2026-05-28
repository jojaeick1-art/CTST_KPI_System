import { createBrowserSupabase } from "@/src/lib/supabase";
import { canEditInvestmentDashboard } from "@/src/lib/rbac";
import { requestEvidenceSignedUrl } from "@/src/lib/evidence-download-requests";

const EVIDENCE_BUCKET = process.env.NEXT_PUBLIC_KPI_EVIDENCE_BUCKET || "kpi-evidence";
const EVIDENCE_PREFIX = "investment-evidence";

export type InvestmentProject = {
  id: string;
  sortOrder: number;
  itemName: string;
  amountKKrw: number | null;
  deptName: string | null;
  ownerName: string | null;
  detail: string | null;
  progressRate: number | null;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentStageColumn = {
  id: string;
  projectId: string;
  sortOrder: number;
  name: string;
};

export type InvestmentStageEntry = {
  id: string;
  projectId: string;
  stageColumnId: string;
  planDate: string | null;
  actualDate: string | null;
  evidenceStoragePath: string | null;
  evidenceFileName: string | null;
  updatedAt: string;
};

export type InvestmentDashboardBundle = {
  projects: InvestmentProject[];
  stageColumns: InvestmentStageColumn[];
  entries: InvestmentStageEntry[];
};

function normalizeInvestmentDbError(errorLike: unknown): Error {
  const message =
    errorLike instanceof Error
      ? errorLike.message
      : typeof errorLike === "string"
        ? errorLike
        : "투자 데이터 처리 중 오류가 발생했습니다.";

  if (
    message.includes("Could not find the table") ||
    message.includes("does not exist")
  ) {
    return new Error(
      "투자 대시보드 테이블이 아직 생성되지 않았습니다. Supabase 마이그레이션을 먼저 적용해 주세요."
    );
  }
  return new Error(message);
}

function parseRole(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const role = (input as { role?: unknown }).role;
  return typeof role === "string" ? role : null;
}

async function assertInvestmentEditor(): Promise<string> {
  const supabase = createBrowserSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("로그인 정보를 확인할 수 없습니다.");
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("권한 정보를 확인하지 못했습니다.");
  if (!canEditInvestmentDashboard(parseRole(profile))) {
    throw new Error("투자 심의 건 편집 권한이 없습니다.");
  }
  return user.id;
}

export async function listInvestmentDashboardBundle(): Promise<InvestmentDashboardBundle> {
  const supabase = createBrowserSupabase();
  try {
    const projectQueryWithProgress = supabase
      .from("investment_projects")
      .select(
        "id, sort_order, item_name, amount_k_krw, dept_name, owner_name, detail, progress_rate, created_at, updated_at"
      )
      .order("sort_order", { ascending: true });

    const projectsResultWithProgress = await projectQueryWithProgress;
    let projectsRaw: Array<Record<string, unknown>> | null = null;
    let projectError = projectsResultWithProgress.error;
    if (projectError?.message?.includes("progress_rate")) {
      const projectsResultFallback = await supabase
        .from("investment_projects")
        .select(
          "id, sort_order, item_name, amount_k_krw, dept_name, owner_name, detail, created_at, updated_at"
        )
        .order("sort_order", { ascending: true });
      projectsRaw = (projectsResultFallback.data ?? []) as Array<Record<string, unknown>>;
      projectError = projectsResultFallback.error;
    } else {
      projectsRaw = (projectsResultWithProgress.data ?? []) as Array<Record<string, unknown>>;
    }

    const stageQueryWithProject = supabase
      .from("investment_stage_columns")
      .select("id, project_id, sort_order, name")
      .order("sort_order", { ascending: true });
    const stageResultWithProject = await stageQueryWithProject;
    let stageColumnsRaw: Array<Record<string, unknown>> | null = null;
    let stageError = stageResultWithProject.error;
    if (stageError?.message?.includes("project_id")) {
      const stageResultFallback = await supabase
        .from("investment_stage_columns")
        .select("id, sort_order, name")
        .order("sort_order", { ascending: true });
      stageColumnsRaw = (stageResultFallback.data ?? []) as Array<Record<string, unknown>>;
      stageError = stageResultFallback.error;
    } else {
      stageColumnsRaw = (stageResultWithProject.data ?? []) as Array<Record<string, unknown>>;
    }

    const entryResult = await supabase
      .from("investment_stage_entries")
      .select(
        "id, project_id, stage_column_id, plan_date, actual_date, evidence_storage_path, evidence_file_name, updated_at"
      );

    const entries = entryResult.data;
    const entryError = entryResult.error;

    if (projectError) throw projectError;
    if (stageError) throw stageError;
    if (entryError) throw entryError;

    const projects = projectsRaw ?? [];
    const stageColumns = stageColumnsRaw ?? [];

    const firstProjectId =
      typeof projects[0]?.id === "string" ? (projects[0].id as string) : null;

    return {
      projects: projects.map((r) => ({
        id: r.id as string,
        sortOrder: Number(r.sort_order ?? 0),
        itemName: (r.item_name as string) || "",
        amountKKrw: r.amount_k_krw === null ? null : Number(r.amount_k_krw),
        deptName: (r.dept_name as string | null) ?? null,
        ownerName: (r.owner_name as string | null) ?? null,
        detail: (r.detail as string | null) ?? null,
        progressRate:
          r.progress_rate == null ? null : Number(r.progress_rate as number | string),
        createdAt: (r.created_at as string) || "",
        updatedAt: (r.updated_at as string) || "",
      })),
      stageColumns: stageColumns.map((r) => ({
        id: r.id as string,
        projectId:
          typeof r.project_id === "string"
            ? (r.project_id as string)
            : firstProjectId ?? "",
        sortOrder: Number(r.sort_order ?? 0),
        name: (r.name as string) || "",
      })),
      entries: (entries || []).map((r) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        stageColumnId: r.stage_column_id as string,
        planDate: (r.plan_date as string | null) ?? null,
        actualDate: (r.actual_date as string | null) ?? null,
        evidenceStoragePath: (r.evidence_storage_path as string | null) ?? null,
        evidenceFileName: (r.evidence_file_name as string | null) ?? null,
        updatedAt: (r.updated_at as string) || "",
      })),
    };
  } catch (e) {
    throw normalizeInvestmentDbError(e);
  }
}

export async function createInvestmentProject(input?: {
  itemName?: string;
  amountKKrw?: number | null;
  deptName?: string | null;
  ownerName?: string | null;
  detail?: string | null;
  progressRate?: number | null;
  stageTemplates?: Array<{ name: string; planDate?: string | null; actualDate?: string | null }>;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const userId = await assertInvestmentEditor();
  const { data: currentRows, error: maxError } = await supabase
    .from("investment_projects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxError) throw new Error(maxError.message);
  const nextSortOrder = Number(currentRows?.[0]?.sort_order ?? 0) + 1;

  const { data: inserted, error } = await supabase
    .from("investment_projects")
    .insert({
    sort_order: nextSortOrder,
    item_name: input?.itemName?.trim() || "신규 투자 항목",
    amount_k_krw: input?.amountKKrw ?? null,
    dept_name: input?.deptName?.trim() || null,
    owner_name: input?.ownerName?.trim() || null,
    detail: input?.detail?.trim() || null,
    progress_rate:
      input?.progressRate == null
        ? null
        : Math.max(0, Math.min(100, Number(input.progressRate))),
    created_by: userId,
    updated_by: userId,
  })
    .select("id")
    .single();
  if (error || !inserted?.id) throw normalizeInvestmentDbError(error);

  const stageTemplates =
    input?.stageTemplates?.map((v) => ({
      name: v.name.trim(),
      planDate: v.planDate ?? null,
      actualDate: v.actualDate ?? null,
    })).filter((v) => v.name.length > 0) ??
    [
      { name: "PO", planDate: null, actualDate: null },
      { name: "입고", planDate: null, actualDate: null },
      { name: "양산", planDate: null, actualDate: null },
      { name: "적용", planDate: null, actualDate: null },
      { name: "완료", planDate: null, actualDate: null },
    ];

  const insertedStages = await Promise.all(
    stageTemplates.map(async (stage, idx) => {
      const { data, error: stageError } = await supabase
        .from("investment_stage_columns")
        .insert({
          project_id: inserted.id,
          sort_order: idx + 1,
          name: stage.name,
        })
        .select("id")
        .single();
      if (stageError || !data?.id) throw normalizeInvestmentDbError(stageError);
      return { id: data.id as string, ...stage };
    })
  );

  await Promise.all(
    insertedStages.map((stage) =>
      supabase.from("investment_stage_entries").upsert(
        {
          project_id: inserted.id,
          stage_column_id: stage.id,
          plan_date: stage.planDate,
          actual_date: stage.actualDate,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,stage_column_id" }
      )
    )
  );
}

export async function updateInvestmentProject(input: {
  id: string;
  itemName: string;
  amountKKrw: number | null;
  deptName: string | null;
  ownerName: string | null;
  detail: string | null;
  progressRate?: number | null;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const userId = await assertInvestmentEditor();
  const { error } = await supabase
    .from("investment_projects")
    .update({
      item_name: input.itemName.trim(),
      amount_k_krw: input.amountKKrw,
      dept_name: input.deptName?.trim() || null,
      owner_name: input.ownerName?.trim() || null,
      detail: input.detail?.trim() || null,
      progress_rate:
        input.progressRate == null
          ? null
          : Math.max(0, Math.min(100, Number(input.progressRate))),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw normalizeInvestmentDbError(error);
}

export async function deleteInvestmentProject(projectId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  await assertInvestmentEditor();
  const { error } = await supabase.from("investment_projects").delete().eq("id", projectId);
  if (error) throw normalizeInvestmentDbError(error);
}

export async function createInvestmentStageColumn(projectId: string, name: string): Promise<string> {
  const supabase = createBrowserSupabase();
  await assertInvestmentEditor();
  const { data: rows, error: maxError } = await supabase
    .from("investment_stage_columns")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxError) throw normalizeInvestmentDbError(maxError);
  const nextSortOrder = Number(rows?.[0]?.sort_order ?? 0) + 1;
  const { data, error } = await supabase
    .from("investment_stage_columns")
    .insert({
      project_id: projectId,
      name: name.trim(),
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw normalizeInvestmentDbError(error);
  return data.id as string;
}

export async function renameInvestmentStageColumn(
  stageColumnId: string,
  name: string
): Promise<void> {
  const supabase = createBrowserSupabase();
  await assertInvestmentEditor();
  const { error } = await supabase
    .from("investment_stage_columns")
    .update({ name: name.trim() })
    .eq("id", stageColumnId);
  if (error) throw normalizeInvestmentDbError(error);
}

export async function deleteInvestmentStageColumn(stageColumnId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  await assertInvestmentEditor();
  const { error } = await supabase
    .from("investment_stage_columns")
    .delete()
    .eq("id", stageColumnId);
  if (error) throw normalizeInvestmentDbError(error);
}

export async function reorderInvestmentStageColumns(
  projectId: string,
  stageColumnIds: string[]
): Promise<void> {
  const supabase = createBrowserSupabase();
  await assertInvestmentEditor();
  await Promise.all(
    stageColumnIds.map((id, idx) =>
      supabase
        .from("investment_stage_columns")
        .update({ sort_order: idx + 1 })
        .eq("project_id", projectId)
        .eq("id", id)
    )
  );
}

export async function upsertInvestmentStageEntry(input: {
  projectId: string;
  stageColumnId: string;
  planDate: string | null;
  actualDate: string | null;
  evidenceStoragePath?: string | null;
  evidenceFileName?: string | null;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const userId = await assertInvestmentEditor();
  const { error } = await supabase.from("investment_stage_entries").upsert(
    {
      project_id: input.projectId,
      stage_column_id: input.stageColumnId,
      plan_date: input.planDate,
      actual_date: input.actualDate,
      evidence_storage_path: input.evidenceStoragePath ?? null,
      evidence_file_name: input.evidenceFileName ?? null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,stage_column_id" }
  );
  if (error) throw normalizeInvestmentDbError(error);
}

export async function uploadInvestmentEvidenceFile(input: {
  projectId: string;
  stageColumnId: string;
  file: File;
}): Promise<{ storagePath: string; fileName: string }> {
  const supabase = createBrowserSupabase();
  await assertInvestmentEditor();
  const fileName = input.file.name;
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  const stamped = `${Date.now()}${ext}`;
  const storagePath = `${EVIDENCE_PREFIX}/${input.projectId}/${input.stageColumnId}/${stamped}`;
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(storagePath, input.file, { upsert: true });
  if (error) throw normalizeInvestmentDbError(error);
  return { storagePath, fileName };
}

export async function getInvestmentEvidenceSignedUrl(
  storagePath: string
): Promise<string> {
  const cleanPath = storagePath.trim().replace(/^\/+/, "");
  if (!cleanPath) {
    throw new Error("다운로드할 파일 경로가 없습니다.");
  }
  return requestEvidenceSignedUrl(cleanPath);
}

export async function deleteInvestmentEvidenceFile(storagePath: string): Promise<void> {
  const supabase = createBrowserSupabase();
  await assertInvestmentEditor();
  const cleanPath = storagePath.trim().replace(/^\/+/, "");
  if (!cleanPath) return;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove([cleanPath]);
  if (error) throw normalizeInvestmentDbError(error);
}
