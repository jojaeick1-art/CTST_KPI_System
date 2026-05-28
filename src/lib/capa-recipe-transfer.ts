import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  parseCapaRecipeJson,
  serializeCapaRecipe,
} from "@/src/lib/capa/recipe-normalize";
import { CAPA_RECIPE_SCHEMA_VERSION } from "@/src/types/capa-recipe";
import type { CapaRecipe } from "@/src/types/capa-recipe";
import type {
  CapaRecipeTransferRow,
  CapaRecipeTransferStatus,
  CapaTransferKind,
} from "@/src/types/capa-file-bridge";

const TRANSFER_TIMEOUT_MS = 60_000;
const TRANSFER_POLL_MS = 1_000;
const BRIDGE_BUCKET =
  process.env.NEXT_PUBLIC_CAPA_RECIPE_BUCKET?.trim() ||
  process.env.NEXT_PUBLIC_CAPA_BRIDGE_BUCKET?.trim() ||
  "capa-recipes";
const LEGACY_BRIDGE_BUCKET =
  process.env.NEXT_PUBLIC_CAPA_RECIPE_LEGACY_BUCKET?.trim() || "kpi-evidence";

const SHARED_RECIPES_FOLDER = "capa-bridge/shared/recipes";

export type CapaRecipeCatalogItem = {
  storagePath: string;
  recipeId: string;
  name: string;
  processGroup: string;
  createdAt: string;
  updatedAt: string;
  processCount: number | null;
  createdByName?: string | null;
};

type CapaRecipeFileRow = {
  id: string;
  name: string;
  process_group: string | null;
  storage_path: string;
  process_count: number;
  created_at: string;
  updated_at: string;
  created_by_profile?:
    | { full_name: string | null; username: string | null }
    | { full_name: string | null; username: string | null }[]
    | null;
};

export type CapaProcessGroup = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  createdByName: string | null;
};

type CapaProcessGroupRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  created_by_profile?:
    | { full_name: string | null; username: string | null }
    | { full_name: string | null; username: string | null }[]
    | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toTransferError(message: string): Error {
  const lower = message.toLowerCase();
  if (
    lower.includes("capa_recipe") &&
    (lower.includes("schema cache") ||
      lower.includes("does not exist") ||
      lower.includes("could not find"))
  ) {
    return new Error(
      "Supabase에 CAPA 레시피 공유 테이블이 없습니다. " +
        "supabase/migrations/20260519120000_capa_shared_recipe_files.sql 을 적용한 뒤 다시 시도하세요."
    );
  }
  return new Error(message);
}

function normalizeRow(row: unknown): CapaRecipeTransferRow {
  const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  return {
    id: typeof rec.id === "string" ? rec.id : String(rec.id ?? ""),
    kind: (rec.kind as CapaTransferKind) ?? "recipe_load",
    storage_path:
      typeof rec.storage_path === "string" ? rec.storage_path : null,
    status: (rec.status as CapaRecipeTransferStatus) ?? "pending",
    signed_url: typeof rec.signed_url === "string" ? rec.signed_url : null,
    error_message:
      typeof rec.error_message === "string" ? rec.error_message : null,
    created_at: typeof rec.created_at === "string" ? rec.created_at : "",
  };
}

function isTransferReady(row: CapaRecipeTransferRow): boolean {
  const status = row.status?.toLowerCase() ?? "";
  if (status === "failed" || status === "error") {
    throw new Error(row.error_message?.trim() || "레시피 전송 요청이 실패했습니다.");
  }
  return status === "ready";
}

function assertReadySignedUrl(row: CapaRecipeTransferRow): string | null {
  if (!isTransferReady(row)) return null;
  const url = row.signed_url?.trim() ?? "";
  return url || null;
}

function legacyRecipesFolder(uid: string): string {
  return `capa-bridge/${uid}/recipes`;
}

function sharedRecipeStoragePath(recipeId: string): string {
  return `${SHARED_RECIPES_FOLDER}/${recipeId}.json`;
}

