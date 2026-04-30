"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ClipboardList,
  FileUp,
  Loader2,
} from "lucide-react";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  CURRENT_KPI_YEAR,
  KPI_MONTHS,
  indicatorUsesComputedAchievement,
  resolveEffectiveIndicatorTypeForUi,
  type DepartmentKpiDetailItem,
  type KpiIndicatorType,
  type MonthKey,
} from "@/src/lib/kpi-queries";
import {
  formatKoMax2Decimals,
  formatKoPercentMax2,
  roundToMax2DecimalPlaces,
} from "@/src/lib/format-display-number";
import {
  approvalNotificationCount,
  approvalNotificationDeptFilter,
  canAccessApprovalsPage,
  canConfigureKpiIndicatorType,
  canSubmitMonthlyPerformance,
  DASHBOARD_SHOW_MAIN_SESSION_KEY,
  hrefDashboardDepartmentList,
  isAdminRole,
  normalizeRole,
} from "@/src/lib/rbac";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
  useCreateManualKpiMutation,
  useDeleteKpiItemMutation,
  useDepartmentKpiDetail,
  useExtendKpiItemPeriodEndMonthMutation,
  useImportKpisByExcelMutation,
  useUpdateManualKpiMutation,
  useUpdateKpiItemIndicatorMutation,
  useUpdateKpiItemFinalCompletionMutation,
} from "@/src/hooks/useKpiQueries";
import { PerformanceModal } from "./performance-modal";
import { KpiCreateModal } from "./kpi-create-modal";
import { ChangePasswordButton } from "../../change-password-modal";

type Props = { departmentId: string };

