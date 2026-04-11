import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
  description: "CTST KPI 관리 시스템 로그인",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-sky-50 via-white to-sky-50/80 px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage: `radial-gradient(circle at 20% 20%, rgb(186 230 253 / 0.5) 0%, transparent 45%),
            radial-gradient(circle at 80% 80%, rgb(224 242 254 / 0.6) 0%, transparent 40%)`,
        }}
      />

      <div className="relative z-10 flex w-full flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-24 w-56 items-center justify-center rounded-2xl bg-white/0">
            <img
              src="/logo_ctst.png"
              alt="CTST 로고"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600/90">
              
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-800">
              KPI 관리 시스템
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              반도체 품질·성과 지표를 한곳에서 관리합니다
            </p>
          </div>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-slate-400">
          관리자 · 리더 · 직원 역할은 프로필에 따라 자동 적용됩니다
        </p>
      </div>
    </div>
  );
}
