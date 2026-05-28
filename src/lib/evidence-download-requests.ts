import { createBrowserSupabase } from "@/src/lib/supabase";

type DownloadRequestRow = {
  id: string;
  status: string | null;
  signed_url: string | null;
  error_message: string | null;
};

const DOWNLOAD_REQUEST_TIMEOUT_MS = 45_000;
const DOWNLOAD_REQUEST_POLL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeDownloadRequestRow(row: unknown): DownloadRequestRow {
  const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  return {
    id: typeof rec.id === "string" ? rec.id : String(rec.id ?? ""),
    status: typeof rec.status === "string" ? rec.status : null,
    signed_url: typeof rec.signed_url === "string" ? rec.signed_url : null,
    error_message:
      typeof rec.error_message === "string" ? rec.error_message : null,
  };
}

function ensureReadySignedUrl(row: DownloadRequestRow): string | null {
  const status = row.status?.trim().toLowerCase() ?? "";
  const signedUrl = row.signed_url?.trim() ?? "";
  if (status === "ready" && signedUrl) return signedUrl;
  if (status === "failed" || status === "error") {
    throw new Error(row.error_message?.trim() || "파일 다운로드 요청이 실패했습니다.");
  }
  return null;
}

async function tryDirectSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.storage
    .from("kpi-evidence")
    .createSignedUrl(storagePath, 60);
  if (error) return null;
  const url = data?.signedUrl?.trim();
  return url ? url : null;
}

export async function requestEvidenceSignedUrl(
  storagePath: string
): Promise<string> {
  const cleanPath = storagePath.trim().replace(/^\/+/, "");
  if (!cleanPath) {
    throw new Error("다운로드할 파일 경로가 없습니다.");
  }

  // 위젯 큐 실패 시 Supabase 직접 서명 URL도 시도한다.
  const tryFallbackDirect = async () => {
    const direct = await tryDirectSignedUrl(cleanPath);
    if (direct) return direct;
    return null;
  };

  const supabase = createBrowserSupabase();
  const { data: inserted, error: insertError } = await supabase
    .from("download_requests")
    .insert({ storage_path: cleanPath })
    .select("id,status,signed_url,error_message")
    .single();

  if (insertError) {
    const direct = await tryFallbackDirect();
    if (direct) return direct;
    throw new Error(`파일 다운로드 요청 생성 실패: ${insertError.message}`);
  }

  const firstRow = normalizeDownloadRequestRow(inserted);
  if (!firstRow.id) {
    throw new Error("파일 다운로드 요청 ID를 확인하지 못했습니다.");
  }
  const immediateUrl = ensureReadySignedUrl(firstRow);
  if (immediateUrl) return immediateUrl;

  const startedAt = Date.now();
  while (Date.now() - startedAt < DOWNLOAD_REQUEST_TIMEOUT_MS) {
    await sleep(DOWNLOAD_REQUEST_POLL_MS);

    const { data, error } = await supabase
      .from("download_requests")
      .select("id,status,signed_url,error_message")
      .eq("id", firstRow.id)
      .maybeSingle();

    if (error) {
      const direct = await tryFallbackDirect();
      if (direct) return direct;
      throw new Error(`파일 다운로드 요청 확인 실패: ${error.message}`);
    }

    const signedUrl = ensureReadySignedUrl(normalizeDownloadRequestRow(data));
    if (signedUrl) return signedUrl;
  }

  const direct = await tryFallbackDirect();
  if (direct) return direct;
  throw new Error("파일 준비 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
}