function displayNameFromProfile(
  profile?: { full_name: string | null; username: string | null } | null
): string | null {
  if (!profile) return null;
  const full = profile.full_name?.trim();
  if (full) return full;
  const user = profile.username?.trim();
  return user || null;
}

function normalizeCreatedByProfile(
  profile:
    | { full_name: string | null; username: string | null }
    | { full_name: string | null; username: string | null }[]
    | null
    | undefined
): { full_name: string | null; username: string | null } | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile;
}

async function getSessionUserId(): Promise<string> {
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return uid;
}

async function pollTransfer(
  supabase: ReturnType<typeof createBrowserSupabase>,
  id: string,
  kind: CapaTransferKind
): Promise<CapaRecipeTransferRow> {
  const started = Date.now();
  while (Date.now() - started < TRANSFER_TIMEOUT_MS) {
    await sleep(TRANSFER_POLL_MS);
    const { data, error } = await supabase
      .from("capa_recipe_transfers")
      .select("id,kind,storage_path,status,signed_url,error_message,created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw toTransferError(error.message);
    const row = normalizeRow(data);
    if (!isTransferReady(row)) continue;
    if (kind === "recipe_save") return row;
    const url = assertReadySignedUrl(row);
    if (url) return { ...row, signed_url: url };
    if (row.storage_path?.trim()) return row;
  }
  throw new Error("레시피 전송 대기 시간이 초과되었습니다. 위젯 실행 여부를 확인하세요.");
}

async function insertCapaTransfer(
  kind: CapaTransferKind,
  storagePath: string
): Promise<CapaRecipeTransferRow> {
  const supabase = createBrowserSupabase();
  const { data: inserted, error } = await supabase
    .from("capa_recipe_transfers")
    .insert({ kind, storage_path: storagePath, status: "pending" })
    .select("id,kind,storage_path,status,signed_url,error_message,created_at")
    .single();
  if (error) throw toTransferError(error.message);
  return normalizeRow(inserted);
}

async function uploadRecipeBlob(
  path: string,
  json: string,
  recipe: CapaRecipe
): Promise<string> {
  const supabase = createBrowserSupabase();
  const blob = new Blob([json], { type: "application/json" });
  const { error } = await supabase.storage.from(BRIDGE_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: "application/json",
    metadata: {
      recipe_name: recipe.meta.name,
      process_count: String(recipe.processes.length),
    },
  });
  if (error) throw new Error(`스토리지 업로드 실패: ${error.message}`);
  return path;
}

async function downloadRecipeBlobFromBucket(
  bucket: string,
  storagePath: string
): Promise<Blob | null> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) return null;
  return data;
}

async function ensureRecipeInDedicatedBucket(storagePath: string): Promise<void> {
  if (BRIDGE_BUCKET === LEGACY_BRIDGE_BUCKET) return;
  const existsInDedicated = await downloadRecipeBlobFromBucket(BRIDGE_BUCKET, storagePath);
  if (existsInDedicated) return;
  const legacyBlob = await downloadRecipeBlobFromBucket(
    LEGACY_BRIDGE_BUCKET,
    storagePath
  );
  if (!legacyBlob) return;
  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage.from(BRIDGE_BUCKET).upload(
    storagePath,
    legacyBlob,
    {
      upsert: true,
      contentType: "application/json",
    }
  );
  if (error) {
    console.warn(
      `CAPA recipe migration skipped (${storagePath}): ${error.message}`
    );
  }
}

