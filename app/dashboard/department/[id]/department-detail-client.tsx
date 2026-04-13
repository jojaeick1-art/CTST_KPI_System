"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  FileUp,
  Loader2,
  BarChart3,
  CheckCircle2,
  Settings,
  LogOut,
  Target,
} from "lucide-react";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  CURRENT_KPI_YEAR,
  indicatorUsesComputedAchievement,
  type DepartmentKpiDetailItem,
  type KpiIndicatorType,
} from "@/src/lib/kpi-queries";
import {
  formatKoMax2Decimals,
  formatKoPercentMax2,
  roundToMax2DecimalPlaces,
} from "@/src/lib/format-display-number";
import {
  canAccessApprovalsPage,
  canAccessSystemSettings,
  canBulkUploadKpiExcel,
  canConfigureKpiIndicatorType,
  canSubmitMonthlyPerformance,
  DASHBOARD_SHOW_MAIN_SESSION_KEY,
  hrefDashboardDepartmentList,
  isAdminRole,
  normalizeRole,
} from "@/src/lib/rbac";
import {
  useDashboardProfile,
  useDeleteKpiItemMutation,
  useDepartmentKpiDetail,
  useImportKpisByExcelMutation,
  useUpdateKpiItemIndicatorMutation,
} from "@/src/hooks/useKpiQueries";
import { PerformanceModal } from "./performance-modal";
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
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

function indicatorModeShortLabel(t: KpiIndicatorType): string {
  if (t === "normal") return "일반 (%)";
  if (t === "ppm") return "PPM";
  if (t === "quantity") return "수량(k)";
  return "건수";
}

/** "상반기 … / 하반기 …" 형태면 슬래시 기준으로 두 줄 표시 */
function halfYearSummaryTwoLines(text: string | null | undefined): ReactNode {
  const raw = (text ?? "").trim();
  if (!raw) return <span className="text-slate-400">—</span>;
  const m = raw.match(/^(.+?)\s*\/\s*(하반기[\s\S]*)$/);
  if (m?.[1]?.trim() && m?.[2]?.trim()) {
    return (
      <span className="inline-block min-w-0 max-w-full text-left align-top">
        <span className="block break-words leading-snug">{m[1].trim()}</span>
        <span className="mt-0.5 block break-words leading-snug">{m[2].trim()}</span>
      </span>
    );
  }
  return <span className="break-words leading-snug">{raw}</span>;
}

