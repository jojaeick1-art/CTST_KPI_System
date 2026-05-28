"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, Plus, Save, Trash2, X } from "lucide-react";
import { useDashboardProfile } from "@/src/hooks/useKpiQueries";
import { canAccessInvestmentDashboard, canEditInvestmentDashboard } from "@/src/lib/rbac";
import {
  createInvestmentProject,
  createInvestmentStageColumn,
  deleteInvestmentEvidenceFile,
  deleteInvestmentStageColumn,
  deleteInvestmentProject,
  getInvestmentEvidenceSignedUrl,
  listInvestmentDashboardBundle,
  renameInvestmentStageColumn,
  type InvestmentDashboardBundle,
  type InvestmentStageEntry,
  updateInvestmentProject,
  uploadInvestmentEvidenceFile,
  upsertInvestmentStageEntry,
} from "@/src/lib/investment-dashboard";
import { notifyWidgetUploadToTest } from "@/src/lib/kpi-web-bridge";

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  tone?: "default" | "danger";
  onConfirm?: () => void;
};

type AddDialogState = {
  open: boolean;
  mode: "create" | "edit";
  targetProjectId: string | null;
  itemName: string;
  detail: string;
  amountKKrw: string;
  deptName: string;
  ownerName: string;
  stageTemplates: Array<{
    stageColumnId?: string;
    name: string;
    planDate: string;
    namePlaceholder?: string;
  }>;
};

const inputBaseClass =
  "rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400";

