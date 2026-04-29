"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { createBrowserSupabase, usernameToAuthEmail } from "@/src/lib/supabase";

function mapUpdatePasswordError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid")) {
    return "기존 비밀번호가 올바르지 않습니다.";
  }
  if (m.includes("same")) {
    return "새 비밀번호는 기존 비밀번호와 달라야 합니다.";
  }
  if (m.includes("password") && m.includes("weak")) {
    return "비밀번호 정책을 만족하지 않습니다. 길이·문자 종류를 늘려 보세요.";
  }
  return message;
}

const MIN_NEW_LENGTH = 8;

type Props = {
  open: boolean;
  onClose: () => void;
  /** 로그인 ID(소문자). 세션에 email이 없을 때 `username@ctst.local` 복원용 */
  profileUsername: string;
};

export function ChangePasswordModal({ open, onClose, profileUsername }: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  /** 브라우저 자동완성이 기존 비밀번호 칸에 아이디 등을 채우는 것을 막기 위해, 포커스 전까지 readOnly */
  const [currentPwEditable, setCurrentPwEditable] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setCurrentPwEditable(false);
  }, [open]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!currentPassword) {
      setError("기존 비밀번호를 입력해 주세요.");
      return;
    }
    if (!newPassword) {
      setError("새 비밀번호를 입력해 주세요.");
      return;
    }
    if (newPassword.length < MIN_NEW_LENGTH) {
      setError(`새 비밀번호는 ${MIN_NEW_LENGTH}자 이상으로 설정해 주세요.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("새 비밀번호는 기존 비밀번호와 달라야 합니다.");
      return;
    }

    const supabase = createBrowserSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setError("로그인 정보를 찾을 수 없습니다. 다시 로그인해 주세요.");
      return;
    }

    let email = session.user.email?.trim() ?? "";
    if (!email) {
      try {
        email = usernameToAuthEmail(profileUsername);
      } catch {
        setError("계정 이메일을 확인할 수 없습니다. 관리자에게 문의해 주세요.");
        return;
      }
    }

    setLoading(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signErr) {
        setError(mapUpdatePasswordError(signErr.message));
        return;
      }

      const { error: updErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updErr) {
        setError(mapUpdatePasswordError(updErr.message));
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted) return null;

  const modalTree = (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/40"
      role="presentation"
    >
      <div
        className="flex min-h-[100dvh] w-full items-center justify-center p-4 sm:p-6"
        onMouseDown={(ev) => {
          if (ev.target === ev.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[min(90dvh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border border-sky-200 bg-white shadow-xl shadow-slate-900/15"
        >
        <div className="flex items-start justify-between gap-3 border-b border-sky-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <KeyRound className="h-4 w-4" aria-hidden />
            </div>
            <h2 id={titleId} className="text-base font-semibold text-slate-800">
              비밀번호 변경
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="relative px-5 py-4"
          autoComplete="off"
        >
          {/* 브라우저/비밀번호 관리자가 먼저 채우도록 숨김 디코이(실제 입력란은 비워 둠) */}
          <div
            className="absolute -left-[9999px] h-px w-px overflow-hidden opacity-0"
            aria-hidden="true"
          >
            <input type="text" name="ctst_decoy_user" autoComplete="username" tabIndex={-1} readOnly />
            <input type="password" name="ctst_decoy_pw" autoComplete="current-password" tabIndex={-1} readOnly />
          </div>
          <p className="mb-4 text-sm text-slate-600">
            계정 생성 시 안내받은 초기 비밀번호(예:{" "}
            <span className="font-mono text-xs text-slate-700">ctst12345!</span>)를 기존
            비밀번호에 입력한 뒤, 새 비밀번호로 바꿀 수 있습니다.
          </p>

          {error ? (
            <p
              className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              비밀번호가 변경되었습니다. 이후 로그인 시 새 비밀번호를 사용하세요.
            </p>
          ) : null}

          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              기존 비밀번호
            </span>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                name="ctst_kpi_existing_password"
                autoComplete="off"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                onFocus={() => setCurrentPwEditable(true)}
                readOnly={!currentPwEditable}
                disabled={loading}
                data-lpignore="true"
                data-1p-ignore
                data-form-type="other"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-800 outline-none ring-sky-300 focus:border-sky-400 focus:ring-2 disabled:opacity-60 read-only:bg-white"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label={showCurrent ? "비밀번호 숨기기" : "비밀번호 표시"}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              새 비밀번호
            </span>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-800 outline-none ring-sky-300 focus:border-sky-400 focus:ring-2 disabled:opacity-60"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label={showNew ? "비밀번호 숨기기" : "비밀번호 표시"}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              새 비밀번호 확인
            </span>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-800 outline-none ring-sky-300 focus:border-sky-400 focus:ring-2 disabled:opacity-60"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label={showConfirm ? "비밀번호 숨기기" : "비밀번호 표시"}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60 sm:flex-none sm:min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  저장 중…
                </>
              ) : (
                "저장"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              닫기
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalTree, document.body);
}

export function ChangePasswordButton({ profileUsername }: { profileUsername: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm font-medium text-sky-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
      >
        <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
        비밀번호 변경
      </button>
      <ChangePasswordModal
        open={open}
        onClose={() => setOpen(false)}
        profileUsername={profileUsername}
      />
    </>
  );
}
