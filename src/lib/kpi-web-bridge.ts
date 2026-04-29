const DEFAULT_UPLOAD_URL = "http://127.0.0.1:48721/upload-to-test";

export function getKpiWebBridgeUploadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_KPI_WEB_BRIDGE_URL?.trim() || DEFAULT_UPLOAD_URL
  );
}

function getKpiWebBridgeSecret(): string | null {
  const s = process.env.NEXT_PUBLIC_KPI_WEB_BRIDGE_SECRET?.trim();
  return s || null;
}

export function getKpiWebBridgeTestBucket(): string {
  return (
    process.env.NEXT_PUBLIC_KPI_WEB_BRIDGE_TEST_BUCKET?.trim() ||
    "kpi-evidence"
  );
}

export type WebBridgeUploadResult =
  | { ok: true; bucket: string; path: string }
  | {
      ok: false;
      error: string;
      status?: number;
      candidates?: string[];
    };

export async function notifyWidgetUploadToTest(
  storageRelativePath: string
): Promise<WebBridgeUploadResult> {
  const path = storageRelativePath.trim();
  if (!path) {
    return { ok: false, error: "저장 경로가 비어 있습니다." };
  }

  const url = getKpiWebBridgeUploadUrl();
  const secret = getKpiWebBridgeSecret();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers["X-Bridge-Secret"] = secret;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ path }),
    });
  } catch {
    return {
      ok: false,
      error:
        "PC 웹 브리지(위젯)에 연결할 수 없습니다. 위젯을 실행했는지, 주소가 올바른지 확인하세요.",
    };
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "웹 브리지 응답을 해석할 수 없습니다.", status: res.status };
  }

  if (res.status === 409) {
    const candidates = Array.isArray(body.candidates)
      ? body.candidates.map(String)
      : undefined;
    return {
      ok: false,
      error:
        typeof body.error === "string" && body.error.trim()
          ? body.error
          : "같은 이름의 파일이 여러 개 있습니다. 위젯에서 전체 경로로 지정하세요.",
      status: 409,
      candidates,
    };
  }

  if (res.ok && body.ok === true) {
    const outPath = typeof body.path === "string" && body.path.trim() ? body.path.trim() : path;
    const bucket =
      typeof body.bucket === "string" && body.bucket.trim()
        ? body.bucket.trim()
        : "kpi-evidence";
    return { ok: true, bucket, path: outPath };
  }

  const msg =
    (typeof body.error === "string" && body.error.trim()) ||
    `웹 브리지 오류 (HTTP ${res.status})`;
  return { ok: false, error: msg, status: res.status };
}
