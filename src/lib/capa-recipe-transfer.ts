import { createBrowserSupabase } from "@/src/lib/supabase";
import { notifyWidgetUploadToTest } from "@/src/lib/kpi-web-bridge";
import { parseCapaRecipeJson, serializeCapaRecipe } from "@/src/lib/capa/recipe-normalize";
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

export type CapaRecipeCatalogItem = {
  storagePath: string;
  recipeId: string;
  name: string;
  updatedAt: string;
  processCount: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toTransferError(message: string): Error {
  const lower = message.toLowerCase();
  if (
    lower.includes("capa_recipe_transfers") &&
    (lower.includes("schema cache") ||
      lower.includes("does not exist") ||
      lower.includes("could not find"))
  ) {
    return new Error(
      "Supabase에 capa_recipe_transfers 테이블이 없습니다. " +
        "대시보드 SQL Editor에서 supabase/migrations/20260518120000_capa_recipe_transfers.sql 을 실행하거나, " +
        "로컬에서 supabase db push 로 마이그레이션을 적용한 뒤 다시 시도하세요."
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

function assertReady(row: CapaRecipeTransferRow): string | null {
  const status = row.status?.toLowerCase() ?? "";
  const url = row.signed_url?.trim() ?? "";
  if (status === "ready" && url) return url;
  if (status === "failed" || status === "error") {
    throw new Error(row.error_message?.trim() || "레시피 전송 요청이 실패했습니다.");
  }
  return null;
}

function recipesFolder(uid: string): string {
  return `capa-bridge/${uid}/recipes`;
}

function recipeArchivePath(uid: string, recipeId: string): string {
  return `${recipesFolder(uid)}/${recipeId}.json`;
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
  id: string
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
    const url = assertReady(row);
    if (url) return { ...row, signed_url: url };
    if (row.kind === "recipe_load" && row.storage_path?.trim()) {
      return row;
    }
  }
  throw new Error("레시피 전송 대기 시간이 초과되었습니다. 위젯 실행 여부를 확인하세요.");
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

/** 저장된 레시피 목록 (Supabase Storage) */
export async function listCapaRecipeCatalog(): Promise<CapaRecipeCatalogItem[]> {
  const supabase = createBrowserSupabase();
  const uid = await getSessionUserId();
  const folder = recipesFolder(uid);

  const { data: files, error } = await supabase.storage
    .from(BRIDGE_BUCKET)
    .list(folder, {
      limit: 100,
      sortBy: { column: "updated_at", order: "desc" },
    });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("not found") || msg.includes("does not exist")) {
      return [];
    }
    throw new Error(`레시피 목록 조회 실패: ${error.message}`);
  }

  const jsonFiles = (files ?? []).filter((f) => f.name?.toLowerCase().endsWith(".json"));
  const items: CapaRecipeCatalogItem[] = [];

  for (const file of jsonFiles) {
    const storagePath = `${folder}/${file.name}`;
    const recipeId = file.name.replace(/\.json$/i, "");
    const meta = file.metadata as Record<string, unknown> | undefined;
    const metaName =
      typeof meta?.recipe_name === "string" ? meta.recipe_name.trim() : "";
    const metaCountRaw = meta?.process_count;
    const metaCount =
      typeof metaCountRaw === "string" && metaCountRaw !== ""
        ? Number(metaCountRaw)
        : typeof metaCountRaw === "number"
          ? metaCountRaw
          : null;

    let name = metaName || recipeId;
    let processCount =
      metaCount != null && Number.isFinite(metaCount) ? metaCount : null;
    let updatedAt = file.updated_at ?? file.created_at ?? "";

    if (!metaName) {
      try {
        const { data } = await supabase.storage
          .from(BRIDGE_BUCKET)
          .download(storagePath);
        if (data) {
          const recipe = parseCapaRecipeJson(await data.text());
          name = recipe.meta.name;
          processCount = recipe.processes.length;
          updatedAt = recipe.meta.updatedAt || updatedAt;
        }
      } catch {
        /* 메타 없는 구버전 파일 — 파일명으로 표시 */
      }
    }

    items.push({
      storagePath,
      recipeId,
      name,
      updatedAt,
      processCount,
    });
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 목록에서 선택한 레시피 불러오기 */
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

/** 로컬 저장: JSON → Storage 보관 + (선택) 위젯 PC 동기화 */
export async function saveCapaRecipeToLocal(recipe: CapaRecipe): Promise<void> {
  const supabase = createBrowserSupabase();
  const uid = await getSessionUserId();
  const archivePath = recipeArchivePath(uid, recipe.meta.id);
  const payload = serializeCapaRecipe({
    ...recipe,
    meta: { ...recipe.meta, updatedAt: new Date().toISOString() },
  });

  await uploadRecipeBlob(archivePath, payload, recipe);

  try {
    const { data: inserted, error } = await supabase
      .from("capa_recipe_transfers")
      .insert({ kind: "recipe_save", storage_path: archivePath, status: "pending" })
      .select("id,kind,storage_path,status,signed_url,error_message,created_at")
      .single();

    if (error) throw toTransferError(error.message);

    const bridge = await notifyWidgetUploadToTest(archivePath);
    if (bridge.ok) {
      const row = normalizeRow(inserted);
      await pollTransfer(supabase, row.id);
    }
  } catch (widgetError) {
    console.warn("CAPA recipe widget sync skipped:", widgetError);
  }
}

/**
 * @deprecated 위젯 폴링 방식 — listCapaRecipeCatalog + loadCapaRecipeFromStorage 사용
 */
export async function loadCapaRecipeFromLocal(): Promise<CapaRecipe> {
  const catalog = await listCapaRecipeCatalog();
  if (!catalog.length) {
    throw new Error("불러올 레시피가 없습니다. 먼저 레시피를 저장하세요.");
  }
  return loadCapaRecipeFromStorage(catalog[0].storagePath);
}
