import { NextResponse } from "next/server";
import { requireHubApiToken } from "@/src/lib/hub-api-auth";
import {
  HUB_FORBIDDEN,
  HUB_INTERNAL_ERROR,
  HUB_NOT_FOUND,
  HUB_SERVER_MISCONFIGURED,
  HUB_UNAUTHORIZED,
} from "@/src/lib/hub-api-response";
import {
  createHubSignedUrl,
  decodeHubAttachmentId,
  getHubServiceClient,
  isHubAttachmentPathLinked,
} from "@/src/lib/hub-kpi-read";

export const dynamic = "force-dynamic";

/** 짧은 만료 서명 URL. 향후 서버 PC 위젯의 download_requests 큐 방식이 추가로
 * 필요해질 수 있음 — 이번 작업에서는 직접 서명 경로만 구현하고 위젯은 건드리지 않았다.
 * (KPI_HUB_API_IMPLEMENTATION.md 참고) */
const SIGNED_URL_EXPIRES_IN_SECONDS = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireHubApiToken(request);
  if (!auth.ok) {
    return auth.status === 500 ? HUB_SERVER_MISCONFIGURED() : HUB_UNAUTHORIZED();
  }

  const { id } = await params;
  const decoded = id ? decodeHubAttachmentId(id) : null;
  if (!decoded || decoded.bucket !== "kpi-evidence") {
    return HUB_NOT_FOUND("Attachment not found.");
  }

  try {
    const client = getHubServiceClient();

    // 임의 Storage 경로에 서명하지 않도록, 실제 kpi_targets 실적에 연결된
    // 경로인지 먼저 검증한다.
    const linked = await isHubAttachmentPathLinked(client, decoded.storagePath);
    if (!linked) {
      return HUB_FORBIDDEN(
        "This attachment is not linked to any KPI performance record."
      );
    }

    const signedUrl = await createHubSignedUrl(
      client,
      decoded.storagePath,
      SIGNED_URL_EXPIRES_IN_SECONDS
    );
    const expiresAt = new Date(
      Date.now() + SIGNED_URL_EXPIRES_IN_SECONDS * 1000
    ).toISOString();

    return NextResponse.json({
      attachment_id: id,
      signed_url: signedUrl,
      expires_in_seconds: SIGNED_URL_EXPIRES_IN_SECONDS,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error(
      "[hub-api] download-url 발급 실패",
      error instanceof Error ? error.message : error
    );
    return HUB_INTERNAL_ERROR();
  }
}
