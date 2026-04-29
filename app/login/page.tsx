import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
  description: "CTST 통합 시스템 로그인",
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
        <div className="flex flex-col items-center gap-5 text-center">
          <img
            src="/c-one%20logo.png?v=4"
            alt="C-ONE 로고"
            className="h-auto max-h-[120px] w-auto max-w-[min(100%,420px)] object-contain"
          />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              CTST 통합 시스템
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              CTST 사내 업무를 하나의 계정으로 연결하는 통합 포털
            </p>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
