"use client";

import type { ReactNode } from "react";

export function CapaSimulatorGuideCallout({
  show,
  step,
  totalSteps,
  title,
  body,
  onSkip,
  align = "start",
  offsetClassName,
}: {
  show: boolean;
  step: number;
  totalSteps: number;
  title: string;
  body: string;
  onSkip: () => void;
  align?: "start" | "end";
  offsetClassName?: string;
}) {
  if (!show) return null;

  return (
    <div
      className={`absolute top-full z-30 w-[min(100%,18rem)] sm:w-72 ${offsetClassName ?? "mt-2"} ${
        align === "end" ? "right-0" : "left-0"
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`absolute -top-1.5 h-3 w-3 rotate-45 border-l-2 border-t-2 border-sky-500 bg-white ${
          align === "end" ? "right-6" : "left-6"
        }`}
        aria-hidden
      />
      <div className="rounded-xl border-2 border-sky-500 bg-white p-4 shadow-lg shadow-sky-100/80">
        <p className="text-xs font-semibold text-sky-600">
          {step} / {totalSteps}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 text-xs text-slate-500 underline hover:text-slate-700"
        >
          가이드 건너뛰기
        </button>
      </div>
    </div>
  );
}

export function CapaSimulatorGuideHighlight({
  active,
  children,
  className = "",
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative ${className} ${
        active
          ? "z-10 rounded-lg ring-2 ring-sky-500 ring-offset-2 ring-offset-white"
          : ""
      }`}
    >
      {children}
    </div>
  );
}
