"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Eye, FilePenLine, ImageIcon, Loader2, Upload, X } from "lucide-react";
import {
  KPI_QUARTERS,
  PERF_LEGACY_PENDING,
  PERF_STATUS_APPROVED,
  PERF_STATUS_PENDING_FINAL,
  PERF_STATUS_PENDING_PRIMARY,
  isWriterPerformanceLockedByStep,
  quarterLabelToHalfTypeCanonical,
  evidenceFileNameFromStoredValue,
  evidencePathFromStoredValue,
  resolveEvidencePublicUrl,
  normalizeHalfTypeKey,
  type ItemPerformanceRow,
  type QuarterLabel,
  updateKpiTargetEvidenceUrl,
  uploadEvidenceFile,
} from "@/src/lib/kpi-queries";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  canGroupLeaderApprove,
  canTeamLeaderFinalApprove,
  isAdminRole,
  normalizeRole,
} from "@/src/lib/rbac";
import { AppToast, type ToastState } from "@/src/components/ui/toast";

type KpiModalItem = {
  id: string;
  mainTopic: string;
  subTopic: string;
  detailActivity: string;
  bm: string;
  weight: string;
  owner: string;
  halfYearSummary: string;
  challengeTarget: number | null;
  firstHalfRate: number | null;
  secondHalfRate: number | null;
  firstHalfTarget: number | null;
  secondHalfTarget: number | null;
  h1TargetDate: string | null;
  h2TargetDate: string | null;
  scheduleRaw: string | null;
};
import {
  useKpiPerformances,
  useUpsertQuarterPerformance,
  useWorkflowReviewMutation,
} from "@/src/hooks/useKpiQueries";

type ChartDatum = {
  quarter: QuarterLabel | "KPI Start";
  target: number;
  actual: number;
  description: string | null;
  evidence_url: string | null;
  hasComment: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  kpiItem: KpiModalItem | null;
  startMode: "viewer" | "editor";
  /** 선임/프로·권한 없음 등: 뷰어만 */
  canEditPerformance?: boolean;
  /** 로그인 사용자 `profiles.role` (한글·영문) — 승인 버튼 노출용 */
  profileRole?: string | null;
  /** 관리자 전용 KPI 항목 삭제 */
  canDeleteKpiItem?: boolean;
  onDeleteKpiItem?: (kpiId: string) => Promise<void> | void;
};

function toNumber(v: string): number | null {
  const n = Number(v);
  return Number.isNaN(n) ? null : Math.min(100, Math.max(0, n));
}

