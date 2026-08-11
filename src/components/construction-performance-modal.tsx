"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Upload, X } from "lucide-react";
import { AppToast, type ToastState } from "@/src/components/ui/toast";
import {
  campus2CurrentWeekKey,
  campus2DateRangeLabel,
  campus2WeekLabelFromKey,
  campus2WeeksForTask,
  mergeCampus2WeeklyEvidenceLists,
  type Campus2WeekColumn,
  type Campus2WeeklyPerformance,
} from "@/src/lib/campus2-schedule";
import {
  constructionEvidenceDisplayName,
  constructionEvidenceStoragePath,
  updateConstructionWeeklyEvidence,
  uploadConstructionWeeklyEvidenceFiles,
  type ConstructionDomain,
  type ConstructionTask,
} from "@/src/lib/construction-projects";
import { requestEvidenceSignedUrl } from "@/src/lib/evidence-download-requests";
import { useUpsertConstructionWeekly } from "@/src/hooks/useConstructionProjects";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  domain: ConstructionDomain;
  task: ConstructionTask | null;
  year: number;
  weekColumns: Campus2WeekColumn[];
  weekly: Campus2WeeklyPerformance[];
  canEdit: boolean;
  defaultWeekKey?: string;
};

export function ConstructionPerformanceModal({
  isOpen,
  onClose,
  domain,
  task,
  year,
  weekColumns,
  weekly,
  canEdit,
  defaultWeekKey = "",
}: Props) {
  const saveMutation = useUpsertConstructionWeekly(domain, year);
  const [editorWeekKey, setEditorWeekKey] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorFiles, setEditorFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
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
    const map = new Map<string, Campus2WeeklyPerformance>();
    if (!task) return map;
    for (const row of weekly) {
      if (row.taskId === task.id) map.set(row.weekKey, row);
    }
    return map;
  }, [task, weekly]);

  useEffect(() => {
    if (!isOpen || !task) return;
    const preferred = taskWeeks.some((week) => week.key === defaultWeekKey)
      ? defaultWeekKey
      : "";
    const fallback =
      preferred ||
      campus2CurrentWeekKey(taskWeeks) ||
      taskWeeks[taskWeeks.length - 1]?.key ||
      weekColumns[weekColumns.length - 1]?.key ||
      "";
    setEditorWeekKey(fallback);
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
  const existingRow = editorWeekKey ? weeklyByWeek.get(editorWeekKey) : undefined;
  const existingEvidence = existingRow?.evidenceUrls ?? [];

  async function handleDownload(storedValue: string, names: string[], index: number) {
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
      a.download = constructionEvidenceDisplayName(storedValue, names, index);
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setToast({
        open: true,
        tone: "error",
        message:
          error instanceof Error
            ? `다운로드 실패: ${error.message}`
            : "다운로드에 실패했습니다.",
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleSave() {
    if (!canEdit) {
      setToast({ open: true, tone: "error", message: "실적 등록 권한이 없습니다." });
      return;
    }
    if (!editorWeekKey) {
      setToast({ open: true, tone: "error", message: "주차를 선택해 주세요." });
      return;
    }

    try {
      setUploading(true);
      const baseInput = {
        domain,
        taskId: activeTask.id,
        year,
        weekKey: editorWeekKey,
        achievementRate: existingRow?.achievementRate ?? 0,
        description: editorDescription,
      };

      if (editorFiles.length === 0) {
        await saveMutation.mutateAsync({
          ...baseInput,
          evidenceUrls: existingRow?.evidenceUrls ?? [],
          evidenceOriginalFilenames: existingRow?.evidenceOriginalFilenames ?? [],
        });
      } else {
        const saved = await saveMutation.mutateAsync(baseInput);
        const weeklyId = saved.id || existingRow?.id || "";
        if (!weeklyId) {
          throw new Error("실적 정보 생성 중입니다. 잠시 대기 후 다시 시도해 주세요.");
        }
        const uploaded = await uploadConstructionWeeklyEvidenceFiles(weeklyId, editorFiles);
        // 기존 증빙은 유지하고 새 파일을 덧붙인다.
        const merged = mergeCampus2WeeklyEvidenceLists({
          existingUrls: existingRow?.evidenceUrls ?? [],
          existingOriginalFilenames: existingRow?.evidenceOriginalFilenames ?? [],
          uploadedPaths: uploaded.paths,
          uploadedOriginalFilenames: uploaded.originalFilenames,
          replaceExisting: false,
        });
        await updateConstructionWeeklyEvidence({
          domain,
          weeklyId,
          evidenceUrls: merged.evidenceUrls,
          evidenceOriginalFilenames: merged.evidenceOriginalFilenames,
        });
      }
      setToast({ open: true, tone: "success", message: "주간 실적이 저장되었습니다." });
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

  const savePending = saveMutation.isPending || uploading;

  const modal = (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800">{activeTask.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              계획 일정 {campus2DateRangeLabel(activeTask.planStart, activeTask.planEnd)}
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
            <span className="font-medium text-slate-700">주차</span>
            <select
              value={editorWeekKey}
              onChange={(event) => setEditorWeekKey(event.target.value)}
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
              onChange={(event) => setEditorDescription(event.target.value)}
              disabled={!canEdit}
              rows={4}
              className="resize-y rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none ring-sky-300 focus-visible:ring-2 disabled:bg-slate-50"
              placeholder="주간 진행 내용을 입력하세요."
            />
          </label>

          <div className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">
              이 주차에 등록된 증빙 ({existingEvidence.length})
            </span>
            {existingEvidence.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                아직 등록된 증빙이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                {existingEvidence.map((storedValue, index) => (
                  <li
                    key={`${storedValue}-${index}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-xs text-slate-700">
                      {constructionEvidenceDisplayName(
                        storedValue,
                        existingRow?.evidenceOriginalFilenames ?? [],
                        index
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownload(
                          storedValue,
                          existingRow?.evidenceOriginalFilenames ?? [],
                          index
                        )
                      }
                      disabled={downloading}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-white px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-60"
                    >
                      <Download className="h-3 w-3" aria-hidden />
                      다운로드
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canEdit ? (
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">증빙 파일 추가</span>
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
                    setEditorFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {editorFiles.length > 0 ? (
                <ul className="space-y-1 text-xs text-slate-600">
                  {editorFiles.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}-${index}`} className="truncate">
                      + {file.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-slate-500">
                새 파일은 기존 증빙에 <strong className="text-slate-700">추가</strong>되며 기존 파일은 유지됩니다.
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              조회만 가능합니다. 실적 등록·수정은 그룹장·팀장·관리자만 할 수 있습니다.
            </p>
          )}
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
              onClick={() => void handleSave()}
              disabled={savePending}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {savePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              저장
            </button>
          ) : null}
        </div>
      </div>
      <AppToast
        state={toast}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        position="top-center"
      />
    </div>
  );

  return createPortal(modal, document.body);
}
