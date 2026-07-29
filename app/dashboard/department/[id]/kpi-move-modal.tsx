"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { DepartmentManageRow } from "@/src/lib/kpi-queries";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  currentDeptId: string;
  currentDeptName: string;
  departments: DepartmentManageRow[];
  departmentsLoading: boolean;
  selectedCount: number;
  submitting: boolean;
  onConfirm: (targetDeptId: string) => Promise<void>;
};

export function KpiMoveModal({
  isOpen,
  onClose,
  currentDeptId,
  currentDeptName,
  departments,
  departmentsLoading,
  selectedCount,
  submitting,
  onConfirm,
}: Props) {
  const [targetDeptId, setTargetDeptId] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달을 열 때 이전 선택값을 초기화한다.
    setTargetDeptId("");
  }, [isOpen]);

  if (!isOpen) return null;

  const targetOptions = departments.filter((d) => d.id !== currentDeptId);

  async function handleConfirm() {
    if (!targetDeptId) return;
    await onConfirm(targetDeptId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-sky-200 bg-white shadow-2xl">
        <div className="border-b border-sky-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">KPI 항목 이동</h3>
          <p className="mt-1 text-xs text-slate-500">
            {currentDeptName} · 선택한 {selectedCount}개 항목을 다른 부서 카드로 이동합니다.
          </p>
        </div>

        <div className="p-5">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            이동할 부서
          </label>
          {departmentsLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              부서 목록을 불러오는 중…
            </div>
          ) : targetOptions.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              이동할 수 있는 다른 부서가 없습니다.
            </p>
          ) : (
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              value={targetDeptId}
              onChange={(e) => setTargetDeptId(e.target.value)}
            >
              <option value="">부서를 선택해 주세요</option>
              {targetOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            이동 후에는 대상 부서 카드에서 가중치 합계를 다시 확인해 주세요.
          </p>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !targetDeptId}
            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "이동 중…" : "이동"}
          </button>
        </div>
      </div>
    </div>
  );
}
