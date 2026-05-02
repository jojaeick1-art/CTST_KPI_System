"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Loader2, Trash2, X } from "lucide-react";

import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { CtstUserProfileMenu } from "@/src/components/ctst-user-profile-menu";

import {
  useAppFeatureAvailability,
  useCreateKpiVocRequestMutation,
  useDashboardProfile,
  useDeleteKpiVocRequestMutation,
  useKpiVocRequests,
  useUpdateKpiVocOwnContentMutation,
  useUpdateKpiVocRequestMutation,
} from "@/src/hooks/useKpiQueries";

import type {
  KpiVocCategory,
  KpiVocPriority,
  KpiVocRequest,
  KpiVocStatus,
} from "@/src/lib/kpi-queries";

import { isAdminRole, roleLabelKo } from "@/src/lib/rbac";

const VOC_VIEW_SCOPE_STORAGE_KEY = "ctst-kpi-voc-view-scope";

type VocViewScope = "all" | "mine";

const CATEGORY_OPTIONS: Array<{ value: KpiVocCategory; label: string }> = [
  { value: "department", label: "부서 증설/변경" },

  { value: "permission", label: "계정 권한" },

  { value: "uiux", label: "UI/UX 변경" },

  { value: "calculation", label: "계산 변경" },

  { value: "data", label: "데이터/마스터" },

  { value: "approval", label: "승인/워크플로" },

  { value: "other", label: "기타" },
];

const PRIORITY_OPTIONS: Array<{ value: KpiVocPriority; label: string }> = [
  { value: "normal", label: "일반" },

  { value: "high", label: "중요" },

  { value: "urgent", label: "긴급" },
];

/** 접수 직후·관리 전 단계 (DB `submitted` / 레거시 `received`) */

function isVocPendingReceipt(status: KpiVocStatus): boolean {
  return status === "submitted" || status === "received";
}

function vocWorkflowLabel(status: KpiVocStatus): string {
  if (isVocPendingReceipt(status)) return "접수 대기";

  if (status === "in_progress") return "조치 진행 중";

  if (status === "done") return "적용 완료";

  if (status === "rejected") return "반려/보류";

  return status;
}

function statusBadgeClass(status: KpiVocStatus): string {
  if (status === "done")
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";

  if (status === "in_progress")
    return "bg-amber-50 text-amber-700 ring-amber-100";

  if (status === "rejected") return "bg-red-50 text-red-700 ring-red-100";

  return "bg-slate-50 text-slate-700 ring-slate-200";
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200/60 disabled:bg-slate-100";

function labelFor<T extends string>(
  options: Array<{ value: T; label: string }>,

  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",

    day: "2-digit",

    hour: "2-digit",

    minute: "2-digit",
  }).format(date);
}

/** 접수 VOC 목록 줄: `04. 28. / 19:42 / 부서 / 작성자` */
function formatVocListMeta(item: KpiVocRequest): string {
  const date = new Date(item.createdAt);
  if (Number.isNaN(date.getTime())) return "-";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  const datePart = `${month}. ${day}.`;
  const timePart = `${hours}:${minutes}`;
  const deptPart = item.deptName?.trim() || "—";
  const namePart =
    item.createdByName?.trim() && item.createdByName.trim() !== "-"
      ? item.createdByName.trim()
      : "—";

  return `${datePart} / ${timePart} / ${deptPart} / ${namePart}`;
}

function displayNameFromVocSession(
  profileFullName: string | null | undefined,
  username: string,
  userMetadata: Record<string, unknown> | undefined
): string {
  const profileName =
    typeof profileFullName === "string" ? profileFullName.trim() : "";
  if (profileName) return profileName;
  const full =
    typeof userMetadata?.full_name === "string"
      ? userMetadata.full_name
      : typeof userMetadata?.name === "string"
        ? userMetadata.name
        : typeof userMetadata?.display_name === "string"
          ? userMetadata.display_name
          : null;
  const t = full?.trim();
  if (t) return t;
  return username;
}