function indicatorBadgeClass(t: KpiIndicatorType): string {
  switch (t) {
    case "ppm":
      return "bg-violet-50 text-violet-800 ring-violet-200";
    case "quantity":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "count":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "money":
      return "bg-teal-50 text-teal-900 ring-teal-200";
    case "time":
      return "bg-orange-50 text-orange-800 ring-orange-200";
    case "minutes":
      return "bg-rose-50 text-rose-800 ring-rose-200";
    case "uph":
      return "bg-cyan-50 text-cyan-800 ring-cyan-200";
    case "cpk":
      return "bg-lime-50 text-lime-900 ring-lime-200";
    case "headcount":
      return "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

function indicatorModeShortLabel(t: KpiIndicatorType): string {
  if (t === "normal") return "일반 (%)";
  if (t === "ppm") return "PPM";
  if (t === "quantity") return "수량(k)";
  if (t === "count") return "건수";
  if (t === "money") return "금액(억)";
  if (t === "time") return "시간(h)";
  if (t === "minutes") return "분(min)";
  if (t === "uph") return "생산성(UPH)";
  if (t === "cpk") return "공정능력(Cpk)";
  if (t === "headcount") return "인원(명)";
  return "—";
}

function monthLabel(month: number): string {
  return month <= 12 ? `${month}월` : `익년 ${month - 12}월`;
}

function defaultKpiMonth(): MonthKey {
  const m = new Date().getMonth() + 1;
  if (m >= 1 && m <= 12) return m as MonthKey;
  return 1;
}

type AchievementMonthSelection = MonthKey | "all";

type DepartmentTableSortKey =
  | "mainTopic"
  | "subTopicDetail"
  | "bm"
  | "weight"
  | "owner"
  | "period"
  | "achievement";

type SortDirection = "asc" | "desc";

/** 달성률 정렬: 최종 완료(화면 '완료')는 100% 초과로 취급 → 내림차순 시 100%보다 위에 옴 */
const ACHIEVEMENT_SORT_COMPLETED_SCORE = 101;

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: SortDirection
): number {
  const aOk = a !== null && a !== undefined && Number.isFinite(a);
  const bOk = b !== null && b !== undefined && Number.isFinite(b);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  const diff = (a as number) - (b as number);
  return dir === "asc" ? diff : -diff;
}

function achievementSortScore(
  item: DepartmentKpiDetailItem,
  month: AchievementMonthSelection
): number | null {
  if (item.isFinalCompleted) {
    return ACHIEVEMENT_SORT_COMPLETED_SCORE;
  }
  if (month === "all") {
    const v = item.averageAchievement;
    if (v !== null && Number.isFinite(v)) {
      return v;
    }
    return 0;
  }
  if (!itemIsEvaluatedInMonth(item, month)) {
    return null;
  }
  const r = item.monthlyAchievementRates[month];
  if (r !== undefined && r !== null && Number.isFinite(r)) {
    return r;
  }
  return 0;
}

function itemIsEvaluatedInMonth(item: DepartmentKpiDetailItem, month: MonthKey): boolean {
  const start = item.periodStartMonth ?? 1;
  const end = item.periodEndMonth ?? 12;
  if (month < start || month > end) return false;

  const exactTarget = item.monthlyTargets[month];
  if (typeof exactTarget === "number" && Number.isFinite(exactTarget)) {
    return true;
  }

  if (item.targetFillPolicy === "carry_forward") {
    for (let m = month - 1; m >= start; m -= 1) {
      const priorTarget = item.monthlyTargets[m];
      if (typeof priorTarget === "number" && Number.isFinite(priorTarget)) {
        return true;
      }
    }
  }

  return Object.keys(item.monthlyTargets).length === 0;
}

function periodRangeLabel(
  periodStartMonth: number | null | undefined,
  periodEndMonth: number | null | undefined
): string {
  const start = Number(periodStartMonth);
  const end = Number(periodEndMonth);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return "—";
  if (start === end) return monthLabel(start);
  return `${monthLabel(start)} ~ ${monthLabel(end)}`;
}

function parseBenchmarkValue(raw: string | null | undefined): number | null {
  const match = String(raw ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function benchmarkValueLabel(item: DepartmentKpiDetailItem): string {
  if (!item.bm?.trim()) return "—";
  const parsed = parseBenchmarkValue(item.bm);
  if (parsed === null) return item.bm;

  const indicatorType = resolveEffectiveIndicatorTypeForUi(
    item.indicatorType,
    item.bm,
    item.unit
  );
  if (indicatorType === "ppm") return `${formatKoMax2Decimals(parsed)} ppm`;
  if (indicatorType === "quantity") return `${formatKoMax2Decimals(parsed)} k`;
  if (indicatorType === "count") return `${formatKoMax2Decimals(parsed)} 건`;
  if (indicatorType === "headcount") return `${formatKoMax2Decimals(parsed)} 명`;
  if (indicatorType === "money") return `${formatKoMax2Decimals(parsed)}억`;
  if (indicatorType === "time") return `${formatKoMax2Decimals(parsed)} h`;
  if (indicatorType === "minutes") return `${formatKoMax2Decimals(parsed)} min`;
  if (indicatorType === "uph") return `${formatKoMax2Decimals(parsed)} UPH`;
  if (indicatorType === "cpk") return `${formatKoMax2Decimals(parsed)} Cpk`;
  return formatKoPercentMax2(parsed);
}

function DepartmentTableSortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return (
      <ArrowUpDown
        className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-70"
        aria-hidden
      />
    );
  }
  return direction === "asc" ? (
    <ArrowUpNarrowWide className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
  ) : (
    <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
  );
}

export function DepartmentDetailClient({ departmentId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const profileQuery = useDashboardProfile();
  const detailQuery = useDepartmentKpiDetail(departmentId);
  const profile = profileQuery.data?.profile ?? null;
  const userDeptId =
    profile && typeof profile.dept_id === "string" ? profile.dept_id : null;
  const role = profile?.role ?? "";
  const summaryStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess && !!profile && canAccessApprovalsPage(role),
    approvalNotificationDeptFilter(role, userDeptId)
  );
  const featureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null
  );
  const importMutation = useImportKpisByExcelMutation();
  const createManualKpiMutation = useCreateManualKpiMutation();
  const updateManualKpiMutation = useUpdateManualKpiMutation();
  const deleteKpiItemMutation = useDeleteKpiItemMutation();
  const updateIndicatorMutation = useUpdateKpiItemIndicatorMutation();
  const updateFinalCompletionMutation = useUpdateKpiItemFinalCompletionMutation();
  const extendPeriodEndMonthMutation = useExtendKpiItemPeriodEndMonthMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<DepartmentKpiDetailItem | null>(null);
  const [modalMode, setModalMode] = useState<"viewer" | "editor">("viewer");
  const [exportingExcel, setExportingExcel] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingKpiItem, setEditingKpiItem] = useState<DepartmentKpiDetailItem | null>(null);
  const [selectedAchievementMonth, setSelectedAchievementMonth] =
    useState<AchievementMonthSelection>(() => defaultKpiMonth());
  const [tableSort, setTableSort] = useState<{
    key: DepartmentTableSortKey | null;
    dir: SortDirection;
  }>({ key: null, dir: "asc" });
  /** 목표값이 없는 상태에서 자동계산형 지표로 바꿀 때만 표시 */
  const [pendingIndicator, setPendingIndicator] = useState<{
    kpiId: string;
    indicatorType: KpiIndicatorType;
  } | null>(null);
  const [pendingTargetInput, setPendingTargetInput] = useState("");

  function approvalStepLabel(step: string | null | undefined): string {
    const s = (step ?? "").trim().toLowerCase();
    if (!s || s === "draft") return "제출 전";
    if (s === "pending_primary" || s === "pending") return "1차 승인 대기";
    if (s === "pending_final") return "최종 승인 대기";
    if (s === "approved") return "승인 완료";
    return step ?? "—";
  }

  useEffect(() => {
    try {
      sessionStorage.removeItem(DASHBOARD_SHOW_MAIN_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, [departmentId]);

  useEffect(() => {
    if (profileQuery.isPending) return;
    if (profileQuery.isError || profileQuery.data == null) {
      router.replace("/login");
    }
  }, [
    profileQuery.isPending,
    profileQuery.isError,
    profileQuery.data,
    router,
  ]);

  /** `public/kpi-oo-upload-template.xlsx` — 원본 `KPI_OO부문_upload용 양식.xlsx`와 동일 */
  async function handleDownloadTemplateXlsx() {
    try {
      const res = await fetch("/kpi-oo-upload-template.xlsx");
      if (!res.ok) {
        throw new Error("샘플 양식 파일을 찾을 수 없습니다.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "KPI_OO부문_upload용 양식.xlsx";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "양식 다운로드에 실패했습니다.");
    }
  }

  async function handleExcelSelected(file: File | null) {
    if (!file) return;
    try {
      const mod = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = mod.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("엑셀 시트를 찾지 못했습니다.");
      const sheet = workbook.Sheets[firstSheetName];
      const rows = mod.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      const mapped = rows.map((r) => {
        const text = (v: unknown) => String(v ?? "").trim();
        return {
          mainTopic: text(r["메인주제"]),
          subTopic: text(r["서브주제"]),
          detailItem: text(r["세부활동"]),
          bmValue: text(r["B/M"]),
          baseline: text(r["기준"]),
          firstHalfTarget: text(r["상반기 목표 일정"]),
          firstHalfRate: text(r["상반기 목표 달성율"]),
          firstHalfEffect: text(r["상반기 목표 효과"]),
          secondHalfTarget: text(r["하반기 목표 일정"]),
          secondHalfRate: text(r["하반기 목표 달성율"]),
          secondHalfEffect: text(r["하반기 목표 효과"]),
          challengeTarget: text(r["도전 목표"]),
          weight: text(r["가중치"]),
          managerName: text(r["담당자"]),
          note: text(r["비고"]),
        };
      });

      const valid = mapped.filter((r) => r.mainTopic || r.subTopic);
      if (valid.length === 0) {
        window.alert("등록 가능한 행이 없습니다. 샘플 양식 헤더를 확인해 주세요.");
        return;
      }

      const count = await importMutation.mutateAsync({
        deptId: departmentId,
        rows: valid,
      });
      window.alert(`총 ${count}개의 KPI 항목이 성공적으로 등록되었습니다`);
      await detailQuery.refetch();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "엑셀 업로드 실패");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function handleExportCurrentListToExcel() {
    if (!detailQuery.data?.items?.length) {
      window.alert("내보낼 KPI 데이터가 없습니다.");
      return;
    }
    try {
      setExportingExcel(true);
      const mod = await import("xlsx");
      const rows = detailQuery.data.items.map((item) => ({
        메인주제: item.mainTopic,
        서브주제: item.subTopic,
        "세부 활동": item.detailActivity,
        "가중치": item.weight,
        "상반기 목표(%)": item.firstHalfTarget ?? item.firstHalfRate ?? "",
        "하반기 목표(%)": item.secondHalfTarget ?? item.secondHalfRate ?? "",
        "현재 실적(승인 기준, %)":
          item.averageAchievement === null
            ? ""
            : roundToMax2DecimalPlaces(item.averageAchievement),
        "현재 상태": approvalStepLabel(item.currentApprovalStep),
      }));
      const ws = mod.utils.json_to_sheet(rows);
      const wb = mod.utils.book_new();
      mod.utils.book_append_sheet(wb, ws, "KPI");
      const today = new Date();
      const dateToken = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      mod.writeFileXLSX(
        wb,
        `${detailQuery.data.department?.name ?? "department"}_KPI_${dateToken}.xlsx`
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "엑셀 다운로드에 실패했습니다.");
    } finally {
      setExportingExcel(false);
    }
  }

  const detailItems = detailQuery.data?.items ?? [];

  const sortedItems = useMemo(() => {
    const items = [...detailItems];
    const { key: sortKey, dir } = tableSort;

    const defaultSort = () => {
      items.sort((a, b) => {
        const m = a.mainTopic.localeCompare(b.mainTopic, "ko");
        if (m !== 0) return m;
        const s = a.subTopic.localeCompare(b.subTopic, "ko");
        if (s !== 0) return s;
        return a.detailActivity.localeCompare(b.detailActivity, "ko");
      });
    };

    if (sortKey === null) {
      defaultSort();
      return items;
    }

    const dirSign = dir === "asc" ? 1 : -1;

    items.sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case "mainTopic":
          c = a.mainTopic.localeCompare(b.mainTopic, "ko") * dirSign;
          break;
        case "subTopicDetail": {
          const s0 = a.subTopic.localeCompare(b.subTopic, "ko") * dirSign;
          if (s0 !== 0) {
            c = s0;
            break;
          }
          c = a.detailActivity.localeCompare(b.detailActivity, "ko") * dirSign;
          break;
        }
        case "bm": {
          const pa = parseBenchmarkValue(a.bm);
          const pb = parseBenchmarkValue(b.bm);
          if (pa !== null && pb !== null) {
            c = (pa - pb) * dirSign;
          } else {
            c =
              benchmarkValueLabel(a).localeCompare(benchmarkValueLabel(b), "ko") *
              dirSign;
          }
          break;
        }
        case "weight": {
          const wa = Number(String(a.weight ?? "").trim());
          const wb = Number(String(b.weight ?? "").trim());
          const na = Number.isFinite(wa) ? wa : null;
          const nb = Number.isFinite(wb) ? wb : null;
          if (na === null && nb === null) c = 0;
          else if (na === null) c = 1;
          else if (nb === null) c = -1;
          else c = (na - nb) * dirSign;
          break;
        }
        case "owner":
          c = a.owner.localeCompare(b.owner, "ko") * dirSign;
          break;
        case "period": {
          const sa = a.periodStartMonth ?? 0;
          const sb = b.periodStartMonth ?? 0;
          if (sa !== sb) {
            c = (sa - sb) * dirSign;
            break;
          }
          const ea = a.periodEndMonth ?? 0;
          const eb = b.periodEndMonth ?? 0;
          c = (ea - eb) * dirSign;
          break;
        }
        case "achievement": {
          c = compareNullableNumber(
            achievementSortScore(a, selectedAchievementMonth),
            achievementSortScore(b, selectedAchievementMonth),
            dir
          );
          break;
        }
        default:
          c = 0;
      }
      if (c !== 0) return c;
      const m = a.mainTopic.localeCompare(b.mainTopic, "ko");
      if (m !== 0) return m;
      const s = a.subTopic.localeCompare(b.subTopic, "ko");
      if (s !== 0) return s;
      return a.detailActivity.localeCompare(b.detailActivity, "ko");
    });
    return items;
  }, [detailItems, tableSort, selectedAchievementMonth]);

  function toggleDepartmentTableSort(column: DepartmentTableSortKey) {
    setTableSort((prev) =>
      prev.key === column
        ? { key: column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: column, dir: "asc" }
    );
  }

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return null;
  }

  const ensuredProfile = profileQuery.data.profile;
  const ensuredUserDeptId =
    typeof ensuredProfile.dept_id === "string" ? ensuredProfile.dept_id : null;
  const ensuredRole = ensuredProfile.role;
  const pendingApprovalCount =
    approvalNotificationCount(
      ensuredRole,
      summaryStatsQuery.data?.pendingPrimaryCount ?? 0,
      summaryStatsQuery.data?.pendingFinalCount ?? 0
    );
  const isAdmin = isAdminRole(ensuredRole);
  const featureRaw = featureQuery.data ?? { capa: false, voc: false, kpi: false };
  const featureAccess = {
    capa: isAdmin || featureRaw.capa,
    voc: isAdmin || featureRaw.voc,
    kpi: isAdmin || featureRaw.kpi,
  };
  const normalizedRole = normalizeRole(ensuredRole);
  const roleCanAlwaysEdit =
    isAdmin ||
    normalizedRole === "group_leader" ||
    normalizedRole === "team_leader" ||
    normalizedRole === "group_team_leader";
  const isOwnDepartment =
    Boolean(ensuredUserDeptId) && ensuredUserDeptId === departmentId;
  const canConfigureIndicator =
    canConfigureKpiIndicatorType(ensuredRole) && (isAdmin || isOwnDepartment);
  const canEditPerformance =
    isAdmin ||
    (isOwnDepartment &&
      (roleCanAlwaysEdit || canSubmitMonthlyPerformance(ensuredRole)));
  const canManageKpiItems = roleCanAlwaysEdit && (isAdmin || isOwnDepartment);
  const canFinalizeKpiItems = roleCanAlwaysEdit && (isAdmin || isOwnDepartment);
  /** 관리자: 모든 부서, 그룹장·팀장: 본인 부서 KPI 항목 추가/수정/삭제 가능 */
  const canCreateKpi = canManageKpiItems;
  const totalWeight = detailItems.reduce((sum, item) => {
    const n = Number(String(item.weight ?? "").trim());
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  const monthSelectableItems =
    selectedAchievementMonth === "all"
      ? detailItems
      : detailItems.filter((item) =>
          itemIsEvaluatedInMonth(item, selectedAchievementMonth)
        );
  const selectedMonthRates = monthSelectableItems.map((item) => {
    if (selectedAchievementMonth === "all") {
      return item.averageAchievement ?? 0;
    }
    return item.monthlyAchievementRates[selectedAchievementMonth] ?? 0;
  });
  const selectedMonthAverage =
    selectedMonthRates.length > 0
      ? selectedMonthRates.reduce((sum, rate) => sum + rate, 0) / selectedMonthRates.length
      : null;
  const mainTopicOptions = Array.from(
    new Set(detailItems.map((item) => item.mainTopic.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ko"));
  const subTopicOptions = Array.from(
    new Set(detailItems.map((item) => item.subTopic.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ko"));

  const dashboardListHref = hrefDashboardDepartmentList(ensuredRole, ensuredUserDeptId);

  async function handleIndicatorTypeSelect(
    item: DepartmentKpiDetailItem,
    nextType: KpiIndicatorType
  ) {
    setPendingIndicator(null);
    setPendingTargetInput("");
    try {
      if (nextType === "normal") {
        await updateIndicatorMutation.mutateAsync({
          kpiItemId: item.id,
          indicatorType: "normal",
          targetPpm: null,
        });
        await detailQuery.refetch();
        return;
      }
      const t = item.targetPpm;
      if (t !== null && t !== undefined && t > 0) {
        await updateIndicatorMutation.mutateAsync({
          kpiItemId: item.id,
          indicatorType: nextType,
          targetPpm: t,
        });
        await detailQuery.refetch();
        return;
      }
      setPendingIndicator({ kpiId: item.id, indicatorType: nextType });
      setPendingTargetInput("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "실적 방식 저장에 실패했습니다.");
    }
  }

  async function applyPendingIndicatorTarget() {
    if (!pendingIndicator) return;
    const n = Number(String(pendingTargetInput).trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      window.alert("목표값을 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    try {
      await updateIndicatorMutation.mutateAsync({
        kpiItemId: pendingIndicator.kpiId,
        indicatorType: pendingIndicator.indicatorType,
        targetPpm: n,
      });
      setPendingIndicator(null);
      setPendingTargetInput("");
      await detailQuery.refetch();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "목표값 저장에 실패했습니다.");
    }
  }

  async function handleDeleteKpiItem(kpiItemId: string): Promise<void> {
    if (!canManageKpiItems) {
      window.alert("KPI 항목 삭제는 관리자·팀장·그룹장만 가능합니다.");
      return;
    }
    const ok = window.confirm(
      "선택한 KPI 항목과 연결된 실적(kpi_targets)도 함께 삭제됩니다. 계속하시겠습니까?"
    );
    if (!ok) return;
    try {
      await deleteKpiItemMutation.mutateAsync(kpiItemId);
      await detailQuery.refetch();
      window.alert("KPI 항목 삭제가 완료되었습니다.");
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "KPI 항목 삭제 중 오류가 발생했습니다."
      );
    }
  }

  async function handleFinalizeKpiItem(
    kpiItemId: string,
    completed = true
  ): Promise<boolean> {
    if (!canFinalizeKpiItems) {
      window.alert("최종 완료/철회 처리는 관리자·팀장·그룹장만 가능합니다.");
      return false;
    }
    const ok = window.confirm(
      completed
        ? "이 KPI 항목을 최종 완료로 표시하시겠습니까? 대시보드의 '최종 완료 KPI'에 반영됩니다."
        : "이 KPI 항목의 최종 완료를 철회하시겠습니까? 대시보드의 '최종 완료 KPI'에서 제외됩니다."
    );
    if (!ok) return false;
    try {
      await updateFinalCompletionMutation.mutateAsync({
        kpiItemId,
        completed,
      });
      await detailQuery.refetch();
      setSelectedKpi((prev) =>
        prev && prev.id === kpiItemId
          ? {
              ...prev,
              status: completed ? "closed" : "active",
              isFinalCompleted: completed,
            }
          : prev
      );
      window.alert(
        completed
          ? "KPI 항목이 최종 완료 처리되었습니다."
          : "KPI 항목 최종 완료가 철회되었습니다."
      );
      return true;
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "최종 완료/철회 처리 중 오류가 발생했습니다."
      );
      return false;
    }
  }

  async function handleExtendKpiItemPeriodEndMonth(kpiItemId: string): Promise<boolean> {
    if (!canFinalizeKpiItems) {
      window.alert("지연 월 추가는 관리자·팀장·그룹장만 가능합니다.");
      return false;
    }

    const item = detailItems.find((row) => row.id === kpiItemId);
    const currentEnd = item?.periodEndMonth ?? 12;
    if (currentEnd >= 15) {
      window.alert("더 이상 월을 추가할 수 없습니다. 최대 익년 3월까지 가능합니다.");
      return false;
    }
    const nextMonth = (currentEnd + 1) as MonthKey;
    const ok = window.confirm(
      `${monthLabel(nextMonth)}을(를) 지연 월로 추가하시겠습니까? 새 월 목표값은 현재 최종 목표값으로 등록됩니다.`
    );
    if (!ok) return false;

    try {
      await extendPeriodEndMonthMutation.mutateAsync({
        kpiItemId,
        nextPeriodEndMonth: nextMonth,
      });
      await detailQuery.refetch();
      setSelectedKpi((prev) =>
        prev && prev.id === kpiItemId
          ? {
              ...prev,
              periodEndMonth: nextMonth,
              monthlyTargets: {
                ...prev.monthlyTargets,
                [nextMonth]: prev.targetFinalValue ?? 0,
              },
            }
          : prev
      );
      window.alert(`${monthLabel(nextMonth)}이(가) 지연 월로 추가되었습니다.`);
      return true;
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "지연 월 추가 중 오류가 발생했습니다.");
      return false;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50/90 via-white to-white md:flex-row">
      <CtstAppSidebar
        pathname={pathname}
        role={ensuredRole}
        userDeptId={
          typeof ensuredProfile.dept_id === "string"
            ? ensuredProfile.dept_id
            : null
        }
        pendingApprovalCount={pendingApprovalCount}
        featureAccess={featureAccess}
        onSignOut={handleSignOut}
      />

      <main className="min-w-0 flex-1 px-4 py-6 sm:p-8">
        {!featureAccess.kpi ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
            <div className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-8 text-center shadow-lg shadow-sky-100/50">
              <img
                src="/c-one%20logo.png?v=4"
                alt="C-ONE 로고"
                className="mx-auto h-auto max-h-[72px] w-auto max-w-[min(100%,240px)] object-contain"
              />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700/90">
                CTST 통합 시스템
              </p>
              <h1 className="mt-2 text-xl font-bold text-slate-800">부서별 KPI</h1>
              <p className="mt-3 text-sm text-slate-600">관리자 잠금 상태입니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                관리자 설정에서 공개되면 이 메뉴를 이용할 수 있습니다.
              </p>
            </div>
          </div>
        ) : (
        <>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={dashboardListHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            대시보드로
          </Link>
          <ChangePasswordButton profileUsername={ensuredProfile.username} />
        </div>

        {detailQuery.isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : detailQuery.isError ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
            <p>KPI 목록을 불러오지 못했습니다. 잠시 후 새로고침하거나 데이터가 있는지 확인해 주세요.</p>
          </div>
        ) : !detailQuery.data?.department ? (
          <p className="text-slate-600">해당 부서를 찾을 수 없습니다.</p>
        ) : (
          <>
            {!isOwnDepartment && !isAdmin ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
                타 부서 KPI는 조회만 가능합니다. 실적 등록·수정은 본인 소속 부서에서만 가능합니다.
              </div>
            ) : null}
            <header className="mb-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">
                    {detailQuery.data.department.name}
                  </h1>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                      기준 연도: {CURRENT_KPI_YEAR}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-500">
                      연도 선택(준비중)
                    </span>
                  </div>
                </div>
                {canCreateKpi ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingKpiItem(null);
                        setShowCreateModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      KPI 항목 추가
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3">
                <span
                  className={
                    totalWeight === 100
                      ? "text-sm font-semibold text-emerald-700"
                      : totalWeight > 100
                        ? "text-sm font-semibold text-red-700"
                        : "text-sm font-semibold text-amber-700"
                  }
                >
                  {totalWeight === 100
                    ? "가중치 합계 100/100 (정상)"
                    : totalWeight > 100
                      ? `가중치 합계 ${totalWeight}/100 (${totalWeight - 100}점 초과 - 조정 필요)`
                      : `가중치 합계 ${totalWeight}/100 (${100 - totalWeight}점 미배분)`}
                </span>
                <p className="mt-1 text-xs text-slate-500">
                  {detailQuery.data.department.name} 기준 합계입니다. 100점 초과 시 신규 항목 저장이 차단됩니다.
                </p>
              </div>
              <div className="mt-4 rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">월별 달성률 보기</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {selectedAchievementMonth === "all"
                        ? "전체보기"
                        : `${monthLabel(selectedAchievementMonth)} 평가 대상`}{" "}
                      평균:{" "}
                      <span className="text-sky-700">
                        {selectedMonthAverage === null
                          ? "데이터 없음"
                          : formatKoPercentMax2(selectedMonthAverage)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedAchievementMonth("all")}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        selectedAchievementMonth === "all"
                          ? "bg-sky-600 text-white shadow-sm"
                          : "bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                      }`}
                    >
                      전체보기
                    </button>
                    {KPI_MONTHS.filter((month) => month <= 12).map((month) => {
                      const active = month === selectedAchievementMonth;
                      return (
                        <button
                          key={`achievement-month-${month}`}
                          type="button"
                          onClick={() => setSelectedAchievementMonth(month)}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                            active
                              ? "bg-sky-600 text-white shadow-sm"
                              : "bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                          }`}
                        >
                          {monthLabel(month)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  월별 평균은 해당 월 평가 대상 KPI를 분모로 계산합니다. 평가 대상인데 실적이 없으면 0%로 포함하고, 전체보기는 기존 대표 달성률 기준입니다.
                </p>
              </div>
            </header>

            {!detailItems.length ? (
              <p className="rounded-xl border border-sky-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
                이 부서에 등록된 KPI 항목이 없습니다.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full border-collapse text-sm">
                    <thead className="bg-sky-50/80 text-slate-700">
                      <tr>
                        <th
                          scope="col"
                          className="min-w-[14.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold"
                          aria-sort={
                            tableSort.key === "mainTopic"
                              ? tableSort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleDepartmentTableSort("mainTopic")}
                            className="inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 transition hover:bg-sky-100/70 hover:text-sky-900"
                          >
                            대분류
                            <DepartmentTableSortIcon
                              active={tableSort.key === "mainTopic"}
                              direction={tableSort.dir}
                            />
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="min-w-[10.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold"
                          aria-sort={
                            tableSort.key === "subTopicDetail"
                              ? tableSort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleDepartmentTableSort("subTopicDetail")}
                            className="inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 transition hover:bg-sky-100/70 hover:text-sky-900"
                          >
                            소분류 / 세부 내용
                            <DepartmentTableSortIcon
                              active={tableSort.key === "subTopicDetail"}
                              direction={tableSort.dir}
                            />
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="min-w-[3.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold"
                          aria-sort={
                            tableSort.key === "bm"
                              ? tableSort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleDepartmentTableSort("bm")}
                            className="inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 transition hover:bg-sky-100/70 hover:text-sky-900"
                          >
                            B/M
                            <DepartmentTableSortIcon
                              active={tableSort.key === "bm"}
                              direction={tableSort.dir}
                            />
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="min-w-[4.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold"
                          aria-sort={
                            tableSort.key === "weight"
                              ? tableSort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleDepartmentTableSort("weight")}
                            className="inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 transition hover:bg-sky-100/70 hover:text-sky-900"
                          >
                            가중치
                            <DepartmentTableSortIcon
                              active={tableSort.key === "weight"}
                              direction={tableSort.dir}
                            />
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="min-w-[5.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold"
                          aria-sort={
                            tableSort.key === "owner"
                              ? tableSort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleDepartmentTableSort("owner")}
                            className="inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 transition hover:bg-sky-100/70 hover:text-sky-900"
                          >
                            담당자
                            <DepartmentTableSortIcon
                              active={tableSort.key === "owner"}
                              direction={tableSort.dir}
                            />
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="w-[10rem] min-w-[10rem] max-w-[10rem] whitespace-nowrap px-3 py-3 text-left font-semibold"
                          aria-sort={
                            tableSort.key === "period"
                              ? tableSort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleDepartmentTableSort("period")}
                            className="inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 transition hover:bg-sky-100/70 hover:text-sky-900"
                          >
                            평가 구간
                            <DepartmentTableSortIcon
                              active={tableSort.key === "period"}
                              direction={tableSort.dir}
                            />
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="min-w-[7rem] whitespace-nowrap px-4 py-3 text-left font-semibold"
                          aria-sort={
                            tableSort.key === "achievement"
                              ? tableSort.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleDepartmentTableSort("achievement")}
                            className="inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 transition hover:bg-sky-100/70 hover:text-sky-900"
                          >
                            달성률
                            <DepartmentTableSortIcon
                              active={tableSort.key === "achievement"}
                              direction={tableSort.dir}
                            />
                          </button>
                        </th>
                        <th className="min-w-[9.5rem] whitespace-nowrap py-3 pl-2.5 pr-4 text-left font-semibold">
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItems.map((item, index) => {
                        const isAllView = selectedAchievementMonth === "all";
                        const isEvaluatedMonth =
                          !isAllView && itemIsEvaluatedInMonth(item, selectedAchievementMonth);
                        const selectedMonthRate = isAllView
                          ? item.averageAchievement
                          : isEvaluatedMonth
                            ? item.monthlyAchievementRates[selectedAchievementMonth] ?? 0
                            : null;
                        const has = selectedMonthRate !== null;
                        const prev = index > 0 ? sortedItems[index - 1] : null;
                        const showMainGroup = !prev || prev.mainTopic !== item.mainTopic;
                        return (
                          <Fragment key={`row-${item.id}`}>
                          <tr
                            key={item.id}
                            onClick={() => {
                              setModalMode("viewer");
                              setSelectedKpi(item);
                            }}
                            className={`min-h-[4.25rem] border-t border-sky-50 text-slate-700 transition hover:bg-sky-50/50 ${
                              item.hasRejectionNotice
                                ? "bg-red-50/50 ring-1 ring-inset ring-red-300"
                                : item.needsStructureReview
                                  ? "bg-amber-50/50 ring-1 ring-inset ring-amber-300"
                                : ""
                            }`}
                          >
                            <td className="align-middle px-4 py-2 font-medium text-slate-800">
                              {showMainGroup ? (
                                <div className="flex items-center gap-2">
                                  {item.hasRejectionNotice || item.needsStructureReview ? (
                                    <span
                                      className="inline-flex shrink-0"
                                      title={
                                        item.hasRejectionNotice
                                          ? "반려 사유가 있는 항목"
                                          : "Rev02 평가 구조 확인 필요"
                                      }
                                    >
                                      <AlertTriangle
                                        className={`h-4 w-4 ${
                                          item.hasRejectionNotice ? "text-red-600" : "text-amber-600"
                                        }`}
                                        aria-hidden
                                      />
                                    </span>
                                  ) : (
                                    <ClipboardList className="h-4 w-4 text-sky-600" aria-hidden />
                                  )}
                                  <span className="font-semibold">{item.mainTopic}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="align-middle px-4 py-2">
                              <div className="min-w-0">
                                <p className="text-left text-sky-700">{item.subTopic}</p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                                  {item.detailActivity?.trim() ? item.detailActivity : "세부 내용 없음"}
                                </p>
                                {item.needsStructureReview ? (
                                  <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                                    KPI 구조 수정 필요
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="align-middle px-4 py-2">
                              {benchmarkValueLabel(item)}
                            </td>
                            <td className="align-middle px-4 py-2">{item.weight}</td>
                            <td className="align-middle px-4 py-2">{item.owner}</td>
                            <td className="align-middle w-[10rem] max-w-[10rem] px-3 py-2 text-xs font-medium leading-5 text-slate-700">
                              {periodRangeLabel(item.periodStartMonth, item.periodEndMonth)}
                            </td>
                            <td className="align-middle px-4 py-2">
                              <span
                                className={`inline-flex flex-col items-start gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                                  item.isFinalCompleted
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                                    : "bg-sky-50 text-sky-700 ring-sky-200"
                                }`}
                              >
                                {item.isFinalCompleted ? (
                                  <span className="leading-tight">완료</span>
                                ) : has ? (
                                  <span className="tabular-nums leading-tight">
                                    {formatKoPercentMax2(selectedMonthRate ?? 0)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="leading-none tabular-nums">
                                      {isAllView ? "0%" : "—"}
                                    </span>
                                    <span className="text-[10px] font-medium leading-tight text-sky-700/90">
                                      {isAllView ? "데이터 없음" : "평가 제외"}
                                    </span>
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="align-middle py-2 pl-2.5 pr-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!(canEditPerformance || canManageKpiItems)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canManageKpiItems) {
                                      setEditingKpiItem(item);
                                      setShowCreateModal(true);
                                      return;
                                    }
                                    setModalMode("editor");
                                    setSelectedKpi(item);
                                  }}
                                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {canManageKpiItems ? "KPI 수정" : "실적 등록"}
                                </button>
                                {canManageKpiItems ? (
                                  <button
                                    type="button"
                                    disabled={deleteKpiItemMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleDeleteKpiItem(item.id);
                                    }}
                                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                                  >
                                    삭제
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        </>
        )}
      </main>
      <PerformanceModal
        isOpen={selectedKpi !== null}
        kpiItem={selectedKpi}
        startMode={modalMode}
        canEditPerformance={canEditPerformance}
        profileRole={ensuredRole}
        profileUserId={ensuredProfile.id}
        canDeleteKpiItem={canManageKpiItems}
        onDeleteKpiItem={(kpiId) => handleDeleteKpiItem(kpiId)}
        canFinalizeKpiItem={canFinalizeKpiItems}
        onFinalizeKpiItem={(kpiId, completed) =>
          handleFinalizeKpiItem(kpiId, completed)
        }
        onExtendPeriodEndMonth={(kpiId) => handleExtendKpiItemPeriodEndMonth(kpiId)}
        onClose={() => setSelectedKpi(null)}
      />
      <KpiCreateModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingKpiItem(null);
        }}
        deptId={departmentId}
        deptName={detailQuery.data?.department?.name ?? "해당 부서"}
        currentWeightSum={
          editingKpiItem
            ? Math.max(0, totalWeight - Number(editingKpiItem.weight || 0))
            : totalWeight
        }
        mainTopicOptions={mainTopicOptions}
        subTopicOptions={subTopicOptions}
        editingItem={
          editingKpiItem
            ? {
                id: editingKpiItem.id,
                mainTopic: editingKpiItem.mainTopic,
                subTopic: editingKpiItem.subTopic,
                detailActivity: editingKpiItem.detailActivity,
                bm: editingKpiItem.bm,
                owner: editingKpiItem.owner,
                weight: editingKpiItem.weight,
                evaluationType: editingKpiItem.evaluationType,
                unit: editingKpiItem.unit,
                indicatorType: editingKpiItem.indicatorType,
                targetDirection: editingKpiItem.targetDirection,
                qualitativeCalcType: editingKpiItem.qualitativeCalcType,
                aggregationType: editingKpiItem.aggregationType,
                targetFillPolicy: editingKpiItem.targetFillPolicy,
                achievementCap: editingKpiItem.achievementCap,
                periodStartMonth: editingKpiItem.periodStartMonth,
                periodEndMonth: editingKpiItem.periodEndMonth,
                targetPpm: editingKpiItem.targetPpm,
                monthlyTargets: editingKpiItem.monthlyTargets,
                monthlyTargetNotes: editingKpiItem.monthlyTargetNotes,
              }
            : null
        }
        submitting={createManualKpiMutation.isPending || updateManualKpiMutation.isPending}
        onSubmit={async (payload, options) => {
          try {
            if (options?.kpiId) {
              await updateManualKpiMutation.mutateAsync({ ...payload, kpiId: options.kpiId });
            } else {
              await createManualKpiMutation.mutateAsync(payload);
            }
            await detailQuery.refetch();
            setEditingKpiItem(null);
            window.alert(options?.kpiId ? "KPI 항목이 수정되었습니다." : "KPI 항목이 등록되었습니다.");
          } catch (e) {
            window.alert(
              e instanceof Error
                ? e.message
                : options?.kpiId
                  ? "KPI 항목 수정에 실패했습니다."
                  : "KPI 항목 등록에 실패했습니다."
            );
            throw e;
          }
        }}
      />

    </div>
  );
}
