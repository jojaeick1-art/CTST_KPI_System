"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Upload, X } from "lucide-react";
import { AppToast, type ToastState } from "@/src/components/ui/toast";
import {
  campus2CurrentWeekKey,
  campus2DateRangeLabel,
  campus2WeekLabelFromKey,
  campus2WeeksForTask,
  uploadCampus2EvidenceFiles,
  updateCampus2WeeklyEvidence,
  mergeCampus2WeeklyEvidenceLists,
  type Campus2ScheduleTask,
  type Campus2WeekColumn,
  type Campus2WeeklyPerformance,
} from "@/src/lib/campus2-schedule";
import { useUpsertCampus2WeeklyPerformance } from "@/src/hooks/useCampus2Schedule";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  task: Campus2ScheduleTask | null;
  year: number;
  weekColumns: Campus2WeekColumn[];
  weekly: Campus2WeeklyPerformance[];
  canEdit: boolean;
  defaultWeekKey?: string;
};

export function Campus2SchedulePerformanceModal({
  isOpen,
  onClose,
  task,
  year,
  weekColumns,
  weekly,
  canEdit,
  defaultWeekKey = "",
}: Props) {
  const saveMutation = useUpsertCampus2WeeklyPerformance(year);
  const [editorWeekKey, setEditorWeekKey] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorFiles, setEditorFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "info",
  });

  const taskWeeks = useMemo(
    () => (task ? campus2WeeksForTask(task, weekColumns) : []),
    [task, weekColumns]
  );

  const weeklyByWeek = useMemo(() => {
    if (!task) return new Map<string, Campus2WeeklyPerformance>();
    const map = new Map<string, Campus2WeeklyPerformance>();
    for (const row of weekly) {
      if (row.taskId === task.id) map.set(row.weekKey, row);
    }
    return map;
  }, [task, weekly]);

  useEffect(() => {
    if (!isOpen || !task) return;
    const preferredWeek = taskWeeks.some((week) => week.key === defaultWeekKey)
      ? defaultWeekKey
      : "";
    const defaultWeek =
      preferredWeek ||
      campus2CurrentWeekKey(taskWeeks) ||
      taskWeeks[taskWeeks.length - 1]?.key ||
      weekColumns[weekColumns.length - 1]?.key ||
      "";
    setEditorWeekKey(defaultWeek);
    setEditorFiles([]);
  }, [defaultWeekKey, isOpen, task, taskWeeks, weekColumns]);

  useEffect(() => {
    if (!isOpen || !task || !editorWeekKey) return;
    const existing = weeklyByWeek.get(editorWeekKey);
    setEditorDescription(existing?.description ?? "");
    setEditorFiles([]);
  }, [editorWeekKey, isOpen, task, weeklyByWeek]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !task) return null;
  const activeTask = task;
  const hadStoredEvidenceForWeek =
    (editorWeekKey ? weeklyByWeek.get(editorWeekKey)?.evidenceUrls.length ?? 0 : 0) > 0;

  async function handleSave() {
    if (!canEdit) {
      setToast({ open: true, tone: "error", message: "실적 등록 권한이 없습니다." });
      return;
    }
    if (!editorWeekKey) {
      setToast({ open: true, tone: "error", message: "주차를 선택해 주세요." });
      return;
    }

    const existing = weeklyByWeek.get(editorWeekKey);
    const hadStoredEvidence = (existing?.evidenceUrls.length ?? 0) > 0;
    if (!hadStoredEvidence && editorFiles.length === 0) {
      setToast({
        open: true,
        tone: "error",
        message: "증빙 파일을 첨부해야 실적을 등록할 수 있습니다.",
      });
      return;
    }

    try {
      setUploading(true);
      const baseInput = {
        taskId: activeTask.id,
        year,
        weekKey: editorWeekKey,
        achievementRate: existing?.achievementRate ?? 0,
        description: editorDescription,
      };

      if (editorFiles.length === 0) {
        await saveMutation.mutateAsync({
          ...baseInput,
          evidenceUrls: existing?.evidenceUrls ?? [],
          evidenceOriginalFilenames: existing?.evidenceOriginalFilenames ?? [],
        });
      } else {
        const saved = await saveMutation.mutateAsync(baseInput);
        const weeklyId = saved.id || existing?.id || "";
        if (!weeklyId) {
          throw new Error(
            "실적 정보 생성 중입니다. 잠시 대기 후 다시 시도해 주세요."
          );
        }
        const uploaded = await uploadCampus2EvidenceFiles(weeklyId, editorFiles);
        const mergedEvidence = mergeCampus2WeeklyEvidenceLists({
          existingUrls: existing?.evidenceUrls ?? [],
          existingOriginalFilenames: existing?.evidenceOriginalFilenames ?? [],
          uploadedPaths: uploaded.paths,
          uploadedOriginalFilenames: uploaded.originalFilenames,
          replaceExisting: hadStoredEvidence,
        });
        await updateCampus2WeeklyEvidence({
          weeklyId,
          evidenceUrls: mergedEvidence.evidenceUrls,
          evidenceOriginalFilenames: mergedEvidence.evidenceOriginalFilenames,
        });
      }
      setToast({
        open: true,
        tone: "success",
        message: "주간 실적이 바로 반영되었습니다.",
      });
      onClose();
    } catch (error) {
      setToast({
        open: true,
        tone: "error",
        message: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.",
      });
    } finally {
      setUploading(false);
    }
  }

  const modal = (
    <ModalOverlay onClose={onClose}>
      <ModalPanel
        task={task}
        canEdit={canEdit}
        editorWeekKey={editorWeekKey}
        editorDescription={editorDescription}
        editorFiles={editorFiles}
        taskWeeks={taskWeeks}
        weekColumns={weekColumns}
        hadStoredEvidence={hadStoredEvidenceForWeek}
        savePending={saveMutation.isPending || uploading}
        onClose={onClose}
        onWeekChange={setEditorWeekKey}
        onDescriptionChange={setEditorDescription}
        onFilesChange={setEditorFiles}
        onSave={() => void handleSave()}
      />
      <AppToast
        state={toast}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        position="top-center"
      />
    </ModalOverlay>
  );

  return createPortal(modal, document.body);
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

