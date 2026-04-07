import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function getEnvOrThrow(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 없거나 비어 있습니다. dev 서버를 재시작했는지 확인하세요."
    );
  }
  if (!url.startsWith("https://")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 은 https:// 로 시작하는 Supabase 프로젝트 URL 이어야 합니다."
    );
  }
  return { url, key };
}

/**
 * 브라우저 전용 Supabase 클라이언트 (세션은 기본적으로 localStorage 에 저장됩니다).
 * Next 16 환경에서 auth-helpers 쿠키 클라이언트가 멈추는 경우가 있어 supabase-js 단일 클라이언트를 사용합니다.
 */
export function createBrowserSupabase(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("createBrowserSupabase() 는 클라이언트 컴포넌트에서만 호출하세요.");
  }
  const { url, key } = getEnvOrThrow();
  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

/** 디버깅용: 클라이언트에서 env 가 번들에 포함됐는지 확인 (값 전체는 노출하지 않음) */
export function getSupabasePublicEnvStatus(): {
  hasUrl: boolean;
  hasKey: boolean;
  urlHost: string | null;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  let urlHost: string | null = null;
  try {
    urlHost = url ? new URL(url).host : null;
  } catch {
    urlHost = null;
  }
  return {
    hasUrl: Boolean(url),
    hasKey: Boolean(key),
    urlHost,
  };
}

/**
 * Supabase Auth는 이메일(또는 전화)로만 비밀번호 로그인을 지원합니다.
 * 대시보드에서는 username만 쓰므로, 가입·로그인 시 아래 규칙으로 이메일을 맞춥니다.
 *
 * 예: username `jojaeick1` → Auth 이메일 `jojaeick1@ctst.local`
 *
 * Supabase 대시보드에서 사용자 생성 시에도 동일한 이메일을 넣고,
 * 초기 비밀번호는 `ctst12345!` 로 두면 됩니다.
 */
export function usernameToAuthEmail(username: string): string {
  const u = username.trim().toLowerCase();
  if (!u) {
    throw new Error("계정 ID를 입력해 주세요.");
  }
  return `${u}@ctst.local`;
}

/*
 * --- Supabase SQL (SQL Editor에서 한 번 실행) ---
 *
 * 1) profiles 테이블 예시
 *
 * create table public.profiles (
 *   id uuid primary key references auth.users (id) on delete cascade,
 *   username text not null unique,
 *   role text not null check (role in ('admin', 'leader', 'employee')),
 *   created_at timestamptz default now()
 * );
 *
 * 2) 로그인 후 프로필 읽기: 앱은 signIn 후 authenticated 사용자로 본인 행만 조회합니다.
 *    RLS 예시 (로그인한 사용자가 id = auth.uid() 인 행만 SELECT):
 *
 * alter table public.profiles enable row level security;
 *
 * create policy "profiles_select_own"
 * on public.profiles for select to authenticated
 * using (id = auth.uid());
 *
 * (선택) 로그인 전 username 존재 여부만 anon 에게 보여주려면 RPC 또는 anon용 정책이
 * 별도로 필요합니다. 현재 앱 로직에는 필수 아님.
 *
 * 3) 트리거로 auth.users 가입 시 profiles 자동 생성 등은 Supabase 문서의
 *    "User management" 가이드를 참고하세요.
 */
