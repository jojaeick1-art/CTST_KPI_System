import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 통합 Hub 서버 간 읽기 전용 API 인증.
 * `HUB_API_TOKEN` 서버 환경변수와 `Authorization: Bearer <token>` 헤더를 상수 시간 비교한다.
 *
 * 토큰 원문은 어떤 경우에도 로그·응답에 남기지 않는다(길이·값 모두).
 */

export type HubApiAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500 };

/**
 * SHA-256 다이제스트로 비교해 길이 정보를 노출하지 않는다.
 * `crypto.timingSafeEqual` 은 두 버퍼 길이가 다르면 즉시 예외를 던지는데,
 * 이는 그 자체로 "토큰 길이가 다르다"는 타이밍 신호가 될 수 있어 다이제스트로 우회한다.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * 모든 Hub 읽기 전용 Route Handler의 첫 줄에서 호출한다.
 * `HUB_API_TOKEN` 이 서버에 설정돼 있지 않으면 500(서버 설정 오류),
 * 헤더가 없거나 값이 다르면 401 을 반환하도록 `{ ok: false, status }` 를 돌려준다.
 */
export function requireHubApiToken(request: Request): HubApiAuthResult {
  const expected = process.env.HUB_API_TOKEN?.trim();
  if (!expected) {
    return { ok: false, status: 500 };
  }
  const provided = extractBearerToken(request);
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
