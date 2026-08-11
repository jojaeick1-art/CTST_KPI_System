import { createBrowserSupabase } from "@/src/lib/supabase";
import { isAdminRole, normalizeRole, roleLabelKo } from "@/src/lib/rbac";

/**
 * 계정 관리(관리자 전용) — 직급·주소속 부서·겸직 부서 조정
 *
 * - `profiles.role` / `profiles.dept_id` : 직급과 주 소속 부서
 * - `profile_department_roles`           : 겸직(추가 담당) 부서
 *
 * 겸직 테이블의 `role` 컬럼은 권한 판정에 쓰이지 않는다
 * (`ctst_profile_has_department` 는 부서 소속 여부만 확인).
 * 혼선을 줄이기 위해 주 직급과 같은 값으로 맞춰 저장한다.
 */

/**
 * DB `profiles.role` 에 저장하는 한글 직급 값.
 * SQL 쪽 `ctst_normalize_role` 이 인식하는 값만 노출한다.
 * ('그룹장/팀장' 병합 역할은 SQL 함수가 인식하지 못해 KPI 쓰기 권한이 사라지므로 제외)
 */
export const ASSIGNABLE_ROLE_LABELS = [
  "관리자",
  "대표",
  "그룹장",
  "팀장",
  "수석",
  "책임",
  "선임",
  "프로",
] as const;

export type AssignableRoleLabel = (typeof ASSIGNABLE_ROLE_LABELS)[number];

export type AccountAdminRow = {
  id: string;
  username: string;
  fullName: string | null;
  /** DB 원본 값 (예: '그룹장') */
  role: string;
  /** 정규화 후 한글 라벨 (예: '그룹장') */
  roleLabel: string;
  primaryDeptId: string | null;
  primaryDeptName: string | null;
  /** 겸직 부서 (주 소속 제외) */
  extraDeptIds: string[];
};

export type AccountAdminBundle = {
  accounts: AccountAdminRow[];
  departments: Array<{ id: string; name: string }>;
};

async function ensureAccountAdmin(): Promise<void> {
  const supabase = createBrowserSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("권한 정보를 확인하지 못했습니다.");
  const role =
    data && typeof (data as { role?: unknown }).role === "string"
      ? (data as { role: string }).role
      : null;
  if (!isAdminRole(role)) {
    throw new Error("계정 관리는 관리자만 할 수 있습니다.");
  }
}

export async function fetchAccountAdminBundle(): Promise<AccountAdminBundle> {
  const supabase = createBrowserSupabase();

  const { data: deptRows, error: deptError } = await supabase
    .from("departments")
    .select("id, name")
    .order("name", { ascending: true });
  if (deptError) throw new Error(`부서 목록 조회 실패: ${deptError.message}`);
  const departments = (deptRows ?? []).map((row) => ({
    id: String((row as Record<string, unknown>).id ?? ""),
    name: String((row as Record<string, unknown>).name ?? ""),
  }));
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, dept_id")
    .order("full_name", { ascending: true });
  if (profileError) throw new Error(`계정 목록 조회 실패: ${profileError.message}`);

  const { data: extraRows, error: extraError } = await supabase
    .from("profile_department_roles")
    .select("profile_id, dept_id");
  if (extraError && extraError.code !== "42P01") {
    throw new Error(`겸직 정보 조회 실패: ${extraError.message}`);
  }

  const extraByProfile = new Map<string, string[]>();
  for (const row of extraRows ?? []) {
    const record = row as Record<string, unknown>;
    const profileId = typeof record.profile_id === "string" ? record.profile_id : "";
    const deptId = typeof record.dept_id === "string" ? record.dept_id : "";
    if (!profileId || !deptId) continue;
    const list = extraByProfile.get(profileId) ?? [];
    if (!list.includes(deptId)) list.push(deptId);
    extraByProfile.set(profileId, list);
  }

  const accounts: AccountAdminRow[] = (profileRows ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? "");
    const primaryDeptId =
      typeof record.dept_id === "string" && record.dept_id ? record.dept_id : null;
    const rawRole = record.role === null || record.role === undefined ? "" : String(record.role);
    const extras = (extraByProfile.get(id) ?? []).filter(
      (deptId) => deptId !== primaryDeptId
    );
    return {
      id,
      username: String(record.username ?? ""),
      fullName: typeof record.full_name === "string" ? record.full_name : null,
      role: rawRole,
      roleLabel: roleLabelKo(rawRole),
      primaryDeptId,
      primaryDeptName: primaryDeptId ? deptNameById.get(primaryDeptId) ?? null : null,
      extraDeptIds: extras,
    };
  });

  return { accounts, departments };
}

/** 비밀번호 초기화 기본값 (서버와 동일) */
export const DEFAULT_RESET_PASSWORD = "ctst12345!";

async function callAdminApi<T>(
  path: string,
  init: { method: string; body?: unknown }
): Promise<T> {
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
  }

  const response = await fetch(path, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `요청에 실패했습니다 (HTTP ${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function createAccount(input: {
  username: string;
  fullName: string;
  roleLabel: string;
  primaryDeptId: string | null;
  extraDeptIds: string[];
}): Promise<{ id: string; username: string }> {
  return callAdminApi("/api/admin/accounts", { method: "POST", body: input });
}

export async function deleteAccount(profileId: string): Promise<void> {
  await callAdminApi(`/api/admin/accounts/${profileId}`, { method: "DELETE" });
}

export async function resetAccountPassword(profileId: string): Promise<void> {
  await callAdminApi(`/api/admin/accounts/${profileId}/password`, { method: "POST" });
}

export async function updateAccountAssignment(input: {
  profileId: string;
  /** 저장할 한글 직급 값 */
  roleLabel: string;
  primaryDeptId: string | null;
  /** 겸직 부서 (주 소속과 겹치면 자동 제외) */
  extraDeptIds: string[];
}): Promise<void> {
  await ensureAccountAdmin();
  const supabase = createBrowserSupabase();

  const roleLabel = input.roleLabel.trim();
  if (!roleLabel) throw new Error("직급을 선택해 주세요.");
  if (normalizeRole(roleLabel) === "pro" && roleLabel !== "프로") {
    // 알 수 없는 값이 들어오면 권한이 조용히 낮아지므로 막는다.
    throw new Error(`알 수 없는 직급 값입니다: ${roleLabel}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      role: roleLabel,
      dept_id: input.primaryDeptId,
    })
    .eq("id", input.profileId);
  if (profileError) {
    throw new Error(`계정 정보 저장 실패: ${profileError.message}`);
  }

  const extras = Array.from(
    new Set(
      input.extraDeptIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id !== input.primaryDeptId)
    )
  );

  // 겸직은 전체 교체 방식 — 기존 행을 지우고 선택한 부서만 다시 넣는다.
  const { error: deleteError } = await supabase
    .from("profile_department_roles")
    .delete()
    .eq("profile_id", input.profileId);
  if (deleteError) {
    throw new Error(`겸직 정보 초기화 실패: ${deleteError.message}`);
  }

  if (extras.length === 0) return;

  const { error: insertError } = await supabase
    .from("profile_department_roles")
    .insert(
      extras.map((deptId) => ({
        profile_id: input.profileId,
        dept_id: deptId,
        role: roleLabel,
      }))
    );
  if (insertError) {
    throw new Error(`겸직 정보 저장 실패: ${insertError.message}`);
  }
}
