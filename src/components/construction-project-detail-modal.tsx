"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  campus2CurrentWeekKey,
  campus2TaskBarSpan,
  campus2WeekLabelFromKey,
  formatCampus2PlanRange,
  type Campus2WeekColumn,
  type Campus2WeeklyPerformance,
} from "@/src/lib/campus2-schedule";
import {
  constructionEvidenceDisplayName,
  constructionEvidenceStoragePath,
  effectiveTaskProgress,
  expectedProgressPercent,
  formatKrw,
  taskPace,
  type ConstructionDomain,
  type ConstructionProjectSummary,
  type ConstructionStatus,
  type ConstructionTask,
} from "@/src/lib/construction-projects";
import {
  ConstructionPaceBadge,
  ConstructionStatusBadge,
} from "@/src/components/construction-status-badge";
import { ConstructionTaskFormModal } from "@/src/components/construction-task-form-modal";
import { ConstructionPerformanceModal } from "@/src/components/construction-performance-modal";
import { requestEvidenceSignedUrl } from "@/src/lib/evidence-download-requests";
import {
  useCreateConstructionTask,
  useDeleteConstructionTask,
  useRemoveConstructionTaskEvidence,
  useUpdateConstructionTask,
  useUploadConstructionTaskEvidence,
} from "@/src/hooks/useConstructionProjects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  domain: ConstructionDomain;
  year: number;
  summary: ConstructionProjectSummary;
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  canEdit: boolean;
};

/** 주요 공사 일정 열 — 가장 긴 공사명이 한 줄에 딱 들어가는 최소 폭 */
const TASK_COLUMN_CLASS = "w-[410px] min-w-[410px] max-w-[410px] box-border";
const COST_COLUMN_CLASS = "w-[132px] min-w-[132px] max-w-[132px] box-border";
/** 상태 열 — 배지 2개만 들어가면 되므로 축소 */
const STATUS_COLUMN_CLASS = "w-[68px] min-w-[68px] max-w-[68px] box-border";
/** 주차 열 — 위 3개 열에서 줄인 폭을 흡수 */
const WEEK_COLUMN_CLASS = "w-[60px] min-w-[60px] max-w-[60px] box-border";
/** 관리 열 — 버튼 2개씩 2줄 배치 */
const ACTION_COLUMN_CLASS = "w-[88px] min-w-[88px] max-w-[88px] box-border";
/** 모든 행 높이 동일 */
const ROW_HEIGHT_CLASS = "h-[68px]";

type MonthGroup = { month: number; label: string; columns: Campus2WeekColumn[] };

function groupWeekColumns(columns: Campus2WeekColumn[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const column of columns) {
    const last = groups[groups.length - 1];
    if (!last || last.month !== column.month) {
      groups.push({ month: column.month, label: `${column.month}월`, columns: [column] });
      continue;
    }
    last.columns.push(column);
  }
  return groups;
}

function barColorClass(status: ConstructionStatus, delayed: boolean): string {
  if (status === "drop") return "bg-rose-400";
  if (status === "hold") return "bg-amber-400";
  if (status === "completed") return "bg-emerald-500";
  return delayed ? "bg-red-500" : "bg-emerald-500";
}

