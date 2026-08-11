import { NextResponse } from "next/server";
import {
  DEFAULT_RESET_PASSWORD,
  requireAdminRequest,
} from "@/src/lib/supabase-admin";

export const dynamic = "force-dynamic";

function authEmailFromUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (!u) throw new Error("계정 ID를 입력해 주세요.");
  if (u.includes("@")) throw new Error("계정 ID에는 @ 를 포함할 수 없습니다.");
  return `${u}@ctst.local`;
}

/** 신규 계정 생성 — auth 사용자 + profiles + 겸직 부서 */
export async function POST(request: Request) {
  const guard = await requireAdminRequest(request);
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }
  const { supabase } = guard;

  let body: {
    username?: unknown;
    fullName?: unknown;
    password?: unknown;
    roleLabel?: unknown;
    primaryDeptId?: unknown;
    extraDeptIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const roleLabel = typeof body.roleLabel === "string" ? body.roleLabel.trim() : "";
  const primaryDeptId =
    typeof body.primaryDeptId === "string" && body.primaryDeptId.trim()
      ? body.primaryDeptId.trim()
      : null;
  const extraDeptIds = Array.isArray(body.extraDeptIds)
    ? body.extraDeptIds.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
  const password =
    typeof body.password === "string" && body.password.trim()
      ? body.password
      : DEFAULT_RESET_PASSWORD;

  if (!username) {
    return NextResponse.json({ message: "계정 ID를 입력해 주세요." }, { status: 400 });
  }
  if (!roleLabel) {
    return NextResponse.json({ message: "직급을 선택해 주세요." }, { status: 400 });
  }

  let email: string;
  try {
    email = authEmailFromUsername(username);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "계정 ID 오류" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { message: "이미 사용 중인 계정 ID 입니다." },
      { status: 409 }
    );
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: username.toLowerCase(), full_name: fullName || username },
  });
  if (createError || !created?.user) {
    return NextResponse.json(
      { message: `계정 생성 실패: ${createError?.message ?? "알 수 없는 오류"}` },
      { status: 400 }
    );
  }

  const userId = created.user.id;

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      username: username.toLowerCase(),
      full_name: fullName || username,
      role: roleLabel,
      dept_id: primaryDeptId,
    },
    { onConflict: "id" }
  );
  if (profileError) {
    // 프로필 생성이 실패하면 로그인만 가능한 유령 계정이 남으므로 되돌린다.
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { message: `프로필 저장 실패: ${profileError.message}` },
      { status: 400 }
    );
  }

  const extras = Array.from(
    new Set(extraDeptIds.map((id) => id.trim()).filter((id) => id && id !== primaryDeptId))
  );
  if (extras.length > 0) {
    const { error: extraError } = await supabase
      .from("profile_department_roles")
      .insert(
        extras.map((deptId) => ({ profile_id: userId, dept_id: deptId, role: roleLabel }))
      );
    if (extraError) {
      return NextResponse.json(
        { message: `계정은 생성되었지만 겸직 저장에 실패했습니다: ${extraError.message}` },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ id: userId, username: username.toLowerCase() });
}
