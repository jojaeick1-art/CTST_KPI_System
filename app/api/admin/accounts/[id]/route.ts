import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/src/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** 계정 삭제 — 겸직 → 프로필 → auth 사용자 순서로 정리 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminRequest(request);
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }
  const { supabase, adminId } = guard;
  const { id } = await params;
  const targetId = id?.trim();

  if (!targetId) {
    return NextResponse.json({ message: "대상 계정을 확인할 수 없습니다." }, { status: 400 });
  }
  if (targetId === adminId) {
    return NextResponse.json(
      { message: "본인 계정은 삭제할 수 없습니다." },
      { status: 400 }
    );
  }

  const { error: extraError } = await supabase
    .from("profile_department_roles")
    .delete()
    .eq("profile_id", targetId);
  if (extraError && extraError.code !== "42P01") {
    return NextResponse.json(
      { message: `겸직 정보 삭제 실패: ${extraError.message}` },
      { status: 400 }
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", targetId);
  if (profileError) {
    return NextResponse.json(
      {
        message: `프로필 삭제 실패: ${profileError.message} (해당 계정이 작성한 데이터가 참조 중일 수 있습니다.)`,
      },
      { status: 400 }
    );
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(targetId);
  if (authError) {
    return NextResponse.json(
      { message: `로그인 계정 삭제 실패: ${authError.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
