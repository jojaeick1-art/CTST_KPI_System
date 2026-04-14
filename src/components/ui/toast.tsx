"use client";

type ToastTone = "success" | "error" | "info";

export type ToastState = {
  open: boolean;
  message: string;
  tone: ToastTone;
};

export function AppToast({
  state,
  onClose,
  position = "top-center",
}: {
  state: ToastState;
  onClose: () => void;
  position?: "top-right" | "center" | "top-center";
}) {
  if (!state.open) return null;
  const toneClass =
    state.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : state.tone === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-sky-200 bg-sky-50 text-sky-900";

  return (
    <div
      className={
        position === "center"
          ? "fixed inset-0 z-[100] flex items-center justify-center"
          : position === "top-center"
            ? "fixed left-1/2 top-4 z-[100] w-full max-w-md -translate-x-1/2 px-4"
            : "fixed right-4 top-4 z-[100] max-w-sm"
      }
    >
      <div
        className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${toneClass} ${
          position === "center" ? "mx-4 w-full max-w-md" : "w-full"
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="whitespace-pre-wrap leading-relaxed">{state.message}</p>
          {position !== "center" && position !== "top-center" ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-1 text-xs opacity-70 hover:opacity-100"
              aria-label="알림 닫기"
            >
              닫기
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