function VocDetailModal({
  item,

  open,

  onClose,

  isAdmin,

  profileUserId,

  updateMutation,

  updateOwnMutation,

  deleteMutation,

  onToast,
}: {
  item: KpiVocRequest | null;

  open: boolean;

  onClose: () => void;

  isAdmin: boolean;

  profileUserId: string | null;

  updateMutation: ReturnType<typeof useUpdateKpiVocRequestMutation>;

  updateOwnMutation: ReturnType<typeof useUpdateKpiVocOwnContentMutation>;

  deleteMutation: ReturnType<typeof useDeleteKpiVocRequestMutation>;

  onToast: (tone: "success" | "error", text: string) => void;
}) {
  const [draftNote, setDraftNote] = useState("");
  const [editCategory, setEditCategory] = useState<KpiVocCategory>("uiux");
  const [editPriority, setEditPriority] = useState<KpiVocPriority>("normal");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [modalFeedback, setModalFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [ownEditing, setOwnEditing] = useState(false);

  useEffect(() => {
    if (!item) return;
    setDraftNote(item.adminNote ?? "");
    setEditCategory(item.category);
    setEditPriority(item.priority);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setModalFeedback(null);
  }, [
    item?.id,
    item?.adminNote,
    item?.category,
    item?.priority,
    item?.title,
    item?.description,
    open,
  ]);

  useEffect(() => {
    setOwnEditing(false);
  }, [item?.id, open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const vocLocal = item;
      const isOwn =
        Boolean(profileUserId && vocLocal?.createdBy === profileUserId) &&
        !isAdmin;
      if (isOwn && ownEditing) {
        e.preventDefault();
        if (vocLocal) {
          setEditCategory(vocLocal.category);
          setEditPriority(vocLocal.priority);
          setEditTitle(vocLocal.title);
          setEditDescription(vocLocal.description);
        }
        setOwnEditing(false);
        setModalFeedback(null);
        return;
      }
      onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, item, profileUserId, isAdmin, ownEditing]);

  if (!open || !item) return null;

  const voc = item;

  const showOwnEditor =
    Boolean(profileUserId && voc.createdBy === profileUserId) && !isAdmin;

  async function saveWithStatus(next: KpiVocStatus) {
    try {
      await updateMutation.mutateAsync({
        id: voc.id,

        status: next,

        adminNote: draftNote.trim() || null,
      });

      const ok = "저장되었습니다.";
      setModalFeedback({ tone: "success", text: ok });
      onToast("success", ok);
    } catch (error) {
      const err =
        error instanceof Error ? error.message : "저장에 실패했습니다.";
      setModalFeedback({ tone: "error", text: err });
      onToast("error", err);
    }
  }

  async function saveOwnEdits() {
    try {
      await updateOwnMutation.mutateAsync({
        id: voc.id,
        category: editCategory,
        priority: editPriority,
        title: editTitle,
        description: editDescription,
      });
      const ok = "수정 내용이 저장되었습니다.";
      setOwnEditing(false);
      setModalFeedback({ tone: "success", text: ok });
      onToast("success", ok);
    } catch (error) {
      const err =
        error instanceof Error ? error.message : "저장에 실패했습니다.";
      setModalFeedback({ tone: "error", text: err });
      onToast("error", err);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "이 VOC 접수를 삭제할까요? 삭제 후에는 복구할 수 없습니다.",
      )
    ) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(voc.id);
      onToast("success", "VOC가 삭제되었습니다.");
      onClose();
    } catch (error) {
      const err =
        error instanceof Error ? error.message : "삭제에 실패했습니다.";
      setModalFeedback({ tone: "error", text: err });
      onToast("error", err);
    }
  }

  const pending = isVocPendingReceipt(voc.status);

  const inProgress = voc.status === "in_progress";

  const terminal = voc.status === "done" || voc.status === "rejected";

  const adminNoteBlock = (
    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold text-slate-600">관리자 답변</p>
      {voc.adminNote ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
          {voc.adminNote}
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          등록된 관리자 답변이 없습니다.
        </p>
      )}
    </div>
  );

  function cancelOwnEdit() {
    setEditCategory(voc.category);
    setEditPriority(voc.priority);
    setEditTitle(voc.title);
    setEditDescription(voc.description);
    setOwnEditing(false);
    setModalFeedback(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-sky-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voc-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            {showOwnEditor && ownEditing ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold text-sky-700">
                    내 VOC 수정 중
                  </p>
                  <span
                    className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(
                      voc.status,
                    )}`}
                  >
                    {vocWorkflowLabel(voc.status)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {formatDate(voc.createdAt)}
                  {voc.deptName ? ` · ${voc.deptName}` : ""}
                  {voc.createdByName ? ` · ${voc.createdByName}` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-sky-700">
                  {labelFor(CATEGORY_OPTIONS, voc.category)} ·{" "}
                  {labelFor(PRIORITY_OPTIONS, voc.priority)}
                </p>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <h2
                    id="voc-modal-title"
                    className="min-w-0 flex-1 text-lg font-bold leading-snug text-slate-900"
                  >
                    {voc.title}
                  </h2>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(
                        voc.status,
                      )}`}
                    >
                      {vocWorkflowLabel(voc.status)}
                    </span>
                    {showOwnEditor ? (
                      <button
                        type="button"
                        onClick={() => setOwnEditing(true)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
                      >
                        수정
                      </button>
                    ) : null}
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  {formatDate(voc.createdAt)}
                  {voc.deptName ? ` · ${voc.deptName}` : ""}
                  {voc.createdByName ? ` · ${voc.createdByName}` : ""}
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {showOwnEditor && ownEditing ? (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  유형
                </span>
                <select
                  className={inputClass}
                  value={editCategory}
                  onChange={(e) =>
                    setEditCategory(e.target.value as KpiVocCategory)
                  }
                  disabled={updateOwnMutation.isPending}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  우선순위
                </span>
                <select
                  className={inputClass}
                  value={editPriority}
                  onChange={(e) =>
                    setEditPriority(e.target.value as KpiVocPriority)
                  }
                  disabled={updateOwnMutation.isPending}
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                제목
              </span>
              <input
                className={inputClass}
                maxLength={120}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={updateOwnMutation.isPending}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                상세 내용
              </span>
              <textarea
                className={`${inputClass} min-h-36 resize-y`}
                maxLength={4000}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={updateOwnMutation.isPending}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={updateOwnMutation.isPending}
                onClick={() => void saveOwnEdits()}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {updateOwnMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                저장
              </button>
              <button
                type="button"
                disabled={updateOwnMutation.isPending}
                onClick={cancelOwnEdit}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`mt-4 rounded-xl border bg-white p-4 shadow-sm ring-1 ring-sky-200/90 ${
              isAdmin ? "border-sky-200" : "border-slate-100 bg-slate-50/70 ring-0"
            }`}
          >
            <p
              className={`text-xs font-semibold ${isAdmin ? "text-sky-800" : "text-slate-600"}`}
            >
              상세 내용
            </p>

            <p
              className={`mt-3 overflow-y-auto whitespace-pre-wrap text-slate-900 ${
                isAdmin
                  ? "min-h-[7rem] max-h-80 text-[15px] leading-relaxed"
                  : "max-h-52 text-sm leading-6"
              }`}
            >
              {voc.description}
            </p>
          </div>
        )}

        {isAdmin ? (
          <div className="mt-3 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 shadow-sm">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                관리자 답변
              </span>

              <textarea
                rows={2}
                className={`${inputClass} max-h-36 min-h-[3.25rem] resize-y py-2 leading-snug`}
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="짧게 입력해도 됩니다."
                disabled={updateMutation.isPending}
                maxLength={4000}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={updateMutation.isPending}
                  onClick={() => void saveWithStatus(voc.status)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  답변 저장
                </button>

                {pending ? (
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() => void saveWithStatus("in_progress")}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    조치 진행 중
                  </button>
                ) : null}

                {inProgress ? (
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() => void saveWithStatus("done")}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    적용 완료
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                disabled={deleteMutation.isPending || updateMutation.isPending}
                onClick={() => void handleDelete()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
                VOC 삭제
              </button>
            </div>

            {terminal ? (
              <p className="text-xs text-slate-500">
                {voc.status === "done"
                  ? "이 VOC는 적용 완료되었습니다. 답변만 수정할 수 있습니다."
                  : "반려/보류된 건입니다. 답변만 수정할 수 있습니다."}
              </p>
            ) : null}

            {modalFeedback ? (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  modalFeedback.tone === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {modalFeedback.text}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {adminNoteBlock}
            {modalFeedback ? (
              <p
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                  modalFeedback.tone === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {modalFeedback.text}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function VocListRow({
  item,

  onSelect,
}: {
  item: KpiVocRequest;

  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-slate-300 focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-200/60"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {item.title}
        </p>

        <p className="mt-1 text-xs text-slate-500">{formatVocListMeta(item)}</p>
      </div>

      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(
          item.status,
        )}`}
      >
        {vocWorkflowLabel(item.status)}
      </span>
    </button>
  );
}

export function VocPlaceholderContent() {
  const profileQ = useDashboardProfile();

  const featureQ = useAppFeatureAvailability(
    profileQ.isSuccess && profileQ.data !== null,
  );

  const isAdmin = isAdminRole(profileQ.data?.profile.role);

  const vocEnabled = featureQ.data?.voc ?? false;

  const kpiEnabled = featureQ.data?.kpi ?? false;

  const canAccessVoc = isAdmin || vocEnabled || kpiEnabled;

  const vocQuery = useKpiVocRequests(
    profileQ.isSuccess && profileQ.data !== null && canAccessVoc,
  );

  const createMutation = useCreateKpiVocRequestMutation();

  const updateMutation = useUpdateKpiVocRequestMutation();

  const updateOwnMutation = useUpdateKpiVocOwnContentMutation();

  const deleteMutation = useDeleteKpiVocRequestMutation();

  const [category, setCategory] = useState<KpiVocCategory>("uiux");

  const [priority, setPriority] = useState<KpiVocPriority>("normal");

  const [title, setTitle] = useState("");

  const [description, setDescription] = useState("");

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [vocViewScope, setVocViewScope] = useState<VocViewScope>("all");

  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(VOC_VIEW_SCOPE_STORAGE_KEY)
          : null;
      if (raw === "mine" || raw === "all") setVocViewScope(raw);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOC_VIEW_SCOPE_STORAGE_KEY, vocViewScope);
    } catch {
      /* ignore */
    }
  }, [vocViewScope]);

  const profileId = profileQ.data?.profile?.id ?? null;

  const allVocs = vocQuery.data ?? [];

  const displayedVocs = useMemo(() => {
    if (!profileId || vocViewScope === "all") return allVocs;
    return allVocs.filter((r) => r.createdBy === profileId);
  }, [allVocs, vocViewScope, profileId]);

  const vocCounts = useMemo(() => {
    const rows = displayedVocs;
    return {
      total: rows.length,
      registered: rows.filter((r) => isVocPendingReceipt(r.status)).length,
      inProgress: rows.filter((r) => r.status === "in_progress").length,
      done: rows.filter((r) => r.status === "done").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
    };
  }, [displayedVocs]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;

    return allVocs.find((r) => r.id === selectedId) ?? null;
  }, [allVocs, selectedId]);

  if (profileQ.isPending || featureQ.isPending) {
    return (
      <CtstPortalShell>
        <div className="flex min-h-full items-center justify-center px-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
        </div>
      </CtstPortalShell>
    );
  }

  if (!profileQ.data) {
    return (
      <CtstPortalShell>
        <div className="flex min-h-full items-center justify-center px-4 py-16">
          <p className="text-sm text-slate-600">프로필 정보를 불러오지 못했습니다.</p>
        </div>
      </CtstPortalShell>
    );
  }

  const ctx = profileQ.data;
  const profile = ctx.profile;
  const displayName = displayNameFromVocSession(
    profile.full_name,
    profile.username,
    ctx.session.user.user_metadata as Record<string, unknown> | undefined
  );
  const role = profile.role;

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!profile) return;

    setMessage(null);

    try {
      await createMutation.mutateAsync({
        profile,

        category,

        priority,

        title,

        description,
      });

      setTitle("");

      setDescription("");

      setPriority("normal");

      setMessage({
        tone: "success",
        text: "VOC가 접수 대기 상태로 등록되었습니다.",
      });
    } catch (error) {
      setMessage({
        tone: "error",

        text:
          error instanceof Error ? error.message : "VOC 접수에 실패했습니다.",
      });
    }
  }

  return (
    <CtstPortalShell>
      <>
        {canAccessVoc ? (
          <header className="border-b border-sky-200 bg-white/80 px-4 backdrop-blur-sm sm:px-8">
            <div className="flex min-h-[95px] flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                  VOC
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  운영 개선 요청을 접수하고 처리 현황을 확인합니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <CtstUserProfileMenu
                  displayName={displayName}
                  roleLabel={roleLabelKo(role)}
                  profileUsername={profile.username}
                  userId={ctx.session.user.id}
                  notificationsEnabled={canAccessVoc}
                />
              </div>
            </div>
          </header>
        ) : null}

        <div
          className={
            canAccessVoc
              ? "px-4 py-6 sm:p-8"
              : "flex min-h-full flex-col items-center justify-center px-4 py-16"
          }
        >
          <div className="w-full min-w-0">
            {!canAccessVoc ? (
              <div className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-8 text-center shadow-lg shadow-sky-100/50">
              <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                관리자 잠금 상태
              </p>

              <p className="mt-3 text-sm text-slate-600">
                관리자 설정에서 공개되면 이 메뉴를 이용할 수 있습니다.
              </p>
            </div>
            ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {(
                  [
                    {
                      key: "total",
                      label: "전체",
                      hint: "건수",
                      value: vocCounts.total,
                      valueClass: "text-slate-800",
                    },
                    {
                      key: "registered",
                      label: "등록",
                      hint: "접수·대기",
                      value: vocCounts.registered,
                      valueClass: "text-sky-700",
                    },
                    {
                      key: "progress",
                      label: "조치 진행 중",
                      hint: "진행",
                      value: vocCounts.inProgress,
                      valueClass: "text-amber-700",
                    },
                    {
                      key: "done",
                      label: "완료",
                      hint: "적용 완료",
                      value: vocCounts.done,
                      valueClass: "text-emerald-700",
                    },
                    {
                      key: "rejected",
                      label: "반려",
                      hint: "반려·보류",
                      value: vocCounts.rejected,
                      valueClass: "text-red-700",
                    },
                  ] as const
                ).map((card) => (
                  <div
                    key={card.key}
                    className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0"
                  >
                    <p className="text-xs font-medium text-slate-500">{card.label}</p>
                    <p
                      className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${card.valueClass}`}
                    >
                      {vocQuery.isPending ? "—" : card.value}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{card.hint}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
                <div className="min-w-0 flex flex-col">
                  <div className="flex flex-1 flex-col rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
                    <form
                      className="flex flex-1 flex-col"
                      onSubmit={(e) => void handleCreate(e)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 sm:py-4">
                        <h2 className="text-base font-semibold text-slate-800">VOC 접수</h2>
                        <button
                          type="submit"
                          disabled={createMutation.isPending}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-700 disabled:opacity-60"
                        >
                          {createMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                              접수 중…
                            </>
                          ) : (
                            "VOC 접수"
                          )}
                        </button>
                      </div>
                      <div className="space-y-4 p-4 sm:p-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-medium text-slate-500">
                              유형
                            </span>

                            <select
                              className={inputClass}
                              value={category}
                              onChange={(e) =>
                                setCategory(e.target.value as KpiVocCategory)
                              }
                            >
                              {CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-xs font-medium text-slate-500">
                              우선순위
                            </span>

                            <select
                              className={inputClass}
                              value={priority}
                              onChange={(e) =>
                                setPriority(e.target.value as KpiVocPriority)
                              }
                            >
                              {PRIORITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500">
                          제목
                        </span>

                        <input
                          className={inputClass}
                          maxLength={120}
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="예: KPI 달성률 계산 기준 확인 요청"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500">
                          상세 내용
                        </span>

                        <textarea
                          className={`${inputClass} min-h-36 resize-y`}
                          maxLength={4000}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="요청 배경, 현재 문제, 기대하는 변경 내용을 적어 주세요."
                        />
                      </label>
                      </div>

                    {message ? (
                      <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
                        <p
                          className={`rounded-xl px-3 py-2.5 text-sm ${
                            message.tone === "success"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-red-50 text-red-800"
                          }`}
                        >
                          {message.text}
                        </p>
                      </div>
                    ) : null}
                    </form>
                  </div>
                </div>

                <div className="min-w-0 flex flex-col">
                  <div className="flex flex-1 flex-col rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 sm:py-4">
                      <h2 className="text-base font-semibold text-slate-800">
                        {vocViewScope === "mine" ? "내 VOC 목록" : "접수 VOC 목록"}
                      </h2>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <div
                          className="inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-0.5 text-xs font-semibold shadow-sm"
                          role="group"
                          aria-label="목록 보기 범위"
                        >
                          <button
                            type="button"
                            onClick={() => setVocViewScope("all")}
                            aria-pressed={vocViewScope === "all"}
                            className={`rounded-lg px-3 py-1.5 transition ${
                              vocViewScope === "all"
                                ? "bg-white text-slate-900 shadow-sm ring-1 ring-sky-200/80"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            모든 VOC
                          </button>
                          <button
                            type="button"
                            onClick={() => setVocViewScope("mine")}
                            aria-pressed={vocViewScope === "mine"}
                            className={`rounded-lg px-3 py-1.5 transition ${
                              vocViewScope === "mine"
                                ? "bg-white text-slate-900 shadow-sm ring-1 ring-sky-200/80"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            내 VOC만
                          </button>
                        </div>

                        {vocQuery.isFetching ? (
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin text-sky-600"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    </div>

                    <div className="flex-1 p-4 sm:p-5">
                    {vocQuery.isPending ? (
                      <div className="py-12 text-center">
                        <Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-600" />
                        <p className="mt-2 text-sm text-slate-500">목록 불러오는 중…</p>
                      </div>
                    ) : vocQuery.isError ? (
                      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {vocQuery.error instanceof Error
                          ? vocQuery.error.message
                          : "VOC 목록을 불러오지 못했습니다."}
                      </div>
                    ) : allVocs.length === 0 ? (
                      <p className="py-10 text-center text-sm text-slate-500">
                        등록된 VOC가 없습니다.
                      </p>
                    ) : displayedVocs.length === 0 ? (
                      <p className="py-10 text-center text-sm text-slate-500">
                        표시할 내 VOC가 없습니다. 상단에서「모든 VOC」를 선택해
                        보세요.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {displayedVocs.map((item) => (
                          <VocListRow
                            key={item.id}
                            item={item}
                            onSelect={() => setSelectedId(item.id)}
                          />
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>

        <VocDetailModal
          item={selectedItem}
          open={selectedId !== null && selectedItem !== null}
          onClose={() => setSelectedId(null)}
          isAdmin={isAdmin}
          profileUserId={profile.id}
          updateMutation={updateMutation}
          updateOwnMutation={updateOwnMutation}
          deleteMutation={deleteMutation}
          onToast={(tone, text) => setMessage({ tone, text })}
        />
      </>
    </CtstPortalShell>
  );
}
