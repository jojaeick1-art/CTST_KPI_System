import { NextResponse } from "next/server";
import {
  DEFAULT_RESET_PASSWORD,
  requireAdminRequest,
} from "@/src/lib/supabase-admin";

export const dynamic = "force-dynamic";

/** 비밀번호 초기화 — 기본값 ctst12345! */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminRequest(request);
  if (!guard.ok) {
    return NextResponse.json({ message: guard.message }, { status: guard.status });
  }
  const { supabase } = guard;
  const { id } = await params;
  const targetId = id?.trim();

  if (!targetId) {
    return NextResponse.json({ message: "대상 계정을 확인할 수 없습니다." }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.updateUserById(targetId, {
    password: DEFAULT_RESET_PASSWORD,
  });
  if (error) {
    return NextResponse.json(
      { message: `비밀번호 초기화 실패: ${error.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, password: DEFAULT_RESET_PASSWORD });
}
