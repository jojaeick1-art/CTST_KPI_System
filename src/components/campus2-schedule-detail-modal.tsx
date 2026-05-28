"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import {
  campus2EvidenceDisplayName,
  campus2EvidenceStoragePath,
  campus2CurrentWeekKey,
  campus2TaskBarSpan,
  campus2WeekLabelFromKey,
  formatCampus2PlanRange,
  type Campus2ScheduleTask,
  type Campus2WeekColumn,
  type Campus2WeekKey,
  type Campus2WeeklyPerformance,
} from "@/src/lib/campus2-schedule";
import { requestEvidenceSignedUrl } from "@/src/lib/evidence-download-requests";
import { Campus2SchedulePerformanceModal } from "@/src/components/campus2-schedule-performance-modal";
import {
  useDeleteCampus2WeeklyPerformance,
  useUpsertCampus2OverallAchievement,
} from "@/src/hooks/useCampus2Schedule";
import type { UseMutationResult } from "@tanstack/react-query";

export type ConstructionScheduleLabels = {
  title: string;
  subtitleCanEdit: string;
  subtitleReadOnly: string;
  permissionHint: string;
  scheduleColumnHeader: string;
  deleteConfirm: (weekLabel: string) => string;
  progressAriaLabel: string;
};

export type ConstructionSchedulePerformanceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  task: Campus2ScheduleTask | null;
  year: number;
  weekColumns: Campus2WeekColumn[];
  weekly: Campus2WeeklyPerformance[];
  canEdit: boolean;
  defaultWeekKey?: string;
};

export type ConstructionScheduleDetailModalProps = {
  labels: ConstructionScheduleLabels;
  PerformanceModal: React.ComponentType<ConstructionSchedulePerformanceModalProps>;
  overallMutation: UseMutationResult<
    void,
    Error,
    { year: number; achievementRate: number }
  >;
  deleteWeeklyMutation: UseMutationResult<
    void,
    Error,
    { taskId: string; year: number; weekKey: Campus2WeekKey }
  >;
  isOpen: boolean;
  onClose: () => void;
  year: number;
  tasks: Campus2ScheduleTask[];
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  overallAchievement: number;
  canEdit: boolean;
  /** SMT: 왼쪽 라인(2행) + 오른쪽 세부 일정(8행) */
  scheduleTableLayout?: "default" | "smt-line-phase";
  /** 모달 본문 최대 너비 (주차 열이 많을 때) */
  panelMaxWidthClass?: string;
};

const CAMPUS2_LABELS: ConstructionScheduleLabels = {
  title: "CTST 2Campus 공사 일정",
  subtitleCanEdit: "주요 공사 일정과 주간 실적을 등록·수정·삭제할 수 있습니다.",
  subtitleReadOnly: "주요 공사 일정과 주간 실적을 조회할 수 있습니다.",
  permissionHint:
    "실적 등록·수정·삭제와 종합 달성률 입력은 그룹장·팀장·관리자만 할 수 있습니다.",
  scheduleColumnHeader: "주요 공사 일정",
  deleteConfirm: (weekLabel) =>
    `「${weekLabel}」 주간 실적을 삭제할까요?\n선택한 공사 일정·주차의 증빙·특이사항이 제거됩니다.`,
  progressAriaLabel: "종합 달성률",
};

type Props = ConstructionScheduleDetailModalProps;

type MonthGroup = {
  month: number;
  label: string;
  columns: Campus2WeekColumn[];
};

function groupWeekColumns(columns: Campus2WeekColumn[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const column of columns) {
    const last = groups[groups.length - 1];
    if (!last || last.month !== column.month) {
      groups.push({
        month: column.month,
        label: `${column.month}월`,
        columns: [column],
      });
      continue;
    }
    last.columns.push(column);
  }
  return groups;
}