export function ConstructionProjectDetailModal({
  isOpen,
  onClose,
  domain,
  year,
  summary,
  weekly,
  weekColumns,
  canEdit,
}: Props) {
  const { project, tasks, totalCost, progressRate, delayedTaskCount } = summary;
  const [selectedWeekKey, setSelectedWeekKey] = useState("");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ConstructionTask | null>(null);
  const [performanceTask, setPerformanceTask] = useState<ConstructionTask | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [attachingTaskId, setAttachingTaskId] = useState<string | null>(null);

  const createTaskMutation = useCreateConstructionTask(domain, year);
  const updateTaskMutation = useUpdateConstructionTask(domain, year);
  const deleteTaskMutation = useDeleteConstructionTask(domain, year);
  const uploadEvidenceMutation = useUploadConstructionTaskEvidence(domain, year);
  const removeEvidenceMutation = useRemoveConstructionTaskEvidence(domain, year);

  const monthGroups = useMemo(() => groupWeekColumns(weekColumns), [weekColumns]);
  const currentWeekKey = useMemo(() => campus2CurrentWeekKey(weekColumns), [weekColumns]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedWeekKey((current) => current || currentWeekKey || weekColumns[0]?.key || "");
  }, [isOpen, currentWeekKey, weekColumns]);

  useEffect(() => {
    if (isOpen) return;
    setSelectedWeekKey("");
    setEditingTask(null);
    setPerformanceTask(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (taskFormOpen || performanceTask !== null) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, taskFormOpen, performanceTask]);

  if (!isOpen) return null;

  async function handleDownload(
    storedValue: string,
    originalFilenames: string[],
    index: number
  ) {
    const relPath = constructionEvidenceStoragePath(storedValue);
    if (!relPath) return;
    try {
      setDownloading(true);
      const signedUrl = await requestEvidenceSignedUrl(relPath);
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`다운로드 요청 실패 (HTTP ${response.status})`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = constructionEvidenceDisplayName(storedValue, originalFilenames, index);
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `첨부파일 다운로드에 실패했습니다.\n${error.message}`
          : "첨부파일 다운로드에 실패했습니다."
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleAttachToTask(task: ConstructionTask, files: File[]) {
    if (!files.length) return;
    try {
      setAttachingTaskId(task.id);
      await uploadEvidenceMutation.mutateAsync({
        domain,
        taskId: task.id,
        files,
        existingUrls: task.evidenceUrls,
        existingOriginalFilenames: task.evidenceOriginalFilenames,
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "첨부파일 업로드에 실패했습니다."
      );
    } finally {
      setAttachingTaskId(null);
    }
  }

  async function handleRemoveTaskEvidence(task: ConstructionTask, index: number) {
    const name = constructionEvidenceDisplayName(
      task.evidenceUrls[index] ?? "",
      task.evidenceOriginalFilenames,
      index
    );
    if (!window.confirm(`「${name}」 첨부파일을 삭제할까요?`)) return;
    try {
      await removeEvidenceMutation.mutateAsync({
        domain,
        taskId: task.id,
        index,
        existingUrls: task.evidenceUrls,
        existingOriginalFilenames: task.evidenceOriginalFilenames,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "첨부파일 삭제에 실패했습니다.");
    }
  }

  async function handleDeleteTask(task: ConstructionTask) {
    if (
      !window.confirm(
        `「${task.title}」 ${domain.labels.taskNoun}을(를) 삭제할까요?\n연결된 주간 실적·증빙도 함께 삭제됩니다.`
      )
    ) {
      return;
    }
    try {
      await deleteTaskMutation.mutateAsync({ domain, taskId: task.id });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[95vh] w-full max-w-[min(100%,92rem)] flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl shadow-sky-200/50">
        <ProjectHeader
          summary={summary}
          domain={domain}
          delayedTaskCount={delayedTaskCount}
          totalCost={totalCost}
          progressRate={progressRate}
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {domain.labels.taskColumnHeader}
            </h3>
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setTaskFormOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {domain.labels.taskNoun} 추가
              </button>
            ) : null}
          </div>

          {tasks.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              등록된 {domain.labels.taskNoun}이(가) 없습니다.
              {canEdit ? ` 위의 [${domain.labels.taskNoun} 추가] 버튼으로 등록해 주세요.` : ""}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-300">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-700">
                    <th
                      rowSpan={2}
                      className={`sticky left-0 z-20 ${TASK_COLUMN_CLASS} border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold`}
                    >
                      {domain.labels.taskColumnHeader}
                    </th>
                    {domain.hasCost ? (
                      <th
                        rowSpan={2}
                        className={`${COST_COLUMN_CLASS} border-b border-r border-slate-300 px-2 py-2 text-right font-semibold`}
                      >
                        공사비용
                      </th>
                    ) : null}
                    <th
                      rowSpan={2}
                      className={`${STATUS_COLUMN_CLASS} border-b border-r border-slate-300 px-1 py-2 text-center font-semibold`}
                    >
                      상태
                    </th>
                    {monthGroups.map((group) => (
                      <th
                        key={`month-${group.month}`}
                        colSpan={group.columns.length}
                        className="border-b border-r border-slate-300 px-1 py-2 text-center font-semibold"
                      >
                        {group.label}
                      </th>
                    ))}
                    <th
                      rowSpan={2}
                      className={`${ACTION_COLUMN_CLASS} border-b border-slate-300 px-2 py-2 text-center font-semibold`}
                    >
                      관리
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-600">
                    {weekColumns.map((column) => {
                      const isCurrent = column.key === currentWeekKey;
                      const isSelected = column.key === selectedWeekKey;
                      return (
                        <th
                          key={column.key}
                          className={`${WEEK_COLUMN_CLASS} border-b border-r border-slate-300 px-0.5 py-2 text-center text-[11px] font-medium ${
                            isCurrent ? "bg-amber-50/70" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedWeekKey(column.key)}
                            className={`w-full rounded px-0.5 py-1 transition ${
                              isSelected
                                ? "bg-sky-100 font-semibold text-sky-800 ring-1 ring-sky-300"
                                : isCurrent
                                  ? "bg-amber-50/90 text-slate-800"
                                  : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {column.weekInMonth}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      domain={domain}
                      weekColumns={weekColumns}
                      currentWeekKey={currentWeekKey}
                      canEdit={canEdit}
                      attaching={attachingTaskId === task.id}
                      onEdit={() => {
                        setEditingTask(task);
                        setTaskFormOpen(true);
                      }}
                      onDelete={() => void handleDeleteTask(task)}
                      onOpenPerformance={() => setPerformanceTask(task)}
                      onAttach={(files) => void handleAttachToTask(task, files)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <EvidencePanel
          tasks={tasks}
          domain={domain}
          weekly={weekly}
          weekColumns={weekColumns}
          selectedWeekKey={selectedWeekKey}
          canEdit={canEdit}
          downloading={downloading}
          onDownload={(storedValue, names, index) =>
            void handleDownload(storedValue, names, index)
          }
          onRemoveTaskEvidence={(task, index) => void handleRemoveTaskEvidence(task, index)}
        />
      </div>

      <ConstructionTaskFormModal
        isOpen={taskFormOpen}
        onClose={() => {
          setTaskFormOpen(false);
          setEditingTask(null);
        }}
        domain={domain}
        editingTask={editingTask}
        submitting={createTaskMutation.isPending || updateTaskMutation.isPending}
        onSubmit={async (input) => {
          if (editingTask) {
            await updateTaskMutation.mutateAsync({
              ...input,
              domain,
              id: editingTask.id,
              projectId: project.id,
            });
            return;
          }
          await createTaskMutation.mutateAsync({
            ...input,
            domain,
            projectId: project.id,
          });
        }}
      />

      <ConstructionPerformanceModal
        isOpen={performanceTask !== null}
        onClose={() => setPerformanceTask(null)}
        domain={domain}
        task={performanceTask}
        year={year}
        weekColumns={weekColumns}
        weekly={weekly}
        canEdit={canEdit}
        defaultWeekKey={selectedWeekKey}
      />
    </div>
  );

  return createPortal(modal, document.body);
}

function ProjectHeader({
  summary,
  domain,
  delayedTaskCount,
  totalCost,
  progressRate,
  onClose,
}: {
  summary: ConstructionProjectSummary;
  domain: ConstructionDomain;
  delayedTaskCount: number;
  totalCost: number;
  progressRate: number;
  onClose: () => void;
}) {
  const { project, tasks } = summary;
  const percent = Number(progressRate.toFixed(1));
  return (
    <div className="shrink-0 border-b border-sky-200 bg-gradient-to-br from-sky-600 to-sky-700 px-5 py-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold leading-snug text-white sm:text-2xl">
              {project.title}
            </h2>
            <ConstructionStatusBadge status={project.status} />
            {delayedTaskCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-red-500/90 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-red-300/50">
                지연 {delayedTaskCount}건
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-sky-50/90">
            {project.description?.trim() || "세부내용이 등록되지 않았습니다."}
          </p>

          <div className="mt-3 flex max-w-2xl items-center gap-2">
            <div
              className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sky-950/30 ring-1 ring-inset ring-white/20"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${project.title} 진행률`}
            >
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
              />
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-white">
              {percent}%
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2 sm:gap-3">
          <div
            className={`hidden gap-2 sm:grid ${
              domain.hasCost ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            {domain.hasCost ? (
              <HeaderStat label="총 공사비용" value={formatKrw(totalCost)} />
            ) : null}
            <HeaderStat label="담당자" value={project.managerName?.trim() || "—"} />
            <HeaderStat label={domain.labels.taskNoun} value={`${tasks.length}건`} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-sky-50 hover:bg-white/10"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div
        className={`mt-3 grid gap-2 sm:hidden ${
          domain.hasCost ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        <HeaderStat label="총 공사비용" value={formatKrw(totalCost)} />
        <HeaderStat label="담당자" value={project.managerName?.trim() || "—"} />
        <HeaderStat label="주요 공사" value={`${tasks.length}건`} />
      </div>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
      <p className="text-[11px] font-medium text-sky-50/90">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-white">{value}</p>
    </div>
  );
}

function TaskRow({
  task,
  domain,
  weekColumns,
  currentWeekKey,
  canEdit,
  attaching,
  onEdit,
  onDelete,
  onOpenPerformance,
  onAttach,
}: {
  task: ConstructionTask;
  domain: ConstructionDomain;
  weekColumns: Campus2WeekColumn[];
  currentWeekKey: string | null;
  canEdit: boolean;
  attaching: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPerformance: () => void;
  onAttach: (files: File[]) => void;
}) {
  const bar = campus2TaskBarSpan(task, weekColumns);
  const pace = taskPace(task);
  const progress = effectiveTaskProgress(task);
  const expected = expectedProgressPercent(task.planStart, task.planEnd);
  const cells: ReactNode[] = [];
  let index = 0;

  while (index < weekColumns.length) {
    const column = weekColumns[index]!;
    const isCurrent = column.key === currentWeekKey;
    if (bar && index === bar.startIndex) {
      cells.push(
        <td
          key={`${task.id}-bar-${column.key}`}
          colSpan={bar.span}
          className={`${ROW_HEIGHT_CLASS} border-r border-slate-200 px-1 py-1 align-middle ${
            isCurrent ? "bg-amber-50/70" : ""
          }`}
        >
          <div
            className={`flex h-9 min-w-0 items-center justify-center rounded-full px-2 shadow-sm ${barColorClass(
              task.status,
              pace === "delayed"
            )}`}
          >
            <span className="truncate text-center text-[11px] font-semibold leading-none text-white">
              {formatCampus2PlanRange(task.planStart, task.planEnd)}
            </span>
          </div>
        </td>
      );
      index += bar.span;
      continue;
    }
    cells.push(
      <td
        key={`${task.id}-empty-${column.key}`}
        className={`${ROW_HEIGHT_CLASS} ${WEEK_COLUMN_CLASS} border-r border-slate-200 px-0.5 py-1 align-middle ${
          isCurrent ? "bg-amber-50/70" : ""
        }`}
      />
    );
    index += 1;
  }

  return (
    <tr className="border-b border-slate-200">
      <th
        scope="row"
        className={`sticky left-0 z-10 ${TASK_COLUMN_CLASS} ${ROW_HEIGHT_CLASS} border-r border-slate-300 bg-white px-3 py-2 text-left align-middle font-medium text-slate-800`}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <button
            type="button"
            onClick={onOpenPerformance}
            className="truncate text-left text-sm font-semibold hover:text-sky-700"
            title={task.title}
          >
            {task.title}
          </button>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="tabular-nums">
              진행 {Number(progress.toFixed(0))}% / 계획 {Number(expected.toFixed(0))}%
            </span>
            {task.evidenceUrls.length > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-slate-400">
                <Paperclip className="h-3 w-3" aria-hidden />
                {task.evidenceUrls.length}
              </span>
            ) : null}
          </div>
        </div>
      </th>
      {domain.hasCost ? (
        <td
          className={`${COST_COLUMN_CLASS} ${ROW_HEIGHT_CLASS} border-r border-slate-200 px-2 py-2 text-right align-middle text-sm font-semibold tabular-nums text-slate-800`}
        >
          {formatKrw(task.cost)}
        </td>
      ) : null}
      <td
        className={`${STATUS_COLUMN_CLASS} ${ROW_HEIGHT_CLASS} border-r border-slate-200 px-1 py-2 align-middle`}
      >
        <div className="flex flex-col items-center gap-1">
          <ConstructionStatusBadge status={task.status} size="xs" />
          <ConstructionPaceBadge pace={pace} size="xs" />
        </div>
      </td>
      {cells}
      <td className={`${ACTION_COLUMN_CLASS} ${ROW_HEIGHT_CLASS} px-1 py-2 align-middle`}>
        {/* 버튼 2개씩 2줄 배치 */}
        <div className={canEdit ? "grid grid-cols-2 gap-1" : "flex justify-center"}>
          <button
            type="button"
            onClick={onOpenPerformance}
            className="inline-flex h-7 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
          >
            {canEdit ? "실적" : "조회"}
          </button>
          {canEdit ? (
            <>
              <label
                className="inline-flex h-7 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                title="이 주요 공사에 파일 첨부"
              >
                {attaching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />
                )}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    onAttach(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200 bg-white px-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                title="주요 공사 수정"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex h-7 items-center justify-center rounded-lg border border-red-200 bg-white px-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                title="주요 공사 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function EvidencePanel({
  tasks,
  domain,
  weekly,
  weekColumns,
  selectedWeekKey,
  canEdit,
  downloading,
  onDownload,
  onRemoveTaskEvidence,
}: {
  tasks: ConstructionTask[];
  domain: ConstructionDomain;
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  selectedWeekKey: string;
  canEdit: boolean;
  downloading: boolean;
  onDownload: (storedValue: string, names: string[], index: number) => void;
  onRemoveTaskEvidence: (task: ConstructionTask, index: number) => void;
}) {
  const [tab, setTab] = useState<"task" | "week">("task");

  const taskEntries = useMemo(
    () => tasks.filter((task) => task.evidenceUrls.length > 0),
    [tasks]
  );

  const weekEntries = useMemo(() => {
    if (!selectedWeekKey) return [];
    const titleById = new Map(tasks.map((task) => [task.id, task.title]));
    return weekly
      .filter((row) => row.weekKey === selectedWeekKey && row.evidenceUrls.length > 0)
      .map((row) => ({ row, title: titleById.get(row.taskId) ?? "주요 공사" }));
  }, [selectedWeekKey, tasks, weekly]);

  return (
    <section className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
          <button
            type="button"
            onClick={() => setTab("task")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "task" ? "bg-white text-slate-800 shadow-sm" : "text-slate-600"
            }`}
          >
            {domain.labels.taskNoun} 첨부 (
            {taskEntries.reduce((n, t) => n + t.evidenceUrls.length, 0)})
          </button>
          <button
            type="button"
            onClick={() => setTab("week")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === "week" ? "bg-white text-slate-800 shadow-sm" : "text-slate-600"
            }`}
          >
            주차별 증빙
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {tab === "week"
            ? selectedWeekKey
              ? `${campus2WeekLabelFromKey(selectedWeekKey, weekColumns)} 등록 증빙`
              : "일정표에서 주차를 선택해 주세요."
            : `주차와 무관하게 ${domain.labels.taskNoun}에 바로 첨부된 파일입니다.`}
        </p>
      </div>

      <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white px-4 py-3">
        {tab === "task" ? (
          taskEntries.length === 0 ? (
            <p className="text-sm text-slate-500">
              {domain.labels.taskNoun}에 직접 첨부된 파일이 없습니다.
              {canEdit ? " 일정표의 클립 아이콘으로 첨부할 수 있습니다." : ""}
            </p>
          ) : (
            <ul className="space-y-3">
              {taskEntries.map((task) => (
                <li key={task.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                  <ul className="mt-2 space-y-2">
                    {task.evidenceUrls.map((storedValue, index) => (
                      <li
                        key={`${task.id}-${storedValue}-${index}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0 truncate text-sm text-slate-700">
                          {constructionEvidenceDisplayName(
                            storedValue,
                            task.evidenceOriginalFilenames,
                            index
                          )}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onDownload(storedValue, task.evidenceOriginalFilenames, index)
                            }
                            disabled={downloading}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-60"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            다운로드
                          </button>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => onRemoveTaskEvidence(task, index)}
                              className="inline-flex items-center rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                              aria-label="첨부파일 삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )
        ) : !selectedWeekKey ? (
          <p className="text-sm text-slate-500">주차를 선택하면 첨부 파일 목록이 표시됩니다.</p>
        ) : weekEntries.length === 0 ? (
          <p className="text-sm text-slate-500">이 주차에 등록된 증빙 파일이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {weekEntries.map(({ row, title }) => (
              <li key={row.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <ul className="mt-2 space-y-2">
                  {row.evidenceUrls.map((storedValue, index) => (
                    <li
                      key={`${row.id}-${storedValue}-${index}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0 truncate text-sm text-slate-700">
                        {constructionEvidenceDisplayName(
                          storedValue,
                          row.evidenceOriginalFilenames,
                          index
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onDownload(storedValue, row.evidenceOriginalFilenames, index)
                        }
                        disabled={downloading}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-60"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        다운로드
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