function quarterByDateText(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2})\s*[\/.\-월]/);
  if (!m?.[1]) return null;
  const month = Number(m[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

function isApprovedStep(step: string | null | undefined): boolean {
  return (step?.trim().toLowerCase() ?? "") === PERF_STATUS_APPROVED;
}

function isChartVisibleStep(step: string | null | undefined): boolean {
  const s = (step?.trim().toLowerCase() ?? "");
  return s === PERF_STATUS_PENDING_FINAL || s === PERF_STATUS_APPROVED;
}

/** 목표(Target): 엑셀·목표 전용 필드 우선 (firstHalfTarget). firstHalfRate는 상세 API에서 목표와 동일 소스로 맞춤 */
function quarterTarget(item: KpiModalItem, quarter: QuarterLabel): number {
  const qNum = Number(quarter[4]);
  const h1q = quarterByDateText(item.h1TargetDate);
  const h2q = quarterByDateText(item.h2TargetDate);
  const h1v = item.firstHalfTarget ?? item.firstHalfRate ?? 100;
  const h2v =
    item.secondHalfTarget ??
    item.secondHalfRate ??
    item.challengeTarget ??
    h1v;

  const lerp = (
    x: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): number => {
    if (x1 === x0) return y1;
    const t = (x - x0) / (x1 - x0);
    return y0 + (y1 - y0) * t;
  };

  if (h1q !== null || h2q !== null) {
    // KPI Start(0)에서 각 목표 시점까지 분기 기준 선형 보간
    if (h1q !== null && h2q !== null) {
      if (h2q <= h1q) {
        if (qNum <= h1q) return Number(lerp(qNum, 0, 0, h1q, h1v).toFixed(1));
        return h2v;
      }
      if (qNum <= h1q) return Number(lerp(qNum, 0, 0, h1q, h1v).toFixed(1));
      if (qNum <= h2q) return Number(lerp(qNum, h1q, h1v, h2q, h2v).toFixed(1));
      return h2v;
    }
    if (h1q !== null) {
      if (qNum <= h1q) return Number(lerp(qNum, 0, 0, h1q, h1v).toFixed(1));
      return h1v;
    }
    if (h2q !== null) {
      if (qNum <= h2q) return Number(lerp(qNum, 0, 0, h2q, h2v).toFixed(1));
      return h2v;
    }
  }
  if (qNum <= 2 && item.firstHalfTarget !== null) return item.firstHalfTarget;
  if (qNum >= 3 && item.secondHalfTarget !== null) return item.secondHalfTarget;
  if (item.challengeTarget !== null) return item.challengeTarget;
  return 0;
}

function parseQuarter(label: string): number {
  const idx = KPI_QUARTERS.findIndex((q) => q === label);
  return idx >= 0 ? idx : -1;
}

function quarterLabelFromHalfType(raw: string | null | undefined): QuarterLabel | null {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/(25|26)\s*Y?\s*([1-4])\s*Q/);
  if (m?.[1] && m?.[2]) {
    const q = `${m[1]}Y ${m[2]}Q`;
    return KPI_QUARTERS.includes(q as QuarterLabel) ? (q as QuarterLabel) : null;
  }
  const qOnly = s.match(/([1-4])\s*Q/);
  if (qOnly?.[1]) {
    const q = `${KPI_QUARTERS[0]!.slice(0, 3)} ${qOnly[1]}Q`;
    return KPI_QUARTERS.includes(q as QuarterLabel) ? (q as QuarterLabel) : null;
  }
  return null;
}

function findRowByQuarter(rows: ItemPerformanceRow[], q: QuarterLabel): ItemPerformanceRow | null {
  const exact = rows.find((r) => quarterLabelFromHalfType(r.half_type) === q);
  if (exact) return exact;
  const hc = quarterLabelToHalfTypeCanonical(q);
  const fallback = rows.find((r) => normalizeHalfTypeKey(r.half_type) === hc);
  return fallback ?? null;
}

function activeQuarterSet(scheduleRaw: string | null): Set<QuarterLabel> {
  const full = new Set<QuarterLabel>(KPI_QUARTERS);
  if (!scheduleRaw || !scheduleRaw.trim()) return full;
  const text = scheduleRaw.trim();

  const direct = KPI_QUARTERS.filter((q) => text.includes(q));
  if (direct.length >= 2) {
    const s = parseQuarter(direct[0]);
    const e = parseQuarter(direct[direct.length - 1]);
    if (s >= 0 && e >= s) return new Set(KPI_QUARTERS.slice(s, e + 1));
  }

  const matches = Array.from(text.matchAll(/(25|26)\D*([1-4])Q/gi)).map((m) => {
    const y = m[1];
    const q = m[2];
    return `${y}Y ${q}Q`;
  });
  if (matches.length >= 2) {
    const s = parseQuarter(matches[0]!);
    const e = parseQuarter(matches[matches.length - 1]!);
    if (s >= 0 && e >= s) return new Set(KPI_QUARTERS.slice(s, e + 1));
  }

  return full;
}

function quarterSetFromTargetDates(
  h1TargetDate: string | null | undefined,
  h2TargetDate: string | null | undefined
): Set<QuarterLabel> {
  const out = new Set<QuarterLabel>();
  const h1q = quarterByDateText(h1TargetDate ?? null);
  const h2q = quarterByDateText(h2TargetDate ?? null);
  if (h1q !== null) {
    const end = Math.min(2, Math.max(1, h1q));
    for (let qn = 1; qn <= end; qn += 1) {
      const q = `26Y ${qn}Q` as QuarterLabel;
      if (KPI_QUARTERS.includes(q)) out.add(q);
    }
  }
  if (h2q !== null) {
    const end = Math.min(4, Math.max(3, h2q));
    const start = h1q === null ? 1 : 3;
    for (let qn = start; qn <= end; qn += 1) {
      const q = `26Y ${qn}Q` as QuarterLabel;
      if (KPI_QUARTERS.includes(q)) out.add(q);
    }
  }
  return out;
}

function performanceStatusLabelKo(status: string | null | undefined): string {
  const s = status?.trim().toLowerCase() ?? "";
  if (s === "draft") return "제출 전";
  if (s === "pending_primary" || s === "pending") return "1차 승인 대기";
  if (s === PERF_STATUS_PENDING_FINAL) return "최종 승인 대기";
  if (s === PERF_STATUS_APPROVED) return "승인 완료";
  return status?.trim() ? status.trim() : "—";
}

function statusTimelineIndex(status: string | null | undefined): number {
  const s = (status ?? "").trim().toLowerCase();
  if (!s || s === "draft") return 0;
  if (s === "pending_primary" || s === "pending") return 1;
  if (s === PERF_STATUS_PENDING_FINAL) return 2;
  if (s === PERF_STATUS_APPROVED) return 3;
  return 0;
}

function previewComment(text: string | null, max = 52): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** 비관리자: draft(또는 비어 있음)만 편집 가능. 관리자는 항상 편집 가능. */
function quarterLockedForEditor(
  step: string | null | undefined,
  canOverrideLock: boolean
): boolean {
  if (canOverrideLock) return false;
  return isWriterPerformanceLockedByStep(step);
}

function KpiChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-sky-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <p className="font-semibold text-slate-800">{d.quarter}</p>
      <p className="text-slate-600">목표 {d.target}%</p>
      <p className="text-sky-700">실적 {d.actual}%</p>
      {d.hasComment && d.description ? (
        <p className="mt-1 max-w-[220px] border-t border-sky-100 pt-1 text-[11px] leading-snug text-slate-500">
          {previewComment(d.description, 72)}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">코멘트 없음</p>
      )}
    </div>
  );
}

