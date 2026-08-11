"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import {
  CONSTRUCTION_STATUS_LABELS,
  formatKrw,
  type ConstructionDomain,
  type ConstructionStatus,
  type ConstructionTask,
} from "@/src/lib/construction-projects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  domain: ConstructionDomain;
  editingTask: ConstructionTask | null;
  submitting: boolean;
  onSubmit: (input: {
    title: string;
    planStart: string;
    planEnd: string;
    cost: number;
    progressRate: number;
    status: ConstructionStatus;
  }) => Promise<void>;
};

const STATUS_OPTIONS: ConstructionStatus[] = ["in_progress", "completed", "hold", "drop"];

function digitsOnly(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function ConstructionTaskFormModal({
  isOpen,
  onClose,
  domain,
  editingTask,
  submitting,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState("");
  const [planStart, setPlanStart] = useState("");
  const [planEnd, setPlanEnd] = useState("");
  const [costText, setCostText] = useState("");
  const [progressText, setProgressText] = useState("0");
  const [status, setStatus] = useState<ConstructionStatus>("in_progress");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달을 열 때 편집 대상 값으로 폼을 초기화한다.
    setTitle(editingTask?.title ?? "");
    setPlanStart(editingTask?.planStart ?? "");
    setPlanEnd(editingTask?.planEnd ?? "");
    setCostText(editingTask ? String(Math.round(editingTask.cost)) : "");
    setProgressText(editingTask ? String(Number(editingTask.progressRate)) : "0");
    setStatus(editingTask?.status ?? "in_progress");
    setError("");
  }, [isOpen, editingTask]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!title.trim()) {
      setError(`${domain.labels.taskNoun}명을 입력해 주세요.`);
      return;
    }
    if (!planStart || !planEnd) {
      setError("계획 시작일과 종료일을 입력해 주세요.");
      return;
    }
    if (planEnd < planStart) {
      setError("종료일은 시작일보다 같거나 뒤여야 합니다.");
      return;
    }
    const progress = Number(progressText);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      setError("진행률은 0~100 사이 숫자로 입력해 주세요.");
      return;
    }
    try {
      await onSubmit({
        title,
        planStart,
        planEnd,
        cost: Number(digitsOnly(costText) || "0"),
        progressRate: progress,
        status,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    }
  }

  const costPreview = formatKrw(Number(digitsOnly(costText) || "0"));

  const modal = (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {editingTask
                ? `${domain.labels.taskNoun} 수정`
                : `${domain.labels.taskNoun} 추가`}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {domain.hasCost
                ? "입력한 공사비용·진행률은 목록의 합계·평균에 자동 반영됩니다."
                : "입력한 진행률은 목록의 평균 진행률에 자동 반영됩니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">
              {domain.labels.taskNoun}명 <span className="text-red-600">*</span>
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: SMT Line 공사 우선 진행"
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">
                시작일 <span className="text-red-600">*</span>
              </span>
              <input
                type="date"
                value={planStart}
                onChange={(event) => setPlanStart(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">
                종료일 <span className="text-red-600">*</span>
              </span>
              <input
                type="date"
                value={planEnd}
                onChange={(event) => setPlanEnd(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            일정표에는 입력한 날짜가 속한 <strong className="text-slate-700">몇월 몇주 ~ 몇월 몇주</strong> 구간으로 표시됩니다.
          </p>

          {domain.hasCost ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">공사비용</span>
              <input
                value={costText}
                onChange={(event) => setCostText(digitsOnly(event.target.value))}
                inputMode="numeric"
                placeholder="예: 157000"
                className="rounded-xl border border-slate-200 px-3 py-2 text-right tabular-nums text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
              />
              <span className="text-right text-xs font-semibold text-sky-700">
                {costPreview}
              </span>
            </label>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">진행률 (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={progressText}
                onChange={(event) => setProgressText(event.target.value)}
                disabled={status === "completed"}
                className="rounded-xl border border-slate-200 px-3 py-2 text-right tabular-nums text-slate-800 outline-none ring-sky-300 focus-visible:ring-2 disabled:bg-slate-50 disabled:text-slate-400"
              />
              {status === "completed" ? (
                <span className="text-xs text-slate-500">완료 상태는 100%로 계산됩니다.</span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">상태</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ConstructionStatus)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {CONSTRUCTION_STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                지연·정상은 일정 대비 실적으로 자동 표시됩니다.
              </span>
            </label>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            저장
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
