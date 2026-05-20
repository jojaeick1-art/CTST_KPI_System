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
  process.env.NEXT_PUBLIC_CAPA_BRIDGE_BUCKET?.trim() || "kpi-evidence";

const SHARED_RECIPES_FOLDER = "capa-bridge/shared/recipes";

export type CapaRecipeCatalogItem = {
  storagePath: string;
  recipeId: string;
  name: string;
  updatedAt: string;
  processCount: number | null;
  createdByName?: string | null;
};

type CapaRecipeFileRow = {
  id: string;
  name: string;
  storage_path: string;
  process_count: number;
  updated_at: string;
  created_by_profile?: { full_name: string | null; username: string | null } | null;
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
    updatedAt: row.updated_at,
    processCount: row.process_count,
    createdByName: displayNameFromProfile(row.created_by_profile ?? null),
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
      "id, name, storage_path, process_count, updated_at, created_by_profile:profiles!capa_recipe_files_created_by_fkey(full_name, username)"
    )
    .order("updated_at", { ascending: false });

  if (error) throw toTransferError(error.message);

  return ((data ?? []) as CapaRecipeFileRow[]).map(rowToCatalogItem);
}

/** Storage에서 레시피 JSON 로드 */
export async function loadCapaRecipeFromStorage(
  storagePath: string
): Promise<CapaRecipe> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.storage
    .from(BRIDGE_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(error?.message ?? "레시피 파일 다운로드 실패");
  }
  return parseCapaRecipeJson(await data.text());
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