export function PerformanceModal({
  isOpen,
  onClose,
  kpiItem,
  startMode,
  canEditPerformance = true,
  profileRole = null,
  canDeleteKpiItem = false,
  onDeleteKpiItem,
}: Props) {
  const perfQuery = useKpiPerformances(isOpen && kpiItem ? kpiItem.id : null);
  const saveMutation = useUpsertQuarterPerformance();
  const workflowMut = useWorkflowReviewMutation();
  const [mode, setMode] = useState<"viewer" | "editor">("viewer");
  const [selectedQuarter, setSelectedQuarter] = useState<QuarterLabel>(KPI_QUARTERS[0]!);
  const [editorQuarter, setEditorQuarter] = useState<QuarterLabel>(KPI_QUARTERS[0]!);
  const [editorRate, setEditorRate] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [liveRows, setLiveRows] = useState<ItemPerformanceRow[]>([]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [downloadingEvidence, setDownloadingEvidence] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "info",
  });

  const isAdmin = isAdminRole(profileRole);
  const normalizedRole = normalizeRole(profileRole);
  const isPrivilegedEditor =
    isAdmin ||
    normalizedRole === "group_leader" ||
    normalizedRole === "team_leader";

  const activeSet = useMemo(() => {
    const byMonth = quarterSetFromTargetDates(
      kpiItem?.h1TargetDate ?? null,
      kpiItem?.h2TargetDate ?? null
    );
    if (byMonth.size > 0) return byMonth;
    return activeQuarterSet(kpiItem?.scheduleRaw ?? null);
  }, [kpiItem?.h1TargetDate, kpiItem?.h2TargetDate, kpiItem?.scheduleRaw]);

  const rowByUiQuarter = useMemo(() => {
    const m = new Map<QuarterLabel, ItemPerformanceRow>();
    const exactRows = new Map<QuarterLabel, ItemPerformanceRow>();
    const fallbackRows = liveRows.filter((r) => quarterLabelFromHalfType(r.half_type) === null);
    for (const r of liveRows) {
      const q = quarterLabelFromHalfType(r.half_type);
      if (q && !exactRows.has(q)) exactRows.set(q, r);
    }
    for (const q of KPI_QUARTERS) {
      const exact = exactRows.get(q);
      if (exact) {
        m.set(q, exact);
        continue;
      }
      const hc = quarterLabelToHalfTypeCanonical(q);
      const fallback = fallbackRows.find(
        (r) => normalizeHalfTypeKey(r.half_type) === hc
      );
      if (fallback) m.set(q, fallback);
    }
    return m;
  }, [liveRows]);

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    const effectiveMode =
      canEditPerformance ? startMode : "viewer";
    setMode(effectiveMode);
    const firstActive = KPI_QUARTERS.find((q) => activeSet.has(q)) ?? KPI_QUARTERS[0]!;
    setSelectedQuarter(firstActive);
    setEditorQuarter(firstActive);
  }, [isOpen, kpiItem, startMode, canEditPerformance, activeSet]);

  useEffect(() => {
    if (!isOpen || !kpiItem) return;
    const rows = perfQuery.data ?? [];
    setLiveRows(rows);
  }, [isOpen, kpiItem, perfQuery.data]);

  useEffect(() => {
    if (isOpen) return;
    setRejectModalOpen(false);
    setRejectReasonDraft("");
  }, [isOpen]);

  const chartData: ChartDatum[] = useMemo(() => {
    if (!kpiItem) return [];
    const series = KPI_QUARTERS.map((q) => {
      const row = rowByUiQuarter.get(q);
      const visibleOnChart = isChartVisibleStep(row?.approval_step ?? null);
      const rawSubmitted =
        row?.achievement_rate !== null &&
        row?.achievement_rate !== undefined &&
        !Number.isNaN(Number(row.achievement_rate))
          ? Number(row.achievement_rate)
          : null;
      const actual = visibleOnChart && rawSubmitted !== null ? rawSubmitted : 0;
      const description = row?.description ?? null;
      return {
        quarter: q,
        target: quarterTarget(kpiItem, q),
        actual,
        description,
        evidence_url: row?.evidence_url ?? null,
        hasComment: Boolean(description?.trim()),
      };
    });
    return [
      {
        quarter: "KPI Start",
        target: 0,
        actual: 0,
        description: null,
        evidence_url: null,
        hasComment: false,
      },
      ...series,
    ];
  }, [kpiItem, rowByUiQuarter]);

  const selectedRow = rowByUiQuarter.get(selectedQuarter) ?? null;
  const selectedSubmittedPercent =
    selectedRow?.achievement_rate !== null &&
    selectedRow?.achievement_rate !== undefined
      ? selectedRow.achievement_rate
      : null;
  const chartActualSelected =
    chartData.find((d) => d.quarter === selectedQuarter)?.actual ?? 0;
  const selectedDescription = selectedRow?.description ?? null;
  const selectedEvidenceStored =
    selectedRow?.evidence_path ??
    selectedRow?.evidence_url ??
    liveRows.find((r) => (r.evidence_path ?? r.evidence_url)?.trim())
      ?.evidence_path ??
    liveRows.find((r) => (r.evidence_path ?? r.evidence_url)?.trim())
      ?.evidence_url ??
    null;
  const selectedEvidencePath = evidencePathFromStoredValue(selectedEvidenceStored);
  const selectedEvidenceFileName = evidenceFileNameFromStoredValue(
    selectedEvidenceStored
  );
  const selectedStatus = selectedRow?.approval_step ?? null;
  const selectedRejectionReason = selectedRow?.rejection_reason ?? null;
  const selectedQuarterWritableByWriter = !quarterLockedForEditor(
    selectedStatus,
    isPrivilegedEditor
  );
  const canOpenRegister = canEditPerformance || isPrivilegedEditor;
  const canOpenModify = isPrivilegedEditor;
  const writerLockedNow =
    !isPrivilegedEditor && isWriterPerformanceLockedByStep(selectedStatus);

  const notify = useCallback((tone: ToastState["tone"], message: string) => {
    setToast({ open: true, message, tone });
  }, []);

  useEffect(() => {
    if (!toast.open) return;
    const t = setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 2800);
    return () => clearTimeout(t);
  }, [toast.open]);

  async function handleDownloadEvidence() {
    if (!selectedEvidenceStored) {
      notify("info", "증빙 자료가 없습니다.");
      return;
    }
    try {
      setDownloadingEvidence(true);
      const downloadableUrl = resolveEvidencePublicUrl(selectedEvidenceStored);
      if (!downloadableUrl) {
        throw new Error("다운로드 가능한 파일 주소를 생성하지 못했습니다.");
      }
      window.open(downloadableUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "파일 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloadingEvidence(false);
    }
  }

  const workflowPrimaryVisible = useMemo(() => {
    if (!profileRole || !selectedRow?.id) return false;
    const st = (selectedStatus ?? "").trim().toLowerCase();
    return (
      canGroupLeaderApprove(profileRole) &&
      (st === PERF_STATUS_PENDING_PRIMARY || st === PERF_LEGACY_PENDING)
    );
  }, [profileRole, selectedRow?.id, selectedStatus]);

  const workflowFinalVisible = useMemo(() => {
    if (!profileRole || !selectedRow?.id) return false;
    const st = (selectedStatus ?? "").trim().toLowerCase();
    return (
      canTeamLeaderFinalApprove(profileRole) && st === PERF_STATUS_PENDING_FINAL
    );
  }, [profileRole, selectedRow?.id, selectedStatus]);

  const editorRow = findRowByQuarter(liveRows, editorQuarter);
  const editorQuarterLocked = quarterLockedForEditor(
    editorRow?.approval_step,
    isPrivilegedEditor
  );

  const syncEditorFromQuarter = useCallback(
    (q: QuarterLabel) => {
      const row = findRowByQuarter(liveRows, q);
      setEditorRate(
        row?.achievement_rate !== null && row?.achievement_rate !== undefined
          ? String(row.achievement_rate)
          : ""
      );
      setEditorDescription(row?.description ?? "");
      setEditorFile(null);
    },
    [liveRows]
  );

  useEffect(() => {
    if (mode !== "editor") return;
    syncEditorFromQuarter(editorQuarter);
  }, [mode, editorQuarter, liveRows, syncEditorFromQuarter]);

  if (!isOpen || !kpiItem) return null;
  const item = kpiItem;

  async function handleSaveQuarter() {
    if (!activeSet.has(editorQuarter)) {
      notify("error", "해당 분기는 프로젝트 기간에 포함되지 않습니다.");
      return;
    }
    if (editorQuarterLocked) {
      notify(
        "error",
        "승인 대기 중이거나 승인 완료된 분기는 그룹장·팀장·관리자만 수정할 수 있습니다."
      );
      return;
    }
    if (!editorRate.trim()) {
      notify("error", "달성률(%)을 입력해 주세요.");
      return;
    }
    const rateNum = toNumber(editorRate);
    if (rateNum === null) {
      notify("error", "달성률(%)을 입력해 주세요.");
      return;
    }
    try {
      // 1) 실적 행(kpi_targets)을 먼저 확보/저장하고 targetId를 받는다.
      const saveResult = await saveMutation.mutateAsync({
        kpiId: item.id,
        quarter: editorQuarter,
        achievement_rate: rateNum,
        description: editorDescription,
        ...(isAdmin ? { adminBypassApprovalLock: true } : {}),
        actorRole: profileRole ?? null,
      });

      // 2) target_id 확보 후 파일 업로드 + evidence_url 업데이트
      if (editorFile) {
        const targetId =
          saveResult && typeof saveResult.targetId === "string"
            ? saveResult.targetId
            : "";
        if (!targetId) {
          console.error("[KPI upload] upsert 후 targetId 누락", {
            kpiId: item.id,
            quarter: editorQuarter,
          });
          throw new Error(
            "실적 정보 생성 중입니다. 잠시 대기 후 다시 시도해 주세요."
          );
        }
        setUploading(true);
        const uploaded = await uploadEvidenceFile(
          targetId,
          editorFile,
          editorQuarter
        );
        await updateKpiTargetEvidenceUrl({
          targetId,
          evidenceUrl: uploaded.fullPath,
        });
      }

      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      setEditorFile(null);
      notify(
        "success",
        `${editorQuarter} 실적이 저장되었습니다. (상태: 1차 승인 대기 — 그룹장 검토)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장 실패";
      notify("error", message);
    } finally {
      setUploading(false);
    }
  }

  async function handleModalApprovePrimary() {
    const rid = rowByUiQuarter.get(selectedQuarter)?.id;
    if (!rid) return;
    try {
      await workflowMut.mutateAsync({
        performanceId: rid,
        action: "approve_primary",
      });
      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      notify("success", "1차 승인되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "1차 승인에 실패했습니다.");
    }
  }

  async function handleModalApproveFinal() {
    const rid = rowByUiQuarter.get(selectedQuarter)?.id;
    if (!rid) return;
    try {
      await workflowMut.mutateAsync({
        performanceId: rid,
        action: "approve_final",
      });
      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      notify("success", "최종 승인되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "최종 승인에 실패했습니다.");
    }
  }

  function openRejectModal() {
    const rid = rowByUiQuarter.get(selectedQuarter)?.id;
    if (!rid) {
      notify(
        "error",
        "선택한 분기에 연결된 실적 행이 없습니다. 실적을 먼저 저장해 주세요."
      );
      return;
    }
    setRejectReasonDraft("");
    setRejectModalOpen(true);
  }

  async function submitRejectFromModal() {
    const rid = rowByUiQuarter.get(selectedQuarter)?.id;
    if (!rid) return;
    const reason = rejectReasonDraft.trim();
    if (!reason) {
      notify("error", "반려 사유를 입력해 주세요.");
      return;
    }
    try {
      await workflowMut.mutateAsync({
        performanceId: rid,
        action: "reject",
        rejectionReason: reason,
      });
      const refreshed = await perfQuery.refetch();
      if (refreshed.data) setLiveRows(refreshed.data);
      setRejectModalOpen(false);
      setRejectReasonDraft("");
      notify("success", "반려 처리되었습니다.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "반려 처리에 실패했습니다.");
    }
  }

  async function handleDeleteKpiItemInModal() {
    if (!kpiItem || !canDeleteKpiItem || !onDeleteKpiItem) return;
    await onDeleteKpiItem(kpiItem.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3">
      <AppToast
        state={toast}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
      <div className="relative flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-2xl shadow-sky-200/50">
        <div className="shrink-0 border-b border-sky-100 bg-gradient-to-br from-sky-600 to-sky-700 px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100/90">
                세부활동
              </p>
              <h3 className="mt-1.5 text-lg font-bold leading-snug tracking-tight sm:text-xl">
                {item.detailActivity?.trim() ? item.detailActivity : "—"}
              </h3>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-sky-100/95">
                <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5">
                  <Eye className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  KPI 뷰어
                </span>
                <span className="text-sky-100/80">·</span>
                <span className="truncate text-sky-50/95" title={`${item.mainTopic} · ${item.subTopic}`}>
                  {item.mainTopic} · {item.subTopic}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canOpenRegister ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditorQuarter(selectedQuarter);
                    setMode("editor");
                  }}
                  disabled={writerLockedNow || (!isPrivilegedEditor && !selectedQuarterWritableByWriter)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800 shadow-sm hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FilePenLine className="h-3.5 w-3.5" />
                  실적 등록
                </button>
              ) : null}
              {canOpenModify ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditorQuarter(selectedQuarter);
                    setMode("editor");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/60 bg-sky-700/80 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
                >
                  <FilePenLine className="h-3.5 w-3.5" />
                  수정
                </button>
              ) : null}
              {canDeleteKpiItem ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteKpiItemInModal()}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50"
                >
                  삭제
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-white/90 hover:bg-white/10"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">

          <div className="mb-4 grid gap-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3 text-sm text-slate-700 sm:grid-cols-2">
            <p>
              <span className="font-semibold">B/M:</span> {item.bm}
            </p>
            <p>
              <span className="font-semibold">가중치:</span> {item.weight}
            </p>
            <p>
              <span className="font-semibold">담당자:</span> {item.owner}
            </p>
            <p>
              <span className="font-semibold">목표 요약(상반기 일정 / 하반기 일정):</span>{" "}
              {item.halfYearSummary}
            </p>
            <p className="sm:col-span-2">
              <span className="font-semibold">목표 달성율:</span>{" "}
              상반기 {item.firstHalfRate ?? item.firstHalfTarget ?? 0}% / 하반기{" "}
              {item.secondHalfRate ?? item.secondHalfTarget ?? item.challengeTarget ?? 0}%
            </p>
          </div>

          <div className="h-[320px] rounded-xl border border-sky-100 bg-white p-2 sm:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                onClick={(state) => {
                  const q = state?.activeLabel as QuarterLabel | undefined;
                  if (q && KPI_QUARTERS.includes(q)) setSelectedQuarter(q);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis dataKey="quarter" tick={{ fill: "#334155", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip content={<KpiChartTooltip />} />
                <Legend />
                <Line
                  type="linear"
                  dataKey="target"
                  name="목표"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="실적"
                  stroke="#0284c7"
                  strokeWidth={3}
                  dot={(dotProps: {
                    cx?: number;
                    cy?: number;
                    payload?: ChartDatum;
                  }) => {
                    const { cx, cy, payload } = dotProps;
                    if (cx == null || cy == null || !payload) return null;
                    const isSel = payload.quarter === selectedQuarter;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSel ? 8 : 5}
                        fill="#0284c7"
                        stroke="#fff"
                        strokeWidth={2}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (KPI_QUARTERS.includes(payload.quarter as QuarterLabel)) {
                            setSelectedQuarter(payload.quarter as QuarterLabel);
                          }
                        }}
                      />
                    );
                  }}
                  activeDot={{ r: 10, stroke: "#0369a1", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 px-1 text-[11px] leading-snug text-slate-500">
              실적(파란 선)은 <span className="font-medium text-slate-600">1차 승인 이후(최종 승인 대기·승인 완료)</span>
              수치만 반영합니다. 미승인(draft·1차 승인 대기) 구간은 0% 또는 직전{" "}
              <span className="font-medium text-slate-600">승인</span> 시점 값으로 유지됩니다.
            </p>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              분기 선택
            </p>
            <div className="flex flex-wrap gap-2">
              {KPI_QUARTERS.map((q) => {
                const on = q === selectedQuarter;
                const inSchedule = activeSet.has(q);
                return (
                  <button
                    key={q}
                    type="button"
                    disabled={!inSchedule}
                    onClick={() => setSelectedQuarter(q)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "bg-sky-600 text-white shadow-md shadow-sky-300/40"
                        : inSchedule
                          ? "border border-sky-200 bg-white text-slate-700 hover:bg-sky-50"
                          : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50/30 p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              {selectedQuarter} 상세
            </h4>
            <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">달성률 (제출값)</dt>
                <dd className="font-semibold text-sky-800">
                  {selectedSubmittedPercent !== null
                    ? `${selectedSubmittedPercent}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">차트 실적선 (승인 반영)</dt>
                <dd className="font-semibold text-slate-800">{chartActualSelected}%</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">승인 상태</dt>
                <dd className="font-medium text-slate-800">
                  {performanceStatusLabelKo(selectedStatus)}
                </dd>
              </div>
              {selectedRejectionReason?.trim() ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-red-600">반려 사유</dt>
                  <dd className="mt-0.5 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-slate-800">
                    {selectedRejectionReason}
                  </dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">코멘트</dt>
                <dd className="mt-0.5 rounded-lg border border-sky-100 bg-white px-3 py-2 text-slate-700">
                  {selectedDescription?.trim() ? selectedDescription : "등록된 코멘트가 없습니다."}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                승인 진행 단계
              </p>
              {selectedRejectionReason?.trim() ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  반려됨
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {["제출전", "1차 승인 대기", "최종 승인 대기", "승인 완료"].map(
                    (label, idx) => {
                      const active = statusTimelineIndex(selectedStatus) >= idx;
                      return (
                        <div
                          key={label}
                          className={`rounded-lg border px-2 py-2 text-center text-[11px] font-medium ${
                            active
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          {label}
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                첨부 파일
              </p>
              {selectedEvidencePath ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="max-w-full truncate text-sm text-slate-700">
                    {selectedEvidenceFileName}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDownloadEvidence()}
                    disabled={downloadingEvidence}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    📄 파일 다운로드
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">증빙 자료가 없습니다</p>
              )}
            </div>

            {mode === "viewer" &&
            (workflowPrimaryVisible || workflowFinalVisible) ? (
              <div className="mt-4 border-t border-sky-200/80 pt-4">
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  승인 처리 (그룹장·팀장·관리자)
                </p>
                <div className="flex flex-wrap gap-2">
                  {workflowPrimaryVisible ? (
                    <button
                      type="button"
                      disabled={workflowMut.isPending}
                      onClick={() => void handleModalApprovePrimary()}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      1차 승인
                    </button>
                  ) : null}
                  {workflowFinalVisible ? (
                    <button
                      type="button"
                      disabled={workflowMut.isPending}
                      onClick={() => void handleModalApproveFinal()}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      최종 승인
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={workflowMut.isPending}
                    onClick={() => openRejectModal()}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    반려
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          </div>

        </div>

        {mode === "editor" && canEditPerformance ? (
          <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-sky-100 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-sky-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-sky-600" />
                <h4 className="text-sm font-semibold text-slate-800">실적 등록</h4>
              </div>
              <button
                type="button"
                onClick={() => setMode("viewer")}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  분기 선택
                </label>
                <select
                  value={editorQuarter}
                  onChange={(e) => setEditorQuarter(e.target.value as QuarterLabel)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                >
                  {KPI_QUARTERS.map((q) => {
                    const row = findRowByQuarter(liveRows, q);
                    const locked = quarterLockedForEditor(
                      row?.approval_step,
                      isPrivilegedEditor
                    );
                    return (
                      <option
                        key={q}
                        value={q}
                        disabled={!activeSet.has(q) || locked}
                      >
                        {q}
                        {!activeSet.has(q) ? " (대상 아님)" : locked ? " (승인대기/완료·잠금)" : ""}
                      </option>
                    );
                  })}
                </select>
                {editorQuarterLocked ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    승인 대기 중이거나 승인 완료된 분기는 그룹장·팀장·관리자만 수정할 수 있습니다.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  달성률 (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={editorRate}
                  onChange={(e) => setEditorRate(e.target.value)}
                  disabled={!activeSet.has(editorQuarter) || editorQuarterLocked}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="0–100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  특이사항 (remarks)
                </label>
                <textarea
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  disabled={!activeSet.has(editorQuarter) || editorQuarterLocked}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
                  placeholder="해당 분기 코멘트"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  이 분기 전용 증빙 파일
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-slate-700 hover:bg-sky-50">
                  <Upload className="h-4 w-4 text-sky-600" />
                  <span>{editorFile ? editorFile.name : "파일 선택"}</span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={!activeSet.has(editorQuarter) || editorQuarterLocked}
                    onChange={(e) => setEditorFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="mt-1 text-[11px] text-slate-500">
                  업로드 시 해당 분기 행의 evidence_url에만 저장됩니다. 생략 시 기존 경로를 유지합니다.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-sky-100 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setMode("viewer")}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void handleSaveQuarter()}
                disabled={
                  saveMutation.isPending ||
                  uploading ||
                  !activeSet.has(editorQuarter) ||
                  editorQuarterLocked
                }
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saveMutation.isPending || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                저장 (1차 승인 대기로 제출)
              </button>
            </div>
          </div>
        ) : null}

        {rejectModalOpen ? (
          <div
            className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setRejectModalOpen(false);
                setRejectReasonDraft("");
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-modal-title"
              className="w-full max-w-md rounded-2xl border border-sky-100 bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 id="reject-modal-title" className="text-base font-semibold text-slate-900">
                반려 사유
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                반려 후 실적은 draft로 되돌아가며, 사유는 작성자 화면에 표시됩니다.
              </p>
              <textarea
                value={rejectReasonDraft}
                onChange={(e) => setRejectReasonDraft(e.target.value)}
                rows={4}
                className="mt-3 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 caret-slate-800 placeholder:text-slate-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                placeholder="반려 사유를 입력해 주세요."
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectModalOpen(false);
                    setRejectReasonDraft("");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={workflowMut.isPending}
                  onClick={() => void submitRejectFromModal()}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  반려 처리
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
