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
  type Campus2WeeklyPerformance,
} from "@/src/lib/campus2-schedule";
import { requestEvidenceSignedUrl } from "@/src/lib/evidence-download-requests";
import { Campus2SchedulePerformanceModal } from "@/src/components/campus2-schedule-performance-modal";
import { useUpsertCampus2OverallAchievement } from "@/src/hooks/useCampus2Schedule";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  tasks: Campus2ScheduleTask[];
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  overallAchievement: number;
  canEdit: boolean;
};

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

function hasWeeklyEntry(taskId: string, weekly: Campus2WeeklyPerformance[]): boolean {
  return weekly.some((row) => row.taskId === taskId);
}

export function Campus2ScheduleDetailModal({
  isOpen,
  onClose,
  year,
  tasks,
  weekly,
  weekColumns,
  overallAchievement,
  canEdit,
}: Props) {
  const [selectedTask, setSelectedTask] = useState<Campus2ScheduleTask | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState("");
  const [overallDraft, setOverallDraft] = useState("");
  const [downloadingEvidence, setDownloadingEvidence] = useState(false);
  const overallMutation = useUpsertCampus2OverallAchievement(year);
  const monthGroups = useMemo(() => groupWeekColumns(weekColumns), [weekColumns]);

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

  async function handleDownloadEvidence(
    storedValue: string,
    originalFilenames: string[],
    index: number
  ) {
    const relPath = campus2EvidenceStoragePath(storedValue);
    if (!relPath) return;
    let downloadWindow: Window | null = null;
    try {
      setDownloadingEvidence(true);
      downloadWindow = window.open("about:blank", "_blank");
      if (downloadWindow) downloadWindow.opener = null;
      const signedUrl = await requestEvidenceSignedUrl(relPath);
      if (downloadWindow) {
        downloadWindow.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      downloadWindow?.close();
    } finally {
      setDownloadingEvidence(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <DetailPanel>
        <div className="shrink-0 border-b border-sky-200 bg-gradient-to-br from-sky-600 to-sky-700 px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold leading-snug text-white sm:text-2xl">
                CTST 2Campus 공사 일정
              </h2>
              <p className="mt-1 text-sm text-sky-50/90">
                {canEdit
                  ? "주요 공사 일정과 주간 실적을 등록·수정할 수 있습니다."
                  : "주요 공사 일정과 주간 실적을 조회할 수 있습니다."}
              </p>
              {!canEdit ? (
                <p className="mt-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-sky-50/95">
                  실적 등록·수정과 종합 달성률 입력은 그룹장·팀장·관리자만 할 수 있습니다.
                </p>
              ) : null}
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-right">
                <p className="text-[11px] font-medium text-sky-50/90">종합 달성률</p>
                {canEdit ? (
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={overallDraft}
                      onChange={(event) => setOverallDraft(event.target.value)}
                      onBlur={() => void handleSaveOverall()}
                      className="w-24 rounded-lg border border-white/20 bg-white/95 px-2 py-1 text-right text-xl font-bold tabular-nums text-slate-800 outline-none ring-sky-300 focus-visible:ring-2"
                    />
                    <span className="text-sm font-medium text-sky-100">%</span>
                    {overallMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-50" aria-hidden />
                    ) : null}
                  </div>
                ) : (
                  <p className="text-2xl font-bold tabular-nums text-white">
                    {overallAchievement.toFixed(1)}
                    <span className="text-sm font-medium text-sky-100">%</span>
                  </p>
                )}
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <ScheduleTable
            tasks={tasks}
            weekly={weekly}
            weekColumns={weekColumns}
            monthGroups={monthGroups}
            selectedWeekKey={selectedWeekKey}
            canEdit={canEdit}
            onSelectWeek={setSelectedWeekKey}
            onSelectTask={setSelectedTask}
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

      <Campus2SchedulePerformanceModal
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

function DetailPanel({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex max-h-[95vh] w-full max-w-[min(100%,88rem)] flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl shadow-sky-200/50">
      {children}
    </div>
  );
}

function weekColumnHighlightClass(isCurrentWeek: boolean): string {
  return isCurrentWeek ? "bg-amber-50/70" : "";
}

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
  selectedWeekKey,
  canEdit,
  onSelectWeek,
  onSelectTask,
}: {
  tasks: Campus2ScheduleTask[];
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  monthGroups: MonthGroup[];
  selectedWeekKey: string;
  canEdit: boolean;
  onSelectWeek: (weekKey: string) => void;
  onSelectTask: (task: Campus2ScheduleTask) => void;
}) {
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
      <table className="min-w-[960px] w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-700">
            <th
              rowSpan={2}
              className="sticky left-0 z-20 min-w-[240px] border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold"
            >
              주요 공사 일정
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
              className="min-w-[88px] border-b border-slate-300 px-2 py-2 text-center font-semibold"
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
                className={`min-w-[72px] border-b border-r border-slate-300 px-1 py-2 text-center text-xs font-medium ${weekColumnHighlightClass(isCurrentWeek)}`}
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
          {tasks.map((task) => (
            <ScheduleRow
              key={task.id}
              task={task}
              weekly={weekly}
              weekColumns={weekColumns}
              currentWeekIndex={currentWeekIndex}
              canEdit={canEdit}
              onSelectTask={onSelectTask}
            />
          ))}
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
  canEdit,
  onSelectTask,
}: {
  task: Campus2ScheduleTask;
  weekly: Campus2WeeklyPerformance[];
  weekColumns: Campus2WeekColumn[];
  currentWeekIndex: number;
  canEdit: boolean;
  onSelectTask: (task: Campus2ScheduleTask) => void;
}) {
  const bar = campus2TaskBarSpan(task, weekColumns);
  const hasEntry = hasWeeklyEntry(task.id, weekly);
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
        className={`h-14 border-r border-slate-200 px-1 py-1 align-middle ${weekColumnHighlightClass(isCurrentWeekCell)}`}
      />
    );
    columnIndex += 1;
  }

  return (
    <tr className="border-b border-slate-200">
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
      {timelineCells}
      <td className="px-2 py-3 text-center align-middle">
        <button
          type="button"
          onClick={() => onSelectTask(task)}
          className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
        >
          {hasEntry ? (canEdit ? "수정" : "조회") : canEdit ? "등록" : "조회"}
        </button>
      </td>
    </tr>
  );
}

function ScheduleBar({ label }: { label: string }) {
  return (
    <div className="flex h-10 items-center justify-center rounded-full bg-emerald-500 px-4 shadow-sm">
      <span className="truncate text-center text-sm font-semibold text-slate-900">
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