function ModalPanel({
  task,
  canEdit,
  editorWeekKey,
  editorDescription,
  editorFiles,
  taskWeeks,
  weekColumns,
  hadStoredEvidence,
  savePending,
  onClose,
  onWeekChange,
  onDescriptionChange,
  onFilesChange,
  onSave,
}: {
  task: Campus2ScheduleTask;
  canEdit: boolean;
  editorWeekKey: string;
  editorDescription: string;
  editorFiles: File[];
  taskWeeks: Campus2WeekColumn[];
  weekColumns: Campus2WeekColumn[];
  hadStoredEvidence: boolean;
  savePending: boolean;
  onClose: () => void;
  onWeekChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl shadow-sky-100/60">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800">{task.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            계획 일정 {campus2DateRangeLabel(task.planStart, task.planEnd)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="닫기"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="overflow-y-auto px-5 py-4">
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">주차</span>
            <select
              value={editorWeekKey}
              onChange={(event) => onWeekChange(event.target.value)}
              disabled={!canEdit}
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2 disabled:bg-slate-50"
            >
              {taskWeeks.map((week) => (
                <option key={week.key} value={week.key}>
                  {campus2WeekLabelFromKey(week.key, weekColumns)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">특이사항</span>
            <textarea
              value={editorDescription}
              onChange={(event) => onDescriptionChange(event.target.value)}
              disabled={!canEdit}
              rows={4}
              className="resize-y rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2 disabled:bg-slate-50"
              placeholder="주간 진행 내용을 입력하세요."
            />
          </label>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">
              증빙 파일 <span className="text-red-600">(필수)</span>
            </span>
            {canEdit ? (
              <>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-slate-700 hover:bg-sky-50">
                  <Upload className="h-4 w-4 text-sky-600" aria-hidden />
                  <span>
                    {editorFiles.length > 0
                      ? `${editorFiles.length}개 파일 선택됨`
                      : "파일 선택(여러 개 가능)"}
                  </span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      onFilesChange(Array.from(event.target.files ?? []));
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {editorFiles.length > 0 ? (
                  <ul className="space-y-1 text-xs text-slate-600">
                    {editorFiles.map((file, index) => (
                      <li key={`${file.name}-${file.lastModified}-${index}`} className="truncate">
                        {file.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-slate-500">
                  {hadStoredEvidence
                    ? "이미 등록된 증빙이 있는 주차입니다. 새 파일을 선택하면 이 공사 일정의 증빙이 선택한 파일로 교체됩니다."
                    : "선택한 파일은 이 공사 일정·주차에 추가됩니다. 다른 공사 일정의 기존 증빙은 유지됩니다."}{" "}
                  첨부 목록은 일정표 하단에서 확인할 수 있습니다.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                첨부 파일은 일정표 하단에서 확인할 수 있습니다.
              </p>
            )}
          </div>
          {!canEdit ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              조회만 가능합니다. 실적 등록/수정은 그룹장·팀장·관리자만 할 수 있습니다.
            </p>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              이 일정 KPI는 승인 절차 없이 저장 즉시 반영됩니다.
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          닫기
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={onSave}
            disabled={savePending}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {savePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            저장
          </button>
        ) : null}
      </div>
    </div>
  );
}
