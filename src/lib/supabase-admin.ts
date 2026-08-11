import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트.
 *
 * 계정 생성·삭제·비밀번호 초기화는 Supabase Auth Admin API 가 필요하고,
 * 이는 service_role 키로만 호출할 수 있다. 이 키는 RLS 를 모두 우회하므로
 * 절대 브라우저 번들에 포함되면 안 되며, 서버 라우트에서만 사용한다.
 */
export function createServiceRoleSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다. 계정 생성·삭제·비밀번호 초기화를 사용하려면 서버 환경변수에 등록해 주세요."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type AdminGuardResult =
  | { ok: true; adminId: string; supabase: SupabaseClient }
  | { ok: false; status: number; message: string };

/** 한글 직급을 포함해 admin 여부를 판정 (SQL ctst_normalize_role 과 동일 규칙) */
function isAdminRoleValue(role: string | null | undefined): boolean {
  const raw = (role ?? "").trim();
  if (!raw) return false;
  if (raw === "관리자") return true;
  return raw.toLowerCase() === "admin";
}

/**
 * 요청자가 관리자인지 검증한다.
 * Authorization 헤더의 사용자 토큰으로 본인을 확인한 뒤 profiles.role 을 조회한다.
 */
export async function requireAdminRequest(request: Request): Promise<AdminGuardResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return { ok: false, status: 401, message: "로그인이 필요합니다." };
  }

  let supabase: SupabaseClient;
  try {
    supabase = createServiceRoleSupabase();
  } catch (error) {
    return {
      ok: false,
      status: 500,
      message: error instanceof Error ? error.message : "서버 설정 오류",
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, status: 401, message: "로그인 정보를 확인할 수 없습니다." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    return { ok: false, status: 500, message: "권한 정보를 확인하지 못했습니다." };
  }
  const role =
    profile && typeof (profile as { role?: unknown }).role === "string"
      ? (profile as { role: string }).role
      : null;
  if (!isAdminRoleValue(role)) {
    return { ok: false, status: 403, message: "관리자만 사용할 수 있습니다." };
  }

  return { ok: true, adminId: userData.user.id, supabase };
}

/** 비밀번호 초기화 기본값 */
export const DEFAULT_RESET_PASSWORD = "ctst12345!";
