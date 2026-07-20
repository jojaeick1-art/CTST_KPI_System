"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  buildDefaultApprovalLine,
  type ApprovalLineStep,
  type ApprovalCandidateProfile,
} from "@/src/lib/kpi-queries";
import {
  useApprovalCandidateProfiles,
  useDeleteApprovalLineTemplateMutation,
  useMyApprovalLineTemplates,
  useSaveApprovalLineTemplateMutation,
} from "@/src/hooks/useKpiQueries";

type Props = {
  open: boolean;
  actorRole: string | null | undefined;
  kpiItemId: string;
  onCancel: () => void;
  onConfirm: (line: ApprovalLineStep[]) => void;
};

export function ApprovalLineSelectModal({
  open,
  actorRole,
  kpiItemId,
  onCancel,
  onConfirm,
}: Props) {
  const candidatesQuery = useApprovalCandidateProfiles(open);
  const templatesQuery = useMyApprovalLineTemplates(open);
  const saveTemplateMut = useSaveApprovalLineTemplateMutation();
  const deleteTemplateMut = useDeleteApprovalLineTemplateMutation();

  const [line, setLine] = useState<ApprovalLineStep[]>([]);
  const [defaultLine, setDefaultLine] = useState<ApprovalLineStep[]>([]);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [search, setSearch] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingDefault(true);
    setError(null);
    setSearch("");
    setTemplateName("");
    void buildDefaultApprovalLine({
      actorRole,
      kpiItemId,
    })
      .then((built) => {
        if (cancelled) return;
        setDefaultLine(built);
        setLine(built);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "기본 결재선을 불러오지 못했습니다.");
        setDefaultLine([]);
        setLine([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDefault(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, actorRole, kpiItemId]);

  const candidates = candidatesQuery.data ?? [];
  const templates = templatesQuery.data ?? [];

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const hay = `${c.deptName} ${c.fullName} ${c.roleLabel} ${c.username}`.toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, search]);

  const lineIds = useMemo(
    () => new Set(line.map((s) => s.user_id)),
    [line]
  );

  function addCandidate(c: ApprovalCandidateProfile) {
    if (lineIds.has(c.id)) return;
    setLine((prev) => [
      ...prev,
      {
        user_id: c.id,
        full_name: c.fullName,
        role: c.role,
        dept_name: c.deptName,
      },
    ]);
  }

  function removeAt(index: number) {
    setLine((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    setLine((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  }

  function applyTemplate(approverIds: string[]) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const next: ApprovalLineStep[] = [];
    for (const id of approverIds) {
      const c = byId.get(id);
      if (!c) continue;
      next.push({
        user_id: c.id,
        full_name: c.fullName,
        role: c.role,
        dept_name: c.deptName,
      });
    }
    setLine(next);
  }

  async function handleSaveTemplate() {
    setError(null);
    try {
      await saveTemplateMut.mutateAsync({
        name: templateName,
        approverIds: line.map((s) => s.user_id),
      });
      setTemplateName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "템플릿 저장에 실패했습니다.");
    }
  }

  if (!open) return null;

  const busy =
    loadingDefault ||
    candidatesQuery.isLoading ||
    templatesQuery.isLoading ||
    saveTemplateMut.isPending ||
    deleteTemplateMut.isPending;

  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-line-modal-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h4
            id="approval-line-modal-title"
            className="text-base font-semibold text-slate-900"
          >
            결재라인 선택
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            기본값은 부서·직책 기준(그룹장 → 팀장)입니다. 결재자를 추가·순서 변경하거나
            저장한 결재라인을 불러올 수 있습니다. 결재자가 없으면 즉시 승인됩니다.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">이번 결재라인</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setLine(defaultLine)}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                기본값으로 되돌리기
              </button>
            </div>
            {line.length === 0 ? (
              <p className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                결재자 없음 → 저장 시 즉시 승인됩니다.
              </p>
            ) : (
              <ol className="space-y-2">
                {line.map((step, index) => (
                  <li
                    key={`${step.user_id}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2"
                  >
                    <span className="w-6 shrink-0 text-center text-xs font-bold text-sky-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {step.full_name || "—"}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {step.dept_name || "—"} · {step.role || "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === line.length - 1}
                      className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      className="rounded border border-red-200 px-1.5 py-0.5 text-[11px] text-red-700"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700">
              저장한 결재라인 (본인 전용)
            </p>
            {templates.length === 0 ? (
              <p className="text-xs text-slate-500">저장된 결재라인이 없습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => applyTemplate(t.approverIds)}
                      className="min-w-0 flex-1 text-left text-sm font-medium text-sky-800 hover:underline"
                    >
                      {t.name}
                      <span className="ml-2 text-[11px] font-normal text-slate-500">
                        ({t.approverIds.length}명)
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={deleteTemplateMut.isPending}
                      onClick={() => void deleteTemplateMut.mutateAsync(t.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="템플릿 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="결재라인 이름"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
              <button
                type="button"
                disabled={busy || !templateName.trim() || line.length === 0}
                onClick={() => void handleSaveTemplate()}
                className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                현재 라인 저장
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">사용자 추가</p>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="부서·이름·직급 검색"
                className="w-48 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-sky-500"
              />
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">부서</th>
                    <th className="px-3 py-2 font-semibold">이름</th>
                    <th className="px-3 py-2 font-semibold">직급</th>
                    <th className="px-3 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((c) => {
                    const added = lineIds.has(c.id);
                    return (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{c.deptName}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-900">
                          {c.fullName}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">{c.roleLabel}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            disabled={added}
                            onClick={() => addCandidate(c)}
                            className="rounded border border-sky-200 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-40"
                          >
                            {added ? "추가됨" : "추가"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(line)}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            이 결재라인으로 저장
          </button>
        </div>
      </div>
    </div>
  );
}
