"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import {
  ASSIGNABLE_ROLE_LABELS,
  DEFAULT_RESET_PASSWORD,
  type AccountAdminRow,
} from "@/src/lib/account-admin";

export type AccountFormSubmit = {
  /** 신규 생성일 때만 사용 */
  username: string;
  fullName: string;
  roleLabel: string;
  primaryDeptId: string | null;
  extraDeptIds: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** null 이면 신규 생성 모드 */
  account: AccountAdminRow | null;
  mode: "create" | "edit";
  departments: Array<{ id: string; name: string }>;
  submitting: boolean;
  onSubmit: (input: AccountFormSubmit) => Promise<void>;
};

export function AccountAssignmentModal({
  isOpen,
  onClose,
  account,
  mode,
  departments,
  submitting,
  onSubmit,
}: Props) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleLabel, setRoleLabel] = useState<string>("프로");
  const [primaryDeptId, setPrimaryDeptId] = useState<string>("");
  const [extraDeptIds, setExtraDeptIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달을 열 때 대상 계정 값으로 폼을 초기화한다.
    setUsername(account?.username ?? "");
    setFullName(account?.fullName ?? "");
    setRoleLabel(account?.roleLabel ?? "프로");
    setPrimaryDeptId(account?.primaryDeptId ?? "");
    setExtraDeptIds(account?.extraDeptIds ?? []);
    setError("");
  }, [isOpen, account]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCreate = mode === "create";

  function toggleExtraDept(deptId: string) {
    setExtraDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  }

  async function handleSubmit() {
    if (isCreate && !username.trim()) {
      setError("계정 ID를 입력해 주세요.");
      return;
    }
    if (isCreate && username.includes("@")) {
      setError("계정 ID에는 @ 를 포함할 수 없습니다.");
      return;
    }
    if (!roleLabel) {
      setError("직급을 선택해 주세요.");
      return;
    }
    try {
      await onSubmit({
        username: username.trim(),
        fullName: fullName.trim(),
        roleLabel,
        primaryDeptId: primaryDeptId || null,
        extraDeptIds: extraDeptIds.filter((id) => id !== primaryDeptId),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isCreate ? "신규 계정 생성" : "계정 수정"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isCreate
                ? `초기 비밀번호는 ${DEFAULT_RESET_PASSWORD} 로 설정됩니다.`
                : `${account?.fullName?.trim() || account?.username} 계정의 직급과 소속을 변경합니다.`}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">
                계정 ID {isCreate ? <span className="text-red-600">*</span> : null}
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={!isCreate}
                placeholder="예: hong"
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2 disabled:bg-slate-50 disabled:text-slate-500"
              />
              {isCreate ? (
                <span className="text-xs text-slate-500">
                  로그인 계정은 {username.trim() ? `${username.trim().toLowerCase()}@ctst.local` : "{ID}@ctst.local"} 로 생성됩니다.
                </span>
              ) : (
                <span className="text-xs text-slate-500">계정 ID는 변경할 수 없습니다.</span>
              )}
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">이름</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={!isCreate}
                placeholder="예: 홍길동"
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">직급</span>
              <select
                value={roleLabel}
                onChange={(event) => setRoleLabel(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
              >
                {ASSIGNABLE_ROLE_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">주 소속 부서</span>
              <select
                value={primaryDeptId}
                onChange={(event) => {
                  const next = event.target.value;
                  setPrimaryDeptId(next);
                  setExtraDeptIds((prev) => prev.filter((id) => id !== next));
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
              >
                <option value="">미지정</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">겸직 부서 (복수 선택)</span>
            {departments.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                등록된 부서가 없습니다.
              </p>
            ) : (
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2 sm:grid-cols-2">
                {departments.map((dept) => {
                  const isPrimary = dept.id === primaryDeptId;
                  return (
                    <label
                      key={dept.id}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        isPrimary
                          ? "cursor-not-allowed text-slate-400"
                          : "cursor-pointer text-slate-800 hover:bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isPrimary || extraDeptIds.includes(dept.id)}
                        disabled={isPrimary}
                        onChange={() => toggleExtraDept(dept.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="min-w-0 truncate">
                        {dept.name}
                        {isPrimary ? " (주 소속)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <span className="text-xs text-slate-500">
              겸직 부서를 선택하면 해당 부서 KPI도 본인 부서처럼 등록·수정할 수 있습니다.
            </span>
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
            {isCreate ? "생성" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
