import { NextResponse } from "next/server";
import { requireHubApiToken } from "@/src/lib/hub-api-auth";
import { HUB_SERVER_MISCONFIGURED, HUB_UNAUTHORIZED } from "@/src/lib/hub-api-response";

export const dynamic = "force-dynamic";

/**
 * 연결 확인용. 비밀값·DB URL·테이블 정보는 절대 반환하지 않는다.
 * 시스템 상태가 외부에 그냥 공개되지 않도록 다른 엔드포인트와 동일하게 인증을 요구한다.
 */
export async function GET(request: Request) {
  const auth = requireHubApiToken(request);
  if (!auth.ok) {
    return auth.status === 500 ? HUB_SERVER_MISCONFIGURED() : HUB_UNAUTHORIZED();
  }

  return NextResponse.json({
    status: "ok",
    service: "kpi-readonly-api",
    version: "1.0",
    checked_at: new Date().toISOString(),
  });
}