function DateCardInput({
  value,
  placeholder = "연도-월-일",
  onChange,
  disabled,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`relative h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-left text-sm ${
        value ? "text-slate-900" : "text-slate-400"
      }`}
      onClick={(e) => {
        const input = e.currentTarget.querySelector("input");
        if (!input) return;
        if (typeof (input as HTMLInputElement).showPicker === "function") {
          (input as HTMLInputElement).showPicker();
          return;
        }
        (input as HTMLInputElement).focus();
      }}
    >
      {value || placeholder}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        tabIndex={-1}
      />
    </button>
  );
}

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: () => void;
}) {
  if (!state.open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">{state.title}</h3>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{state.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              const fn = state.onConfirm;
              onClose();
              fn?.();
            }}
            className={`rounded-md px-3 py-1.5 text-sm text-white ${
              state.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function parseDateCompact(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replaceAll("-", "").slice(2);
}

function formatAmountWithCommas(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

function parseAmountFromInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const num = Number(digits);
  return Number.isFinite(num) ? num : null;
}

function formatEok(value: number | null | undefined): string {
  if (!value || value <= 0) return "0.00억";
  const eok = value / 100_000_000;
  return `${eok.toFixed(2)}억`;
}

function createEmptyAddDialogState(open = false): AddDialogState {
  return {
    open,
    mode: "create",
    targetProjectId: null,
    itemName: "",
    detail: "",
    amountKKrw: "",
    deptName: "",
    ownerName: "",
    stageTemplates: [
      { name: "", planDate: "", namePlaceholder: "PO" },
      { name: "", planDate: "", namePlaceholder: "입고" },
      { name: "", planDate: "", namePlaceholder: "양산" },
      { name: "", planDate: "", namePlaceholder: "적용" },
      { name: "", planDate: "", namePlaceholder: "완료" },
    ],
  };
}

const INVESTMENT_DEPARTMENTS = [
  {
    label: "CTST",
    options: ["기술 1팀", "기술 2팀", "R&D 센터", "제조팀", "품질팀"],
  },
  {
    label: "RAmos",
    options: ["RAmos"],
  },
] as const;

function progressForProject(
  projectId: string,
  stageColumnIds: string[],
  entryMap: Map<string, InvestmentStageEntry>
): number {
  if (stageColumnIds.length === 0) return 0;
  let done = 0;
  for (const stageColumnId of stageColumnIds) {
    const entry = entryMap.get(`${projectId}:${stageColumnId}`);
    if (entry?.actualDate) done += 1;
  }
  return Math.round((done / stageColumnIds.length) * 100);
}

function statusForPlanActual(
  planDate: string | null | undefined,
  actualDate: string | null | undefined
): "달성" | "지연" | "-" {
  if (!planDate || !actualDate) return "-";
  return actualDate <= planDate ? "달성" : "지연";
}

export function InvestmentDashboardClient() {
  const profileQ = useDashboardProfile();
  const role = profileQ.data?.profile.role ?? "";
  const canEdit = canEditInvestmentDashboard(role);
  const canAccess = canAccessInvestmentDashboard(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bundle, setBundle] = useState<InvestmentDashboardBundle>({
    projects: [],
    stageColumns: [],
    entries: [],
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedStageColumnId, setSelectedStageColumnId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
  });
  const [addDialog, setAddDialog] = useState<AddDialogState>(
    createEmptyAddDialogState(false)
  );

  const [projectDraft, setProjectDraft] = useState({
    itemName: "",
    amountKKrw: "",
    deptName: "",
    ownerName: "",
    detail: "",
  });
  const [progressDraft, setProgressDraft] = useState<string>("");
  const [evidenceActionKey, setEvidenceActionKey] = useState<string | null>(null);

  const loadBundle = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInvestmentDashboardBundle();
      setBundle(data);
      setSelectedProjectId((prev) =>
        prev && data.projects.some((p) => p.id === prev) ? prev : null
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "투자 데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profileQ.isSuccess || !canAccess) return;
    void loadBundle();
  }, [profileQ.isSuccess, canAccess, loadBundle]);

  const entryMap = useMemo(() => {
    const map = new Map<string, InvestmentStageEntry>();
    for (const entry of bundle.entries) map.set(`${entry.projectId}:${entry.stageColumnId}`, entry);
    return map;
  }, [bundle.entries]);

  const selectedProject = useMemo(
    () => bundle.projects.find((p) => p.id === selectedProjectId) ?? null,
    [bundle.projects, selectedProjectId]
  );
  const isOwnerOfSelectedProject = useMemo(() => {
    if (!selectedProject) return false;
    const username = profileQ.data?.profile.username?.trim() ?? "";
    const fullName = profileQ.data?.profile.full_name?.trim() ?? "";
    const owner = (selectedProject.ownerName ?? "").trim();
    return owner.length > 0 && (owner === username || owner === fullName);
  }, [selectedProject, profileQ.data?.profile.username, profileQ.data?.profile.full_name]);
  const selectedProjectColumns = useMemo(
    () =>
      selectedProject
        ? bundle.stageColumns
            .filter((c) => c.projectId === selectedProject.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [bundle.stageColumns, selectedProject]
  );

  useEffect(() => {
    if (!selectedProject) return;
    setProjectDraft({
      itemName: selectedProject.itemName,
      amountKKrw:
        selectedProject.amountKKrw == null
          ? ""
          : formatAmountWithCommas(String(selectedProject.amountKKrw)),
      deptName: selectedProject.deptName ?? "",
      ownerName: selectedProject.ownerName ?? "",
      detail: selectedProject.detail ?? "",
    });
    setProgressDraft(
      selectedProject.progressRate == null ? "" : String(selectedProject.progressRate)
    );
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProjectColumns.length) {
      setSelectedStageColumnId(null);
      return;
    }
    setSelectedStageColumnId((prev) =>
      prev && selectedProjectColumns.some((c) => c.id === prev)
        ? prev
        : selectedProjectColumns[0]!.id
    );
  }, [selectedProjectColumns]);

  const evidenceRows = useMemo(() => {
    if (!selectedProject) return [];
    return selectedProjectColumns
      .map((stage) => {
        const entry = entryMap.get(`${selectedProject.id}:${stage.id}`);
        if (!entry?.evidenceStoragePath) return null;
        return {
          stageColumnId: stage.id,
          stageName: stage.name,
          fileName: entry.evidenceFileName || "증빙파일",
          storagePath: entry.evidenceStoragePath,
          actualDate: entry.actualDate,
        };
      })
      .filter(
        (
          v
        ): v is {
          stageColumnId: string;
          stageName: string;
          fileName: string;
          storagePath: string;
          actualDate: string | null;
        } => v != null
      );
  }, [selectedProject, selectedProjectColumns, entryMap]);

  const stageColumnIdsByProject = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const project of bundle.projects) {
      map.set(
        project.id,
        bundle.stageColumns
          .filter((c) => c.projectId === project.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => c.id)
      );
    }
    return map;
  }, [bundle.projects, bundle.stageColumns]);

  const overview = useMemo(() => {
    const totalProjects = bundle.projects.length;
    const totalAmount = bundle.projects.reduce(
      (acc, p) => acc + (p.amountKKrw ?? 0),
      0
    );
    const progresses = bundle.projects.map((p) =>
      p.progressRate ??
      progressForProject(p.id, stageColumnIdsByProject.get(p.id) ?? [], entryMap)
    );
    const totalSteps = Array.from(stageColumnIdsByProject.values()).reduce(
      (acc, ids) => acc + ids.length,
      0
    );
    let completedSteps = 0;
    for (const project of bundle.projects) {
      const ids = stageColumnIdsByProject.get(project.id) ?? [];
      for (const id of ids) {
        const entry = entryMap.get(`${project.id}:${id}`);
        if (entry?.actualDate) completedSteps += 1;
      }
    }
    const overallProgress =
      progresses.length === 0
        ? 0
        : Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length);
    const completedCount = progresses.filter((v) => v >= 100).length;
    return { totalProjects, totalAmount, overallProgress, completedCount };
  }, [bundle.projects, stageColumnIdsByProject, entryMap]);

  const saveProject = useCallback(async () => {
    if (!selectedProject) return;
    setSaving(true);
    try {
      const amount = parseAmountFromInput(projectDraft.amountKKrw);
      await updateInvestmentProject({
        id: selectedProject.id,
        itemName: projectDraft.itemName,
        amountKKrw: amount,
        deptName: projectDraft.deptName || null,
        ownerName: projectDraft.ownerName || null,
        detail: projectDraft.detail || null,
        progressRate:
          progressDraft.trim() === ""
            ? null
            : Math.max(0, Math.min(100, Number(progressDraft) || 0)),
      });
      await loadBundle();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "항목 저장 실패");
    } finally {
      setSaving(false);
    }
  }, [selectedProject, projectDraft, loadBundle]);

  const saveEntryField = useCallback(
    async (input: {
      stageColumnId: string;
      planDate?: string | null;
      actualDate?: string | null;
      evidenceStoragePath?: string | null;
      evidenceFileName?: string | null;
    }) => {
      if (!selectedProject) return;
      const prev = entryMap.get(`${selectedProject.id}:${input.stageColumnId}`);
      try {
        await upsertInvestmentStageEntry({
          projectId: selectedProject.id,
          stageColumnId: input.stageColumnId,
          planDate:
            "planDate" in input ? (input.planDate ?? null) : (prev?.planDate ?? null),
          actualDate:
            "actualDate" in input ? (input.actualDate ?? null) : (prev?.actualDate ?? null),
          evidenceStoragePath:
            "evidenceStoragePath" in input
              ? (input.evidenceStoragePath ?? null)
              : (prev?.evidenceStoragePath ?? null),
          evidenceFileName:
            "evidenceFileName" in input
              ? (input.evidenceFileName ?? null)
              : (prev?.evidenceFileName ?? null),
        });
        await loadBundle();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "계획/실적 저장 실패");
      }
    },
    [selectedProject, entryMap, loadBundle]
  );

  const openEditDialog = useCallback(
    (projectId: string) => {
      const project = bundle.projects.find((p) => p.id === projectId);
      if (!project) return;
      const stageTemplates = bundle.stageColumns
        .filter((c) => c.projectId === projectId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => {
          const entry = entryMap.get(`${projectId}:${c.id}`);
          return {
            stageColumnId: c.id,
            name: c.name,
            planDate: entry?.planDate ?? "",
          };
        });
      setAddDialog({
        open: true,
        mode: "edit",
        targetProjectId: projectId,
        itemName: project.itemName,
        detail: project.detail ?? "",
        amountKKrw: formatAmountWithCommas(String(project.amountKKrw ?? "")),
        deptName: project.deptName ?? "",
        ownerName: project.ownerName ?? "",
        stageTemplates:
          stageTemplates.length > 0
            ? stageTemplates
            : createEmptyAddDialogState().stageTemplates,
      });
    },
    [bundle.projects, bundle.stageColumns, entryMap]
  );

  const submitProjectDialog = useCallback(async () => {
    const amount = parseAmountFromInput(addDialog.amountKKrw);
    try {
      if (addDialog.mode === "create") {
        await createInvestmentProject({
          itemName: addDialog.itemName.trim() || "신규 투자 건",
          detail: addDialog.detail.trim() || null,
          amountKKrw: amount,
          deptName: addDialog.deptName.trim() || null,
          ownerName: addDialog.ownerName.trim() || null,
          stageTemplates: addDialog.stageTemplates
            .map((s) => ({
              name: s.name.trim() || s.namePlaceholder?.trim() || "",
              planDate: s.planDate || null,
            }))
            .filter((s) => s.name.length > 0),
        });
      } else if (addDialog.targetProjectId) {
        const projectId = addDialog.targetProjectId;
        await updateInvestmentProject({
          id: projectId,
          itemName: addDialog.itemName.trim() || "투자 심의 건",
          amountKKrw: amount,
          deptName: addDialog.deptName.trim() || null,
          ownerName: addDialog.ownerName.trim() || null,
          detail: addDialog.detail.trim() || null,
        });

        const existingColumns = bundle.stageColumns
          .filter((c) => c.projectId === projectId)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        const keptIds = new Set(
          addDialog.stageTemplates
            .map((s) => s.stageColumnId)
            .filter((v): v is string => typeof v === "string" && v.length > 0)
        );
        await Promise.all(
          existingColumns
            .filter((col) => !keptIds.has(col.id))
            .map((col) => deleteInvestmentStageColumn(col.id))
        );

        for (const stage of addDialog.stageTemplates) {
          const stageName = stage.name.trim() || stage.namePlaceholder?.trim() || "";
          if (!stageName) continue;
          let stageColumnId = stage.stageColumnId;
          if (stageColumnId) {
            const existing = existingColumns.find((c) => c.id === stageColumnId);
            if (existing && existing.name !== stageName) {
              await renameInvestmentStageColumn(stageColumnId, stageName);
            }
          } else {
            stageColumnId = await createInvestmentStageColumn(projectId, stageName);
          }
          const prev = entryMap.get(`${projectId}:${stageColumnId}`);
          await upsertInvestmentStageEntry({
            projectId,
            stageColumnId,
            planDate: stage.planDate || null,
            actualDate: prev?.actualDate ?? null,
            evidenceStoragePath: prev?.evidenceStoragePath ?? null,
            evidenceFileName: prev?.evidenceFileName ?? null,
          });
        }
      }
      setAddDialog(createEmptyAddDialogState(false));
      await loadBundle();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : addDialog.mode === "create"
            ? "신규 투자 건 생성 실패"
            : "투자 심의 건 수정 실패"
      );
    }
  }, [addDialog, loadBundle, bundle.stageColumns, entryMap]);

  if (profileQ.isPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-8">
        <h2 className="text-lg font-semibold text-slate-800">접근 권한 없음</h2>
        <p className="mt-2 text-sm text-slate-600">투자 메뉴는 그룹장·팀장·대표·관리자만 접근 가능합니다.</p>
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 h-[95px] shrink-0 border-b border-sky-200 bg-white/95 px-4 shadow-sm backdrop-blur-md sm:px-8">
        <div className="flex h-full items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">투자</h1>
            <p className="mt-0.5 text-sm text-slate-500">투자 심의 건 현황</p>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-6 sm:p-8">
        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">기준</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {new Date().getFullYear()}년 {new Date().getMonth() + 1}월
              </p>
            </div>
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">종합 달성률</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-sky-700">
                {overview.overallProgress}%
              </p>
            </div>
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">총 투자 금액</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-amber-700">
                {formatEok(overview.totalAmount)}
              </p>
            </div>
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">완료 건 / 전체 건</p>
              <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-800">
                {overview.completedCount}
                <span className="mx-1 text-xl font-semibold text-slate-400">/</span>
                <span className="text-slate-600">{overview.totalProjects}</span>
              </p>
            </div>
          </div>
          {canEdit ? (
            <div className="flex justify-end">
              <button
                type="button"
                  onClick={() => setAddDialog(createEmptyAddDialogState(true))}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" /> 투자 심의 건 추가
              </button>
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
          <div className="overflow-auto">
            <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-sky-50/80 text-slate-700">
                <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">투자 심의 제목</th>
                <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">세부 내용</th>
                <th className="border-b border-sky-100 px-3 py-3 text-right font-semibold">투자 금액(￦)</th>
                <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">담당 부서</th>
                <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">담당자</th>
                <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">달성률</th>
                {canEdit ? <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">관리</th> : null}
              </tr>
            </thead>
            <tbody>
              {bundle.projects.map((project) => {
                const stageIds = stageColumnIdsByProject.get(project.id) ?? [];
                    const progress =
                      project.progressRate ??
                      progressForProject(project.id, stageIds, entryMap);
                return (
                  <tr
                    key={project.id}
                    className={`cursor-pointer border-b border-slate-100 ${
                      selectedProjectId === project.id ? "bg-sky-50/50" : "hover:bg-slate-50/70"
                    }`}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <td className="px-3 py-2 font-medium text-slate-900">{project.itemName}</td>
                    <td className="px-3 py-2 text-slate-700">{project.detail ?? "-"}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{formatEok(project.amountKKrw)}</td>
                    <td className="px-3 py-2 text-slate-800">{project.deptName ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-800">{project.ownerName ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="inline-flex min-w-12 justify-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                          {progress}%
                        </span>
                      </div>
                    </td>
                    {canEdit ? (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(project.id);
                            }}
                            className="inline-flex h-8 items-center rounded-md bg-sky-600 px-2 text-xs text-white hover:bg-sky-700"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirm({
                                open: true,
                                title: "투자 건 삭제",
                                message: `'${project.itemName}' 항목을 삭제할까요?`,
                                tone: "danger",
                                onConfirm: () => {
                                  void (async () => {
                                    await deleteInvestmentProject(project.id);
                                    await loadBundle();
                                  })();
                                },
                              });
                            }}
                            className="inline-flex h-8 items-center rounded-md border border-red-200 bg-red-50 px-2 text-xs text-red-700 hover:bg-red-100"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedProject ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 px-4 py-8"
          onClick={() => setSelectedProjectId(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-[1400px] overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-sky-200 bg-sky-700 px-4 py-3 text-white">
              <div>
                <p className="text-2xl font-bold leading-tight">{selectedProject.itemName}</p>
                <p className="text-base text-sky-100">
                  {selectedProject.detail?.trim() || "투자 세부 내용 없음"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                  <p className="text-xs font-semibold text-sky-100">종합 달성률</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2.5 w-28 overflow-hidden rounded-full bg-white/30">
                      <div
                        className="h-full rounded-full bg-emerald-300"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              selectedProject.progressRate ??
                                progressForProject(
                                  selectedProject.id,
                                  selectedProjectColumns.map((s) => s.id),
                                  entryMap
                                )
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-right text-xl font-bold text-white">
                      {Math.max(
                        0,
                        Math.min(
                          100,
                          selectedProject.progressRate ??
                            progressForProject(
                              selectedProject.id,
                              selectedProjectColumns.map((s) => s.id),
                              entryMap
                            )
                        )
                      )}
                      <span className="ml-0.5 text-sm font-semibold">%</span>
                    </p>
                  </div>
                </div>
                {canEdit && isOwnerOfSelectedProject ? (
                  <div className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1">
                    <span className="text-xs text-sky-100">달성률</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={progressDraft}
                      onChange={(e) => setProgressDraft(e.target.value)}
                      className="h-7 w-16 rounded-md border border-white/20 bg-white/95 px-2 text-xs text-slate-900"
                    />
                    <span className="text-xs text-sky-100">%</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="rounded-md p-1 hover:bg-white/10"
                  onClick={() => setSelectedProjectId(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(92vh-56px)] overflow-auto p-4">
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex min-h-[5.4rem] flex-col justify-center rounded-2xl border border-sky-200 bg-sky-50/70 p-2.5 shadow-sm shadow-sky-100/40">
                  <p className="text-xs font-medium text-slate-500">투자 금액(￦)</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p className="text-2xl font-bold tracking-tight text-amber-700">
                      {formatEok(parseAmountFromInput(projectDraft.amountKKrw))}
                    </p>
                    <p className="text-xs text-slate-500">{projectDraft.amountKKrw || "-"}</p>
                  </div>
                </div>
                <div className="flex min-h-[5.4rem] flex-col justify-center rounded-2xl border border-sky-200 bg-sky-50/70 p-2.5 shadow-sm shadow-sky-100/40">
                  <p className="text-xs font-medium text-slate-500">담당 부서</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
                    {projectDraft.deptName || "-"}
                  </p>
                </div>
                <div className="flex min-h-[5.4rem] flex-col justify-center rounded-2xl border border-sky-200 bg-sky-50/70 p-2.5 shadow-sm shadow-sky-100/40">
                  <p className="text-xs font-medium text-slate-500">담당자</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
                    {projectDraft.ownerName || "-"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                <div className="overflow-auto rounded-lg bg-white">
                <table className="min-w-[980px] w-full border-separate border-spacing-0 border border-slate-300 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700">
                      <th className="border-b border-slate-300 border-r border-slate-200 px-3 py-3">구분</th>
                      {selectedProjectColumns.map((stage) => (
                        <th
                          key={stage.id}
                          className={`border-b border-slate-300 border-r border-slate-200 px-3 py-3 text-center last:border-r-0 ${selectedStageColumnId === stage.id ? "bg-sky-100 text-sky-900" : "cursor-pointer hover:bg-sky-50"}`}
                          onClick={() => setSelectedStageColumnId(stage.id)}
                        >
                          {stage.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-100">
                      <td className="border-b border-slate-200 border-r border-slate-200 bg-slate-50 px-3 py-3 font-semibold text-slate-700">계획</td>
                      {selectedProjectColumns.map((stage) => {
                        const entry = entryMap.get(`${selectedProject.id}:${stage.id}`);
                        return (
                          <td key={`plan-${stage.id}`} className="border-b border-slate-200 border-r border-slate-200 px-2 py-2 last:border-r-0">
                            <DateCardInput
                              disabled={!canEdit}
                              value={entry?.planDate ?? ""}
                              onChange={(value) =>
                                void saveEntryField({
                                  stageColumnId: stage.id,
                                  planDate: value || null,
                                })
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="border-b border-slate-200 border-r border-slate-200 bg-slate-50 px-3 py-3 font-semibold text-slate-700">실적</td>
                      {selectedProjectColumns.map((stage) => {
                        const entry = entryMap.get(`${selectedProject.id}:${stage.id}`);
                        return (
                          <td key={`actual-${stage.id}`} className="border-b border-slate-200 border-r border-slate-200 px-2 py-2 last:border-r-0">
                            <div className="flex items-center gap-1">
                              <div className="min-w-[120px] flex-1">
                                <DateCardInput
                                  disabled={!canEdit}
                                  value={entry?.actualDate ?? ""}
                                  onChange={(value) =>
                                    void saveEntryField({
                                      stageColumnId: stage.id,
                                      actualDate: value || null,
                                    })
                                  }
                                />
                              </div>
                              {canEdit ? (
                                <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 px-2 text-slate-600 hover:bg-slate-50">
                                  <Paperclip className="h-4 w-4" />
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      void (async () => {
                                        try {
                                          const uploaded = await uploadInvestmentEvidenceFile({
                                            projectId: selectedProject.id,
                                            stageColumnId: stage.id,
                                            file,
                                          });
                                          await saveEntryField({
                                            stageColumnId: stage.id,
                                            evidenceStoragePath: uploaded.storagePath,
                                            evidenceFileName: uploaded.fileName,
                                          });
                                          const bridgeResult = await notifyWidgetUploadToTest(
                                            uploaded.storagePath
                                          );
                                          if (!bridgeResult.ok) {
                                            setMessage(
                                              `증빙 업로드는 완료되었지만 위젯 동기화에 실패했습니다. (${bridgeResult.error})`
                                            );
                                          }
                                        } catch (error) {
                                          setMessage(
                                            error instanceof Error
                                              ? error.message
                                              : "증빙 파일 업로드에 실패했습니다."
                                          );
                                        }
                                      })();
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="border-r border-slate-200 bg-slate-50 px-3 py-3 font-semibold text-slate-700">달성 여부</td>
                      {selectedProjectColumns.map((stage) => {
                        const entry = entryMap.get(`${selectedProject.id}:${stage.id}`);
                        const status = statusForPlanActual(entry?.planDate, entry?.actualDate);
                        return (
                          <td
                            key={`status-${stage.id}`}
                            className={`border-r border-slate-200 px-2 py-3 text-center last:border-r-0 ${
                              status === "지연" ? "bg-red-50" : ""
                            }`}
                          >
                            {status === "달성" ? (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                달성
                              </span>
                            ) : status === "지연" ? (
                              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                지연
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-700">증빙 파일</p>
                {evidenceRows.filter((row) => {
                  const stage = selectedProjectColumns.find((c) => c.name === row.stageName);
                  return selectedStageColumnId ? stage?.id === selectedStageColumnId : true;
                }).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedProjectColumns.find((c) => c.id === selectedStageColumnId)?.name ?? "선택한 컬럼"}에 등록된 증빙 파일이 없습니다.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {evidenceRows
                      .filter((row) => {
                        const stage = selectedProjectColumns.find((c) => c.name === row.stageName);
                        return selectedStageColumnId ? stage?.id === selectedStageColumnId : true;
                      })
                      .map((row) => (
                      <li
                        key={`${row.stageName}:${row.storagePath}`}
                        className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{row.stageName}</p>
                          <p className="text-xs text-slate-500">
                            {row.fileName} · 실적일 {parseDateCompact(row.actualDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={evidenceActionKey === `download:${row.storagePath}`}
                            className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                            onClick={() => {
                              void (async () => {
                                try {
                                  setEvidenceActionKey(`download:${row.storagePath}`);
                                  const signed = await getInvestmentEvidenceSignedUrl(row.storagePath);
                                  const response = await fetch(signed);
                                  if (!response.ok) {
                                    throw new Error(`다운로드 요청 실패 (HTTP ${response.status})`);
                                  }
                                  const blob = await response.blob();
                                  const blobUrl = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = blobUrl;
                                  a.download = row.fileName;
                                  a.style.display = "none";
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(blobUrl);
                                } catch (error) {
                                  setMessage(
                                    error instanceof Error
                                      ? `첨부파일 다운로드에 실패했습니다. ${error.message}`
                                      : "첨부파일 다운로드에 실패했습니다."
                                  );
                                } finally {
                                  setEvidenceActionKey(null);
                                }
                              })();
                            }}
                          >
                            다운로드
                          </button>
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={evidenceActionKey === `delete:${row.storagePath}`}
                              className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60"
                              onClick={() =>
                                setConfirm({
                                  open: true,
                                  title: "증빙 파일 삭제",
                                  message: `'${row.fileName}' 파일을 삭제할까요?`,
                                  tone: "danger",
                                  onConfirm: () => {
                                    void (async () => {
                                      try {
                                        setEvidenceActionKey(`delete:${row.storagePath}`);
                                        await deleteInvestmentEvidenceFile(row.storagePath);
                                        await saveEntryField({
                                          stageColumnId: row.stageColumnId,
                                          evidenceStoragePath: null,
                                          evidenceFileName: null,
                                        });
                                      } catch (error) {
                                        setMessage(
                                          error instanceof Error
                                            ? error.message
                                            : "증빙 파일 삭제에 실패했습니다."
                                        );
                                      } finally {
                                        setEvidenceActionKey(null);
                                      }
                                    })();
                                  },
                                })
                              }
                            >
                              삭제
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canEdit && isOwnerOfSelectedProject ? (
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-1 rounded-md bg-sky-600 px-3 text-sm text-white hover:bg-sky-700 disabled:opacity-60"
                    disabled={saving}
                    onClick={() => void saveProject()}
                  >
                    <Save className="h-4 w-4" />
                    저장
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {message ? <p className="px-8 pb-6 text-sm text-red-600">{message}</p> : null}
      {addDialog.open ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {addDialog.mode === "create" ? "투자 심의 건 추가" : "투자 심의 건 수정"}
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-slate-600">투자 심의 제목</span>
                <input
                  value={addDialog.itemName}
                  onChange={(e) => setAddDialog((prev) => ({ ...prev, itemName: e.target.value }))}
                  className={`mt-1 h-10 w-full ${inputBaseClass}`}
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-600">투자 금액(￦)</span>
                <input
                  value={addDialog.amountKKrw}
                  onChange={(e) =>
                    setAddDialog((prev) => ({
                      ...prev,
                      amountKKrw: formatAmountWithCommas(e.target.value),
                    }))
                  }
                  className={`mt-1 h-10 w-full ${inputBaseClass}`}
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-600">담당 부서</span>
                <select
                  value={addDialog.deptName}
                  onChange={(e) => setAddDialog((prev) => ({ ...prev, deptName: e.target.value }))}
                  className={`mt-1 h-10 w-full ${inputBaseClass}`}
                >
                  <option value="">담당 부서 선택</option>
                  {INVESTMENT_DEPARTMENTS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((opt) => (
                        <option key={`${group.label}-${opt}`} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-600">담당자</span>
                <input
                  value={addDialog.ownerName}
                  onChange={(e) => setAddDialog((prev) => ({ ...prev, ownerName: e.target.value }))}
                  className={`mt-1 h-10 w-full ${inputBaseClass}`}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">투자 세부 내용</span>
                <input
                  value={addDialog.detail}
                  onChange={(e) => setAddDialog((prev) => ({ ...prev, detail: e.target.value }))}
                  className={`mt-1 h-10 w-full ${inputBaseClass}`}
                />
              </label>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">컬럼 및 목표 일정</p>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 text-xs text-sky-800 hover:bg-sky-100"
                  onClick={() =>
                    setAddDialog((prev) => ({
                      ...prev,
                      stageTemplates: [...prev.stageTemplates, { name: "", planDate: "" }],
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  컬럼 추가
                </button>
              </div>
              <div className="space-y-2">
                {addDialog.stageTemplates.map((stage, idx) => (
                  <div key={`new-stage-${idx}`} className="grid grid-cols-[1fr_170px_64px] gap-2">
                    <input
                      placeholder={stage.namePlaceholder ?? "컬럼명 (예: PO, 입고, 양산)"}
                      value={stage.name}
                      onChange={(e) =>
                        setAddDialog((prev) => ({
                          ...prev,
                          stageTemplates: prev.stageTemplates.map((row, rowIdx) =>
                            rowIdx === idx ? { ...row, name: e.target.value } : row
                          ),
                        }))
                      }
                      className={`h-9 ${inputBaseClass}`}
                    />
                    <DateCardInput
                      value={stage.planDate}
                      onChange={(value) =>
                        setAddDialog((prev) => ({
                          ...prev,
                          stageTemplates: prev.stageTemplates.map((row, rowIdx) =>
                            rowIdx === idx ? { ...row, planDate: value } : row
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="h-9 rounded-md border border-red-200 bg-red-50 text-xs text-red-700 hover:bg-red-100"
                      onClick={() =>
                        setConfirm({
                          open: true,
                          title: "컬럼 삭제",
                          message: `'${stage.name || stage.namePlaceholder || "신규 컬럼"}' 항목을 삭제할까요?`,
                          tone: "danger",
                          onConfirm: () =>
                            setAddDialog((prev) => ({
                              ...prev,
                              stageTemplates: prev.stageTemplates.filter((_, rowIdx) => rowIdx !== idx),
                            })),
                        })
                      }
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() =>
                  setConfirm({
                    open: true,
                    title: "작성 취소",
                    message: "입력 중인 내용을 취소할까요?",
                    onConfirm: () => setAddDialog(createEmptyAddDialogState(false)),
                  })
                }
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
                onClick={() =>
                  setConfirm({
                    open: true,
                    title:
                      addDialog.mode === "create" ? "투자 심의 건 추가" : "투자 심의 건 수정",
                    message:
                      addDialog.mode === "create"
                        ? "입력한 내용으로 투자 심의 건을 추가할까요?"
                        : "수정한 내용으로 저장할까요?",
                    onConfirm: () => {
                      void submitProjectDialog();
                    },
                  })
                }
              >
                {addDialog.mode === "create" ? "추가" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog state={confirm} onClose={() => setConfirm((prev) => ({ ...prev, open: false }))} />
    </>
  );
}