export function DepartmentDetailClient({ departmentId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const profileQuery = useDashboardProfile();
  const detailQuery = useDepartmentKpiDetail(departmentId);
  const importMutation = useImportKpisByExcelMutation();
  const deleteKpiItemMutation = useDeleteKpiItemMutation();
  const updateIndicatorMutation = useUpdateKpiItemIndicatorMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<{
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
    indicatorType: KpiIndicatorType;
    targetPpm: number | null;
  } | null>(null);
  const [modalMode, setModalMode] = useState<"viewer" | "editor">("viewer");
  const [exportingExcel, setExportingExcel] = useState(false);
  /** 목표값이 없는 상태에서 PPM·수량(k)·건수로 바꿀 때만 표시 */
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

  const profile = profileQuery.data.profile;
  const userDeptId =
    typeof profile.dept_id === "string" ? profile.dept_id : null;
  const role = profile.role;
  const isAdmin = isAdminRole(role);
  const normalizedRole = normalizeRole(role);
  const roleCanAlwaysEdit =
    isAdmin ||
    normalizedRole === "group_leader" ||
    normalizedRole === "team_leader";
  const canExcel = canBulkUploadKpiExcel(role);
  const isOwnDepartment =
    Boolean(userDeptId) && userDeptId === departmentId;
  const canConfigureIndicator =
    canConfigureKpiIndicatorType(role) && (isAdmin || isOwnDepartment);
  const canEditPerformance =
    isAdmin ||
    (isOwnDepartment &&
      (roleCanAlwaysEdit || canSubmitMonthlyPerformance(role)));

  const dashboardListHref = hrefDashboardDepartmentList(role, userDeptId);

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
    if (!isAdmin) {
      window.alert("KPI 항목 삭제는 관리자만 가능합니다.");
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

  const navClass = (href: string) => {
    const active =
      href === "/dashboard"
        ? pathname === "/dashboard" ||
          pathname.startsWith("/dashboard/department/")
        : pathname === href;
    return active
      ? "flex items-center gap-2.5 rounded-lg bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-800 ring-1 ring-sky-100"
      : "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50/80";
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50/90 via-white to-white md:flex-row">
      <aside className="flex w-full flex-shrink-0 flex-col border-b border-sky-100 bg-white md:w-60 md:border-b-0 md:border-r md:border-sky-100">
        <div className="flex h-[95px] items-center gap-2 border-b border-sky-100 px-4">
          <div className="flex h-[114px] w-[120px] items-center justify-center overflow-hidden rounded-xl">
            <img
              src="/logo_ctst.png"
              alt="CTST 로고"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-sky-700/90">
              KPI 관리 시스템
            </p>
            <p className="text-[11px] text-slate-500">내부 성과 관리</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="주 메뉴">
          <Link href={dashboardListHref} className={navClass("/dashboard")}>
            <BarChart3 className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
            부서별 KPI
          </Link>
          {canAccessApprovalsPage(role) ? (
            <Link href="/dashboard/approvals" className={navClass("/dashboard/approvals")}>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              실적 승인 관리
            </Link>
          ) : null}
          {canAccessSystemSettings(role) ? (
            <Link href="/dashboard/settings" className={navClass("/dashboard/settings")}>
              <Settings className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              시스템 설정
            </Link>
          ) : null}
        </nav>
        <div className="border-t border-sky-100 p-3">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            로그아웃
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={dashboardListHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            대시보드로
          </Link>
          <ChangePasswordButton profileUsername={profile.username} />
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
            {!isOwnDepartment ? (
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
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100">
                      기준 연도: {CURRENT_KPI_YEAR}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-500">
                      연도 선택(준비중)
                    </span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2 shadow-sm shadow-sky-100/50">
                    <Target className="h-4 w-4 text-sky-600" aria-hidden />
                    <p className="text-sm font-medium text-slate-700">
                      전체 평균 달성률{" "}
                      <span className="text-xs font-normal text-slate-500">
                        (승인된 실적만)
                      </span>
                      :{" "}
                      <span className="text-base font-bold text-sky-700">
                        {detailQuery.data.departmentAverageAchievement === null
                          ? "0% (데이터 없음)"
                          : formatKoPercentMax2(
                              detailQuery.data.departmentAverageAchievement
                            )}
                      </span>
                    </p>
                  </div>
                </div>
                {canExcel ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={exportingExcel || !detailQuery.data?.items?.length}
                      onClick={() => void handleExportCurrentListToExcel()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {exportingExcel ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileUp className="h-4 w-4" />
                      )}
                      엑셀 다운로드
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadTemplateXlsx()}
                      className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
                    >
                      샘플 양식 다운로드
                    </button>
                    <button
                      type="button"
                      disabled={importMutation.isPending}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                    >
                      {importMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileUp className="h-4 w-4" />
                      )}
                      엑셀 업로드
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => void handleExcelSelected(e.target.files?.[0] ?? null)}
                    />
                  </div>
                ) : null}
              </div>
            </header>

            {!detailQuery.data.items.length ? (
              <p className="rounded-xl border border-sky-100 bg-white px-4 py-8 text-center text-sm text-slate-600">
                이 부서에 등록된 KPI 항목이 없습니다.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-100/40">
                {canConfigureIndicator ? (
                  <p className="border-b border-sky-50 bg-sky-50/40 px-4 py-2.5 text-xs leading-relaxed text-slate-600">
                    엑셀·CSV는 <span className="font-semibold">기존 양식 그대로</span> 업로드하면 됩니다.
                    업로드 후 아래 표의{" "}
                    <span className="font-semibold text-slate-800">실적 방식</span> 열 드롭다운에서 항목마다{" "}
                    <span className="font-semibold">일반(%)</span>,{" "}
                    <span className="font-semibold">PPM</span>,{" "}
                    <span className="font-semibold">수량(k)</span>,{" "}
                    <span className="font-semibold">건수</span> 중 하나를 고르고, PPM·수량(k)·건수는{" "}
                    <span className="font-semibold text-slate-800">목표</span> 열에 값을 입력합니다. (그룹장·팀장·관리자만 편집)
                  </p>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="min-w-[1500px] w-full border-collapse text-sm">
                    <thead className="bg-sky-50/80 text-slate-700">
                      <tr>
                        <th className="min-w-[14.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          메인주제
                        </th>
                        <th className="min-w-[13rem] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          서브주제
                        </th>
                        <th className="min-w-[3.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          B/M
                        </th>
                        <th className="min-w-[4.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          가중치
                        </th>
                        <th className="min-w-[5.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          담당자
                        </th>
                        <th className="w-[10.5rem] min-w-[10.5rem] max-w-[10.5rem] whitespace-nowrap px-3 py-3 text-left font-semibold">
                          목표 요약
                        </th>
                        <th className="min-w-[7rem] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          달성률
                          <span className="ml-1 font-normal text-slate-400">(승인)</span>
                        </th>
                        <th className="min-w-[6.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold">
                          현재 상태
                        </th>
                        <th
                          className="w-[8.5rem] min-w-[8.5rem] whitespace-nowrap px-4 py-3 text-left font-semibold"
                          title="일반: 달성률 % 직접 입력. PPM·수량(k)·건수: 실적 수치 입력 후 달성률 계산. 수량(k)은 천 단위(k)로 입력합니다."
                        >
                          실적 방식
                        </th>
                        <th
                          className="w-[9rem] min-w-[9rem] max-w-[9rem] whitespace-nowrap px-3 py-3 text-left font-semibold"
                          title="PPM·수량(k)·건수일 때 목표값. 수량(k) 목표도 k(천) 단위 숫자입니다."
                        >
                          목표
                        </th>
                        <th className="min-w-[9.5rem] whitespace-nowrap py-3 pl-2.5 pr-4 text-left font-semibold">
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQuery.data.items.map((item) => {
                        const has = item.averageAchievement !== null;
                        return (
                          <tr
                            key={item.id}
                            className={`min-h-[4.25rem] border-t border-sky-50 text-slate-700 transition hover:bg-sky-50/50 ${
                              item.hasRejectionNotice
                                ? "bg-red-50/50 ring-1 ring-inset ring-red-300"
                                : ""
                            }`}
                          >
                            <td className="align-middle px-4 py-2 font-medium text-slate-800">
                              <div className="flex items-center gap-2">
                                {item.hasRejectionNotice ? (
                                  <span className="inline-flex shrink-0" title="반려 사유가 있는 항목">
                                    <AlertTriangle
                                      className="h-4 w-4 text-red-600"
                                      aria-hidden
                                    />
                                  </span>
                                ) : (
                                  <ClipboardList className="h-4 w-4 text-sky-600" aria-hidden />
                                )}
                                {item.mainTopic}
                              </div>
                            </td>
                            <td className="align-middle px-4 py-2">
                              <button
                                type="button"
                                className="text-left text-sky-700 underline-offset-2 hover:underline"
                                onClick={() => {
                                  setModalMode("viewer");
                                  setSelectedKpi({
                                    id: item.id,
                                    mainTopic: item.mainTopic,
                                    subTopic: item.subTopic,
                                    detailActivity: item.detailActivity,
                                    bm: item.bm,
                                    weight: item.weight,
                                    owner: item.owner,
                                    halfYearSummary: item.halfYearSummary,
                                    challengeTarget: item.challengeTarget,
                                    firstHalfRate: item.firstHalfRate,
                                    secondHalfRate: item.secondHalfRate,
                                    firstHalfTarget: item.firstHalfTarget,
                                    secondHalfTarget: item.secondHalfTarget,
                                    h1TargetDate: item.h1TargetDate,
                                    h2TargetDate: item.h2TargetDate,
                                    scheduleRaw: item.scheduleRaw,
                                    indicatorType: item.indicatorType,
                                    targetPpm: item.targetPpm,
                                  });
                                }}
                              >
                                {item.subTopic}
                              </button>
                            </td>
                            <td className="align-middle px-4 py-2">{item.bm}</td>
                            <td className="align-middle px-4 py-2">{item.weight}</td>
                            <td className="align-middle px-4 py-2">{item.owner}</td>
                            <td className="align-top w-[10.5rem] max-w-[10.5rem] px-3 py-2 text-xs leading-5 text-slate-600">
                              {halfYearSummaryTwoLines(item.halfYearSummary)}
                            </td>
                            <td className="align-middle px-4 py-2">
                              <span className="inline-flex flex-col items-start gap-0.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                                {has ? (
                                  <span className="tabular-nums leading-tight">
                                    {formatKoPercentMax2(item.averageAchievement ?? 0)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="leading-none tabular-nums">0%</span>
                                    <span className="text-[10px] font-medium leading-tight text-sky-700/90">
                                      데이터 없음
                                    </span>
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="align-middle px-4 py-2">
                              <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                                {approvalStepLabel(item.currentApprovalStep)}
                              </span>
                            </td>
                            <td className="align-middle px-4 py-2">
                              {canConfigureIndicator ? (
                                <select
                                  value={
                                    pendingIndicator?.kpiId === item.id
                                      ? pendingIndicator.indicatorType
                                      : item.indicatorType
                                  }
                                  disabled={updateIndicatorMutation.isPending}
                                  onChange={(e) =>
                                    void handleIndicatorTypeSelect(
                                      item,
                                      e.target.value as KpiIndicatorType
                                    )
                                  }
                                  className="w-full max-w-[7.25rem] rounded-md border border-slate-300 bg-white px-1.5 py-1.5 text-[11px] font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-200 disabled:opacity-60"
                                  aria-label="실적 방식"
                                >
                                  <option value="normal">%</option>
                                  <option value="ppm">PPM</option>
                                  <option value="quantity">수량(k)</option>
                                  <option value="count">건수</option>
                                </select>
                              ) : (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${indicatorBadgeClass(item.indicatorType)}`}
                                >
                                  {indicatorModeShortLabel(item.indicatorType)}
                                </span>
                              )}
                            </td>
                            <td className="align-middle w-[9rem] max-w-[9rem] px-3 py-2">
                              {canConfigureIndicator ? (
                                pendingIndicator?.kpiId === item.id ? (
                                  <div className="flex flex-nowrap items-center justify-start gap-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      inputMode="decimal"
                                      value={pendingTargetInput}
                                      onChange={(e) =>
                                        setPendingTargetInput(e.target.value)
                                      }
                                      className="h-8 w-[4.25rem] shrink-0 rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-900 outline-none focus:border-sky-500"
                                      placeholder="목표"
                                    />
                                    <button
                                      type="button"
                                      disabled={updateIndicatorMutation.isPending}
                                      onClick={() => void applyPendingIndicatorTarget()}
                                      className="h-8 shrink-0 whitespace-nowrap rounded bg-sky-600 px-1.5 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                                    >
                                      적용
                                    </button>
                                  </div>
                                ) : indicatorUsesComputedAchievement(
                                    item.indicatorType
                                  ) &&
                                  item.targetPpm !== null &&
                                  item.targetPpm > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-semibold tabular-nums text-slate-800">
                                      {formatKoMax2Decimals(item.targetPpm)}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={updateIndicatorMutation.isPending}
                                      onClick={() => {
                                        setPendingIndicator({
                                          kpiId: item.id,
                                          indicatorType: item.indicatorType,
                                        });
                                        setPendingTargetInput(String(item.targetPpm));
                                      }}
                                      className="text-[11px] font-semibold text-sky-700 underline-offset-2 hover:underline disabled:opacity-50"
                                    >
                                      수정
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )
                              ) : indicatorUsesComputedAchievement(
                                  item.indicatorType
                                ) &&
                                item.targetPpm !== null &&
                                item.targetPpm > 0 ? (
                                <span className="text-xs font-medium tabular-nums text-slate-700">
                                  {formatKoMax2Decimals(item.targetPpm)}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td className="align-middle py-2 pl-2.5 pr-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!canEditPerformance}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalMode("editor");
                                    setSelectedKpi({
                                      id: item.id,
                                      mainTopic: item.mainTopic,
                                      subTopic: item.subTopic,
                                      detailActivity: item.detailActivity,
                                      bm: item.bm,
                                      weight: item.weight,
                                      owner: item.owner,
                                      halfYearSummary: item.halfYearSummary,
                                      challengeTarget: item.challengeTarget,
                                      firstHalfRate: item.firstHalfRate,
                                      secondHalfRate: item.secondHalfRate,
                                      firstHalfTarget: item.firstHalfTarget,
                                      secondHalfTarget: item.secondHalfTarget,
                                      h1TargetDate: item.h1TargetDate,
                                      h2TargetDate: item.h2TargetDate,
                                      scheduleRaw: item.scheduleRaw,
                                      indicatorType: item.indicatorType,
                                      targetPpm: item.targetPpm,
                                    });
                                  }}
                                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {roleCanAlwaysEdit ? "수정" : "실적 등록"}
                                </button>
                                {isAdmin ? (
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <PerformanceModal
        isOpen={selectedKpi !== null}
        kpiItem={selectedKpi}
        startMode={modalMode}
        canEditPerformance={canEditPerformance}
        profileRole={role}
        canDeleteKpiItem={isAdmin}
        onDeleteKpiItem={(kpiId) => handleDeleteKpiItem(kpiId)}
        onClose={() => setSelectedKpi(null)}
      />

    </div>
  );
}