async function upsertRecipeCatalogRow(input: {
  recipe: CapaRecipe;
  storagePath: string;
  uid: string;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: existing, error: readErr } = await supabase
    .from("capa_recipe_files")
    .select("id")
    .eq("id", input.recipe.meta.id)
    .maybeSingle();
  if (readErr) throw toTransferError(readErr.message);

  const now = new Date().toISOString();
  const base = {
    id: input.recipe.meta.id,
    name: input.recipe.meta.name,
    process_group: input.recipe.meta.processGroup?.trim() || "SMT",
    storage_path: input.storagePath,
    process_count: input.recipe.processes.length,
    schema_version: input.recipe.schemaVersion ?? CAPA_RECIPE_SCHEMA_VERSION,
    updated_by: input.uid,
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("capa_recipe_files")
      .update(base)
      .eq("id", input.recipe.meta.id);
    if (error) throw toTransferError(error.message);
    return;
  }

  const { error } = await supabase.from("capa_recipe_files").insert({
    ...base,
    created_by: input.uid,
    created_at: now,
  });
  if (error) throw toTransferError(error.message);
}

/** 기존 사용자별 폴더 레시피를 공유 경로·카탈로그로 1회 이전 */
async function migrateLegacyUserRecipes(uid: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const folder = legacyRecipesFolder(uid);
  const { data: files, error } = await supabase.storage
    .from(BRIDGE_BUCKET)
    .list(folder, { limit: 100 });
  if (error) return;

  for (const file of files ?? []) {
    if (!file.name?.toLowerCase().endsWith(".json")) continue;
    const legacyPath = `${folder}/${file.name}`;
    try {
      const { data } = await supabase.storage.from(BRIDGE_BUCKET).download(legacyPath);
      if (!data) continue;
      const recipe = parseCapaRecipeJson(await data.text());
      const sharedPath = sharedRecipeStoragePath(recipe.meta.id);

      const { data: exists } = await supabase
        .from("capa_recipe_files")
        .select("id")
        .eq("id", recipe.meta.id)
        .maybeSingle();

      if (!exists?.id) {
        const payload = serializeCapaRecipe(recipe);
        await uploadRecipeBlob(sharedPath, payload, recipe);
        await upsertRecipeCatalogRow({ recipe, storagePath: sharedPath, uid });
      }
    } catch {
      /* 손상된 파일 등은 건너뜀 */
    }
  }
}

/** recipe_load: 서버 PC backup → Storage (위젯 Realtime) */
async function waitForWidgetCapaTransfer(
  kind: CapaTransferKind,
  storagePath: string
): Promise<void> {
  const supabase = createBrowserSupabase();
  const row = await insertCapaTransfer(kind, storagePath);
  await pollTransfer(supabase, row.id, kind);
}

function rowToCatalogItem(row: CapaRecipeFileRow): CapaRecipeCatalogItem {
  return {
    storagePath: row.storage_path,
    recipeId: row.id,
    name: row.name,
    processGroup: row.process_group?.trim() || "SMT",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processCount: row.process_count,
    createdByName: displayNameFromProfile(
      normalizeCreatedByProfile(row.created_by_profile)
    ),
  };
}

/** 공유 레시피 목록 (조직 전체, 권한 있는 사용자) */
export async function listCapaRecipeCatalog(): Promise<CapaRecipeCatalogItem[]> {
  const supabase = createBrowserSupabase();
  const uid = await getSessionUserId();

  try {
    await migrateLegacyUserRecipes(uid);
  } catch {
    /* 마이그레이션 실패 시 DB 목록만 표시 */
  }

  const { data, error } = await supabase
    .from("capa_recipe_files")
    .select(
      "id, name, process_group, storage_path, process_count, created_at, updated_at, created_by_profile:profiles!capa_recipe_files_created_by_fkey(full_name, username)"
    )
    .order("updated_at", { ascending: false });

  if (error) throw toTransferError(error.message);

  const items = ((data ?? []) as CapaRecipeFileRow[]).map(rowToCatalogItem);
  if (BRIDGE_BUCKET !== LEGACY_BRIDGE_BUCKET) {
    for (const item of items) {
      await ensureRecipeInDedicatedBucket(item.storagePath);
    }
  }
  return items;
}

