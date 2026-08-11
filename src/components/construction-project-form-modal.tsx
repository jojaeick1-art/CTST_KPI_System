"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import {
  CONSTRUCTION_STATUS_LABELS,
  type ConstructionDomain,
  type ConstructionProject,
  type ConstructionStatus,
} from "@/src/lib/construction-projects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  domain: ConstructionDomain;
  editingProject: ConstructionProject | null;
  submitting: boolean;
  onSubmit: (input: {
    title: string;
    description: string;
    managerName: string;
    status: ConstructionStatus;
  }) => Promise<void>;
};

const STATUS_OPTIONS: ConstructionStatus[] = ["in_progress", "completed", "hold", "drop"];

export function ConstructionProjectFormModal({
  isOpen,
  onClose,
  domain,
  editingProject,
  submitting,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [managerName, setManagerName] = useState("");
  const [status, setStatus] = useState<ConstructionStatus>("in_progress");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달을 열 때 편집 대상 값으로 폼을 초기화한다.
    setTitle(editingProject?.title ?? "");
    setDescription(editingProject?.description ?? "");
    setManagerName(editingProject?.managerName ?? "");
    setStatus(editingProject?.status ?? "in_progress");
    setError("");
  }, [isOpen, editingProject]);

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
      setError(`${domain.labels.projectTitleColumn}을(를) 입력해 주세요.`);
      return;
    }
    try {
      await onSubmit({ title, description, managerName, status });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    }
  }

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
              {editingProject
                ? `${domain.labels.projectNoun} 수정`
                : `${domain.labels.projectNoun} 추가`}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {domain.hasCost
                ? `총 공사비용과 진행률은 ${domain.labels.taskColumnHeader}에서 자동 계산됩니다.`
                : `진행률은 ${domain.labels.taskColumnHeader}에서 자동 계산됩니다.`}
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
              제목 <span className="text-red-600">*</span>
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: CTST 2Campus 공사 일정"
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">세부내용</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="공사 범위·목적 등을 입력하세요."
              className="resize-y rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">담당자</span>
              <input
                value={managerName}
                onChange={(event) => setManagerName(event.target.value)}
                placeholder="담당자 이름"
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
              />
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