function hasWeeklyEntryForWeek(
  taskId: string,
  weekKey: string,
  weekly: Campus2WeeklyPerformance[]
): boolean {
  if (!weekKey) return false;
  return weekly.some((row) => row.taskId === taskId && row.weekKey === weekKey);
}

export function ConstructionScheduleDetailModal({
  labels,
  PerformanceModal,
  overallMutation,
  deleteWeeklyMutation,
  isOpen,
  onClose,
  year,
  tasks,
  weekly,
  weekColumns,
  overallAchievement,
  canEdit,
  scheduleTableLayout = "default",
  panelMaxWidthClass = "max-w-[min(100%,88rem)]",
}: Props) {
  const [selectedTask, setSelectedTask] = useState<Campus2ScheduleTask | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState("");
  const [overallDraft, setOverallDraft] = useState("");
  const [downloadingEvidence, setDownloadingEvidence] = useState(false);
  const monthGroups = useMemo(() => groupWeekColumns(weekColumns), [weekColumns]);

  /** 대시보드 부서 카드와 동일한 진행률 표시용 (0~100) */
  const overallBarPercent = useMemo(() => {
    if (canEdit) {
      const trimmed = overallDraft.trim();
      if (trimmed === "") {
        return Math.max(0, Math.min(100, Number(overallAchievement.toFixed(1))));
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        return Math.max(0, Math.min(100, Number(overallAchievement.toFixed(1))));
      }
      return Math.max(0, Math.min(100, n));
    }
    return Math.max(0, Math.min(100, Number(overallAchievement.toFixed(1))));
  }, [canEdit, overallDraft, overallAchievement]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedWeekKey((current) => current || weekColumns[0]?.key || "");
  }, [isOpen, weekColumns]);

  useEffect(() => {
    if (!isOpen) return;
    setOverallDraft(String(Number(overallAchievement.toFixed(1))));
  }, [isOpen, overallAchievement]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTask(null);
      setSelectedWeekKey("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedTask === null) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, selectedTask]);

  if (!isOpen) return null;

  async function handleSaveOverall() {
    if (!canEdit) return;
    const rateNum = Number(overallDraft);
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) return;
    await overallMutation.mutateAsync({ year, achievementRate: rateNum });
  }

  async function handleDeleteRowWeekly(taskId: string) {
    if (!canEdit || !selectedWeekKey) return;
    const weekLabel = campus2WeekLabelFromKey(selectedWeekKey, weekColumns);
    if (
      !window.confirm(labels.deleteConfirm(weekLabel))
    ) {
      return;
    }
    try {
      await deleteWeeklyMutation.mutateAsync({
        taskId,
        year,
        weekKey: selectedWeekKey,
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다."
      );
    }
  }

  async function handleDownloadEvidence(
    storedValue: string,
    originalFilenames: string[],
    index: number
  ) {
    const relPath = campus2EvidenceStoragePath(storedValue);
    if (!relPath) return;
    try {
      setDownloadingEvidence(true);
      const signedUrl = await requestEvidenceSignedUrl(relPath);
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`다운로드 요청 실패 (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = campus2EvidenceDisplayName(storedValue, originalFilenames, index);
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
      setDownloadingEvidence(false);
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
      <DetailPanel maxWidthClass={panelMaxWidthClass}>
        <div className="shrink-0 border-b border-sky-200 bg-gradient-to-br from-sky-600 to-sky-700 px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold leading-snug text-white sm:text-2xl">
                {labels.title}
              </h2>
              <p className="mt-1 text-sm text-sky-50/90">
                {canEdit ? labels.subtitleCanEdit : labels.subtitleReadOnly}
              </p>
              <div className="mt-2.5 flex max-w-xl items-center gap-2 sm:max-w-2xl">
                <div
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-sky-900/15"
                  role="progressbar"
                  aria-valuenow={overallBarPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={labels.progressAriaLabel}
                >
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-500 ${
                      overallBarPercent > 0 ? "" : "opacity-40"
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, overallBarPercent))}%`,
                    }}
                  />
                </div>
                <span className="shrink-0 text-xs font-bold tabular-nums text-white sm:text-sm">
                  {Number(overallBarPercent.toFixed(1))}%
                </span>
              </div>
              {!canEdit ? (
                <p className="mt-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-sky-50/95">
                  {labels.permissionHint}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-start gap-2 sm:gap-3">
              {canEdit ? (
                <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-right sm:px-4">
                  <p className="text-[11px] font-medium text-sky-50/90">종합 달성률 입력</p>
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={overallDraft}
                      onChange={(event) => setOverallDraft(event.target.value)}
                      onBlur={() => void handleSaveOverall()}
                      className="w-20 rounded-lg border border-white/20 bg-white/95 px-2 py-1 text-right text-lg font-bold tabular-nums text-slate-800 outline-none ring-sky-300 focus-visible:ring-2 sm:w-24 sm:text-xl"
                    />
                    <span className="text-sm font-medium text-sky-100">%</span>
                    {overallMutation.isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-50" aria-hidden />
                    ) : null}
                  </div>
                </div>
              ) : null}
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <ScheduleTable
            tasks={tasks}
            weekly={weekly}
            weekColumns={weekColumns}
            monthGroups={monthGroups}
            scheduleColumnHeader={labels.scheduleColumnHeader}
            scheduleTableLayout={scheduleTableLayout}
            selectedWeekKey={selectedWeekKey}
            canEdit={canEdit}
            deleteWeeklyPending={deleteWeeklyMutation.isPending}
            onSelectWeek={setSelectedWeekKey}
            onSelectTask={setSelectedTask}
            onDeleteRowWeekly={(taskId) => void handleDeleteRowWeekly(taskId)}
          />
        </div>
        <WeekEvidencePanel
          selectedWeekKey={selectedWeekKey}
          weekColumns={weekColumns}
          tasks={tasks}
          weekly={weekly}
          downloadingEvidence={downloadingEvidence}
          onDownloadEvidence={(storedValue, originalFilenames, index) =>
            void handleDownloadEvidence(storedValue, originalFilenames, index)
          }
        />
      </DetailPanel>

      <PerformanceModal
        isOpen={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
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

export function Campus2ScheduleDetailModal(
  props: Omit<
    ConstructionScheduleDetailModalProps,
    "labels" | "PerformanceModal" | "overallMutation" | "deleteWeeklyMutation"
  >
) {
  const overallMutation = useUpsertCampus2OverallAchievement(props.year);
  const deleteWeeklyMutation = useDeleteCampus2WeeklyPerformance(props.year);
  return (
    <ConstructionScheduleDetailModal
      labels={CAMPUS2_LABELS}
      PerformanceModal={Campus2SchedulePerformanceModal}
      overallMutation={overallMutation}
      deleteWeeklyMutation={deleteWeeklyMutation}
      {...props}
    />
  );
}

function DetailPanel({
  children,
  maxWidthClass = "max-w-[min(100%,88rem)]",
}: {
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div
      className={`relative flex max-h-[95vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl shadow-sky-200/50`}
    >
      {children}
    </div>
  );
}

function weekColumnHighlightClass(isCurrentWeek: boolean): string {
  return isCurrentWeek ? "bg-amber-50/70" : "";
}

/** 주차 열 너비 — 모든 주 동일 */
const SCHEDULE_WEEK_COLUMN_CLASS =
  "w-[84px] min-w-[84px] max-w-[84px] box-border";

/** SMT 일정표 좌측 2열 (합계 248px — 헤더 colSpan=2와 동일) */
const SMT_LINE_GROUP_COLUMN_CLASS =
  "w-[76px] min-w-[76px] max-w-[76px] box-border";
const SMT_PHASE_LABEL_COLUMN_CLASS =
  "w-[172px] min-w-[172px] max-w-[172px] box-border";
const SMT_STICKY_LABEL_COLUMNS_CLASS = "min-w-[248px] w-[248px]";

function weekHeaderButtonClass(isCurrentWeek: boolean, isSelectedWeek: boolean): string {
  if (isSelectedWeek) {
    return "bg-sky-100 font-semibold text-sky-800 ring-1 ring-sky-300";
  }
  if (isCurrentWeek) {
    return "bg-amber-50/90 font-medium text-slate-800 ring-1 ring-amber-200/80";
  }
  return "text-slate-600 hover:bg-slate-100 hover:text-slate-800";
}

function ScheduleTable({
  tasks,
  weekly,
  weekColumns,
  monthGroups,
  scheduleColumnHeader,
  scheduleTableLayout,
  selectedWeekKey,
  canEdit,
  deleteWeeklyPending,
  onSelectWeek,
  onSelectTask,
  onDeleteRowWeekly,
}: {
  tasks: Campus2ScheduleTask[];
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  monthGroups: MonthGroup[];
  scheduleColumnHeader: string;
  scheduleTableLayout: "default" | "smt-line-phase";
  selectedWeekKey: string;
  canEdit: boolean;
  deleteWeeklyPending: boolean;
  onSelectWeek: (weekKey: string) => void;
  onSelectTask: (task: Campus2ScheduleTask) => void;
  onDeleteRowWeekly: (taskId: string) => void;
}) {
  const smtGrouped = scheduleTableLayout === "smt-line-phase";
  const currentWeekKey = useMemo(
    () => campus2CurrentWeekKey(weekColumns),
    [weekColumns]
  );
  const currentWeekIndex = useMemo(
    () => weekColumns.findIndex((column) => column.key === currentWeekKey),
    [currentWeekKey, weekColumns]
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-300">
      <table className="min-w-full w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-700">
            <th
              rowSpan={2}
              colSpan={smtGrouped ? 2 : 1}
              className={`sticky left-0 z-20 border-b border-r border-slate-300 bg-slate-50 px-3 py-2 font-semibold ${
                smtGrouped
                  ? `${SMT_STICKY_LABEL_COLUMNS_CLASS} text-center`
                  : "min-w-[240px] text-left"
              }`}
            >
              {scheduleColumnHeader}
            </th>
            {monthGroups.map((group) => (
              <th
                key={`month-${group.month}`}
                colSpan={group.columns.length}
                className="border-b border-r border-slate-300 px-2 py-2 text-center font-semibold"
              >
                {group.label}
              </th>
            ))}
            <th
              rowSpan={2}
              className="min-w-[132px] border-b border-slate-300 px-2 py-2 text-center font-semibold"
            >
              주간 실적
            </th>
          </tr>
          <tr className="bg-slate-50 text-slate-600">
            {weekColumns.map((column) => {
              const isCurrentWeek = column.key === currentWeekKey;
              const isSelectedWeek = column.key === selectedWeekKey;
              return (
              <th
                key={column.key}
                className={`${SCHEDULE_WEEK_COLUMN_CLASS} border-b border-r border-slate-300 px-1 py-2 text-center text-xs font-medium ${weekColumnHighlightClass(isCurrentWeek)}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectWeek(column.key)}
                  aria-current={isCurrentWeek ? "date" : undefined}
                  className={`w-full rounded-md px-1 py-1 transition ${weekHeaderButtonClass(isCurrentWeek, isSelectedWeek)}`}
                >
                  {column.weekInMonth}주
                </button>
              </th>
            );
            })}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const phaseSep = task.title.indexOf("·");
            const phaseOnly =
              phaseSep >= 0 ? task.title.slice(phaseSep + 1).trim() : task.title;
            const lineGroupStart = task.sortOrder === 1 || task.sortOrder === 5;
            return (
            <ScheduleRow
              key={task.id}
              task={task}
              weekly={weekly}
              weekColumns={weekColumns}
              currentWeekIndex={currentWeekIndex}
              selectedWeekKey={selectedWeekKey}
              canEdit={canEdit}
              deleteWeeklyPending={deleteWeeklyPending}
              onSelectTask={onSelectTask}
              onDeleteRowWeekly={onDeleteRowWeekly}
              smtLinePhaseLayout={smtGrouped}
              smtLineGroupCell={
                smtGrouped && lineGroupStart
                  ? {
                      line1: "SMT",
                      line2: task.sortOrder <= 4 ? "신규라인" : "이설라인",
                      rowSpan: 4,
                    }
                  : undefined
              }
              smtPhaseLabel={smtGrouped ? phaseOnly : undefined}
            />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleRow({
  task,
  weekly,
  weekColumns,
  currentWeekIndex,
  selectedWeekKey,
  canEdit,
  deleteWeeklyPending,
  onSelectTask,
  onDeleteRowWeekly,
  smtLinePhaseLayout = false,
  smtLineGroupCell,
  smtPhaseLabel,
}: {
  task: Campus2ScheduleTask;
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  currentWeekIndex: number;
  selectedWeekKey: string;
  canEdit: boolean;
  deleteWeeklyPending: boolean;
  onSelectTask: (task: Campus2ScheduleTask) => void;
  onDeleteRowWeekly: (taskId: string) => void;
  smtLinePhaseLayout?: boolean;
  smtLineGroupCell?: { line1: string; line2: string; rowSpan: number };
  smtPhaseLabel?: string;
}) {
  const bar = campus2TaskBarSpan(task, weekColumns);
  const hasEntryForSelectedWeek = hasWeeklyEntryForWeek(
    task.id,
    selectedWeekKey,
    weekly
  );
  const timelineCells: ReactNode[] = [];
  let columnIndex = 0;

  while (columnIndex < weekColumns.length) {
    const column = weekColumns[columnIndex]!;
    const isCurrentWeekCell =
      currentWeekIndex >= 0 &&
      (bar && columnIndex === bar.startIndex
        ? currentWeekIndex >= bar.startIndex && currentWeekIndex < bar.startIndex + bar.span
        : columnIndex === currentWeekIndex);
    if (bar && columnIndex === bar.startIndex) {
      timelineCells.push(
        <td
          key={`${task.id}-bar-${column.key}`}
          colSpan={bar.span}
          className={`h-14 border-r border-slate-200 px-1 py-1 align-middle ${weekColumnHighlightClass(isCurrentWeekCell)}`}
        >
          <ScheduleBar label={formatCampus2PlanRange(task.planStart, task.planEnd)} />
        </td>
      );
      columnIndex += bar.span;
      continue;
    }
    timelineCells.push(
      <td
        key={`${task.id}-empty-${column.key}`}
        className={`h-14 ${SCHEDULE_WEEK_COLUMN_CLASS} border-r border-slate-200 px-1 py-1 align-middle ${weekColumnHighlightClass(isCurrentWeekCell)}`}
      />
    );
    columnIndex += 1;
  }

  return (
    <tr className="border-b border-slate-200">
      {smtLinePhaseLayout ? (
        <>
          {smtLineGroupCell ? (
            <th
              scope="row"
              rowSpan={smtLineGroupCell.rowSpan}
              className={`sticky left-0 z-10 ${SMT_LINE_GROUP_COLUMN_CLASS} border-r border-slate-300 bg-white px-1.5 py-3 text-center align-middle text-sm font-semibold leading-snug text-slate-800`}
            >
              <span className="flex flex-col items-center justify-center gap-0.5">
                <span>{smtLineGroupCell.line1}</span>
                <span>{smtLineGroupCell.line2}</span>
              </span>
            </th>
          ) : null}
          <th
            scope="row"
            className={`sticky left-[76px] z-10 ${SMT_PHASE_LABEL_COLUMN_CLASS} border-r border-slate-300 bg-white px-3 py-3 text-left align-middle font-medium text-slate-800`}
          >
            <button
              type="button"
              onClick={() => onSelectTask(task)}
              className="w-full whitespace-nowrap text-left hover:text-sky-700"
            >
              {smtPhaseLabel ?? task.title}
            </button>
          </th>
        </>
      ) : (
        <th
          scope="row"
          className="sticky left-0 z-10 border-r border-slate-300 bg-white px-3 py-3 text-left align-middle font-medium text-slate-800"
        >
          <button
            type="button"
            onClick={() => onSelectTask(task)}
            className="w-full text-left hover:text-sky-700"
          >
            {task.title}
          </button>
        </th>
      )}
      {timelineCells}
      <td className="px-1 py-3 text-center align-middle">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onSelectTask(task)}
            disabled={deleteWeeklyPending}
            className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
          >
            {hasEntryForSelectedWeek
              ? canEdit
                ? "수정"
                : "조회"
              : canEdit
                ? "등록"
                : "조회"}
          </button>
          {canEdit && hasEntryForSelectedWeek ? (
            <button
              type="button"
              onClick={() => onDeleteRowWeekly(task.id)}
              disabled={deleteWeeklyPending}
              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
            >
              삭제
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function ScheduleBar({ label }: { label: string }) {
  return (
    <div className="flex h-10 min-w-0 items-center justify-center rounded-full bg-emerald-500 px-2 shadow-sm">
      <span className="whitespace-nowrap text-center text-xs font-semibold leading-none text-slate-900 sm:text-sm">
        {label}
      </span>
    </div>
  );
}

function WeekEvidencePanel({
  selectedWeekKey,
  weekColumns,
  tasks,
  weekly,
  downloadingEvidence,
  onDownloadEvidence,
}: {
  selectedWeekKey: string;
  weekColumns: Campus2WeekColumn[];
  tasks: Campus2ScheduleTask[];
  weekly: Campus2WeeklyPerformance[];
  downloadingEvidence: boolean;
  onDownloadEvidence: (
    storedValue: string,
    originalFilenames: string[],
    index: number
  ) => void;
}) {
  const taskMetaById = useMemo(() => {
    const map = new Map<string, { title: string; sortOrder: number }>();
    for (const task of tasks) {
      map.set(task.id, { title: task.title, sortOrder: task.sortOrder });
    }
    return map;
  }, [tasks]);

  const entries = useMemo(() => {
    if (!selectedWeekKey) return [];
    return weekly
      .filter(
        (row) => row.weekKey === selectedWeekKey && (row.evidenceUrls.length ?? 0) > 0
      )
      .map((row) => ({
        row,
        title: taskMetaById.get(row.taskId)?.title ?? "공사 일정",
        sortOrder: taskMetaById.get(row.taskId)?.sortOrder ?? 0,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [selectedWeekKey, taskMetaById, weekly]);

  return (
    <section className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-4 py-4 sm:px-5">
      <h3 className="text-sm font-semibold text-slate-800">주차별 증빙 파일</h3>
      <p className="mt-1 text-xs text-slate-500">
        {selectedWeekKey
          ? `${campus2WeekLabelFromKey(selectedWeekKey, weekColumns)}에 등록된 증빙을 확인합니다.`
          : "일정표에서 주차를 선택해 주세요."}
      </p>
      <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white px-4 py-3">
        {!selectedWeekKey ? (
          <p className="text-sm text-slate-500">주차를 선택하면 첨부 파일 목록이 표시됩니다.</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500">이 주차에 등록된 증빙 파일이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map(({ row, title }) => (
              <li key={row.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <ul className="mt-2 space-y-2">
                  {row.evidenceUrls.map((storedValue, index) => (
                    <li
                      key={`${row.id}-${storedValue}-${index}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0 truncate text-sm text-slate-700">
                        {campus2EvidenceDisplayName(
                          storedValue,
                          row.evidenceOriginalFilenames,
                          index
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onDownloadEvidence(storedValue, row.evidenceOriginalFilenames, index)
                        }
                        disabled={downloadingEvidence}
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