function toProcessGroup(row: CapaProcessGroupRow): CapaProcessGroup {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    createdByName: displayNameFromProfile(
      normalizeCreatedByProfile(row.created_by_profile)
    ),
  };
}

export async function listCapaProcessGroups(): Promise<CapaProcessGroup[]> {
  const supabase = createBrowserSupabase();
  const withProfile = await supabase
    .from("capa_process_groups")
    .select(
      "id,name,sort_order,created_at,created_by_profile:profiles!capa_process_groups_created_by_fkey(full_name, username)"
    )
    .order("sort_order", { ascending: true });

  if (!withProfile.error) {
    return ((withProfile.data ?? []) as CapaProcessGroupRow[]).map(toProcessGroup);
  }

  // FK/스키마 캐시 반영 전에는 관계 조인이 실패할 수 있어, 기본 목록으로 폴백한다.
  const fallback = await supabase
    .from("capa_process_groups")
    .select("id,name,sort_order,created_at")
    .order("sort_order", { ascending: true });
  if (fallback.error) throw toTransferError(fallback.error.message);
  return ((fallback.data ?? []) as CapaProcessGroupRow[]).map(toProcessGroup);
}

export async function createCapaProcessGroup(name: string): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error("공정명은 비워둘 수 없습니다.");
  const supabase = createBrowserSupabase();
  const { data: maxData } = await supabase
    .from("capa_process_groups")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = Number((maxData as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  const uid = await getSessionUserId();
  const withAudit = await supabase.from("capa_process_groups").insert({
    name: n,
    sort_order: nextSort,
    created_by: uid,
    updated_by: uid,
  });
  if (!withAudit.error) return;

  // 마이그레이션 전(created_by/updated_by 없음) 환경 폴백
  const fallback = await supabase.from("capa_process_groups").insert({
    name: n,
    sort_order: nextSort,
  });
  if (fallback.error) throw toTransferError(fallback.error.message);
}

export async function renameCapaProcessGroup(id: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error("공정명은 비워둘 수 없습니다.");
  const supabase = createBrowserSupabase();
  const uid = await getSessionUserId();
  const withAudit = await supabase
    .from("capa_process_groups")
    .update({ name: n, updated_by: uid, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (!withAudit.error) return;

  // 마이그레이션 전(updated_by 없음) 환경 폴백
  const fallback = await supabase
    .from("capa_process_groups")
    .update({ name: n, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (fallback.error) throw toTransferError(fallback.error.message);
}

export async function updateCapaProcessGroup(input: {
  id: string;
  name: string;
  sortOrder: number;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("공정명은 비워둘 수 없습니다.");
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.floor(input.sortOrder) : 100;
  const supabase = createBrowserSupabase();
  const uid = await getSessionUserId();
  const withAudit = await supabase
    .from("capa_process_groups")
    .update({
      name,
      sort_order: sortOrder,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (!withAudit.error) return;

  // 마이그레이션 전(updated_by 없음) 환경 폴백
  const fallback = await supabase
    .from("capa_process_groups")
    .update({
      name,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (fallback.error) throw toTransferError(fallback.error.message);
}

export async function deleteCapaProcessGroup(id: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: row, error: readErr } = await supabase
    .from("capa_process_groups")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw toTransferError(readErr.message);
  const name = (row as { name?: string } | null)?.name?.trim();
  if (!name) throw new Error("삭제할 공정을 찾지 못했습니다.");
  const { data: recipes, error: readRecipesErr } = await supabase
    .from("capa_recipe_files")
    .select("id,storage_path")
    .eq("process_group", name);
  if (readRecipesErr) throw toTransferError(readRecipesErr.message);

  const recipeRows = (recipes ?? []) as Array<{ id: string; storage_path: string }>;
  const storagePaths = recipeRows
    .map((r) => (typeof r.storage_path === "string" ? r.storage_path.trim() : ""))
    .filter(Boolean);

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(BRIDGE_BUCKET)
      .remove(storagePaths);
    if (storageError) {
      throw new Error(`공정 하위 모델 파일 삭제 실패: ${storageError.message}`);
    }
  }

  if (recipeRows.length > 0) {
    const { error: deleteRecipesErr } = await supabase
      .from("capa_recipe_files")
      .delete()
      .eq("process_group", name);
    if (deleteRecipesErr) throw toTransferError(deleteRecipesErr.message);
  }

  const { error } = await supabase.from("capa_process_groups").delete().eq("id", id);
  if (error) throw toTransferError(error.message);
}

/** Storage에서 레시피 JSON 로드 */
export async function loadCapaRecipeFromStorage(
  storagePath: string
): Promise<CapaRecipe> {
  const data =
    (await downloadRecipeBlobFromBucket(BRIDGE_BUCKET, storagePath)) ??
    (await downloadRecipeBlobFromBucket(LEGACY_BRIDGE_BUCKET, storagePath));
  if (!data) {
    throw new Error("레시피 파일 다운로드 실패");
  }
  await ensureRecipeInDedicatedBucket(storagePath);
  return parseCapaRecipeJson(await data.text());
}

export async function deleteCapaRecipeCatalogItem(input: {
  recipeId: string;
  storagePath: string;
}): Promise<void> {
  const supabase = createBrowserSupabase();
  const { error: storageError } = await supabase.storage
    .from(BRIDGE_BUCKET)
    .remove([input.storagePath]);
  if (storageError) {
    throw new Error(`레시피 파일 삭제 실패: ${storageError.message}`);
  }
  const { error } = await supabase
    .from("capa_recipe_files")
    .delete()
    .eq("id", input.recipeId);
  if (error) throw toTransferError(error.message);
}

/**
 * PC 위젯에 불러오기 신호 — KPI 첨부와 동일하게 전달 큐 + 위젯 HTTP 호출
 * (위젯이 Storage에 반영 완료 시 transfers.status=ready)
 */
export async function requestCapaRecipeLoadViaWidget(
  storagePath: string
): Promise<void> {
  const path = storagePath.trim();
  if (!path) throw new Error("레시피 경로가 비어 있습니다.");
  await waitForWidgetCapaTransfer("recipe_load", path);
}

/** 위젯 동기화 후 Storage에서 레시피 로드 (위젯 미실행 시 Storage 직접 시도) */
export async function loadCapaRecipeWithWidgetSync(
  storagePath: string
): Promise<CapaRecipe> {
  try {
    await requestCapaRecipeLoadViaWidget(storagePath);
  } catch (widgetErr) {
    console.warn("CAPA recipe widget load skipped:", widgetErr);
  }
  return loadCapaRecipeFromStorage(storagePath);
}

/** 저장: 공유 Storage + 카탈로그 + (선택) 위젯 PC 동기화 */
export async function saveCapaRecipeToLocal(recipe: CapaRecipe): Promise<void> {
  const uid = await getSessionUserId();
  const archivePath = sharedRecipeStoragePath(recipe.meta.id);
  const payload = serializeCapaRecipe({
    ...recipe,
    meta: { ...recipe.meta, updatedAt: new Date().toISOString() },
  });

  await uploadRecipeBlob(archivePath, payload, recipe);
  await upsertRecipeCatalogRow({ recipe, storagePath: archivePath, uid });

  try {
    await waitForWidgetCapaTransfer("recipe_save", archivePath);
  } catch (widgetError) {
    console.warn("CAPA recipe server backup sync skipped:", widgetError);
  }
}

/** @deprecated listCapaRecipeCatalog + loadCapaRecipeFromStorage 사용 */
export async function loadCapaRecipeFromLocal(): Promise<CapaRecipe> {
  const catalog = await listCapaRecipeCatalog();
  if (!catalog.length) {
    throw new Error("불러올 레시피가 없습니다. 먼저 레시피를 저장하세요.");
  }
  return loadCapaRecipeFromStorage(catalog[0].storagePath);
}
