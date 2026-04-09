"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Lock,
  LogIn,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import {
  createBrowserSupabase,
  getSupabasePublicEnvStatus,
  usernameToAuthEmail,
} from "@/src/lib/supabase";

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid")) {
    return "계정 ID 또는 비밀번호가 올바르지 않습니다. Supabase Auth 이메일이 ID@ctst.local 형식인지 확인해 주세요.";
  }
  if (m.includes("email not confirmed")) {
    return "이메일 인증이 필요합니다. 관리자에게 문의해 주세요.";
  }
  return `로그인에 실패했습니다: ${message}`;
}

function showError(
  message: string,
  setError: (s: string) => void
) {
  console.error("[CTST 로그인]", message);
  setError(message);
  window.alert(`로그인 오류\n\n${message}`);
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();

    setError(null);

    const id = username.trim();
    if (!id) {
      showError("계정 ID를 입력해 주세요.", setError);
      return;
    }
    if (!password) {
      showError("비밀번호를 입력해 주세요.", setError);
      return;
    }

    const env = getSupabasePublicEnvStatus();
    if (!env.hasUrl || !env.hasKey) {
      showError(
        `환경 변수가 클라이언트에 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 를 넣은 뒤 dev 서버를 재시작하세요. (url: ${env.hasUrl ? "OK" : "없음"}, key: ${env.hasKey ? "OK" : "없음"})`,
        setError
      );
      return;
    }

    void (async () => {
      setLoading(true);
      try {
        const supabase = createBrowserSupabase();
        const normalized = id.toLowerCase();
        const email = usernameToAuthEmail(id);

        const {
          data: authData,
          error: signError,
        } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signError) {
          showError(mapAuthError(signError.message), setError);
          return;
        }

        const session = authData.session;
        if (!session) {
          showError(
            "로그인에 성공했지만 세션을 만들 수 없습니다. 브라우저 저장소(localStorage)를 허용했는지, Supabase 이메일 인증 설정을 확인해 주세요.",
            setError
          );
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, role, dept_id")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profileError) {
          await supabase.auth.signOut();
          showError(
            `프로필을 불러오지 못했습니다: ${profileError.message}. RLS에서 본인 행 읽기(select)를 허용했는지 확인해 주세요.`,
            setError
          );
          return;
        }
        if (!profile) {
          await supabase.auth.signOut();
          showError(
            "Auth에는 등록되어 있으나 profiles 테이블에 같은 사용자(id) 행이 없습니다. Supabase에서 프로필을 추가해 주세요.",
            setError
          );
          return;
        }

        if ((profile.username ?? "").toLowerCase() !== normalized) {
          await supabase.auth.signOut();
          showError(
            "profiles의 계정 ID와 로그인에 사용한 ID가 일치하지 않습니다. username과 Auth 이메일(ID@ctst.local)을 맞춰 주세요.",
            setError
          );
          return;
        }

        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "알 수 없는 오류가 발생했습니다.";
        showError(message, setError);
      } finally {
        setLoading(false);
      }
    })().catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : "처리 중 예기치 않은 오류가 발생했습니다.";
      console.error("[CTST 로그인] 미처리 오류", err);
      setLoading(false);
      showError(message, setError);
    });
  }

  return (
    <form
      onSubmit={handleFormSubmit}
      className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-sky-100/80 bg-white/90 p-8 shadow-lg shadow-sky-100/50 backdrop-blur-sm"
    >
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">
          CTST KPI
        </h1>
        <p className="text-sm text-slate-500">
          계정 ID와 비밀번호로 로그인하세요
        </p>
      </div>

      {error ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/90 px-3 py-2.5 text-sm text-red-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="username"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            계정 ID
          </label>
          <div className="relative">
            <User
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500/80"
              aria-hidden
            />
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="계정 입력"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-slate-800 placeholder:text-slate-400 outline-none ring-sky-400/40 transition focus:border-sky-400 focus:ring-2"
              disabled={loading}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            이메일이 아닌 사내 계정 ID만 입력합니다 (@ 없음)
          </p>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            비밀번호
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500/80"
              aria-hidden
            />
            <input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-slate-800 placeholder:text-slate-400 outline-none ring-sky-400/40 transition focus:border-sky-400 focus:ring-2"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-sky-50 hover:text-sky-600"
              aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 text-sm font-semibold text-white shadow-md shadow-sky-500/25 transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <LogIn className="h-4 w-4" aria-hidden />
        )}
        {loading ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
