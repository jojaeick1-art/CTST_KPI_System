"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Loader2,
  Plus,
  Save,
  Settings,
  Shield,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { createBrowserSupabase } from "@/src/lib/supabase";
import { ChangePasswordButton } from "../change-password-modal";
import { KPI_MONTHS, type MonthKey } from "@/src/lib/kpi-queries";
import {
  canAccessApprovalsPage,
  canAccessSystemSettings,
  canViewAllDepartmentCards,
  isAdminRole,
  roleLabelKo,
} from "@/src/lib/rbac";
import {
  useCreateDepartmentMutation,
  useClearAllKpiDataMutation,
  useDashboardProfile,
  useDashboardSummaryStats,
  useDeleteDepartmentMutation,
  useDepartmentsForManagement,
  useMonthDeadlines,
  useRenameDepartmentMutation,
  useAppFeatureAvailability,
  useSetAppFeatureAvailabilityMutation,
  useSaveMonthDeadlineMutation,
} from "@/src/hooks/useKpiQueries";

function displayNameFromSession(
  profileFullName: string | null | undefined,
  username: string,
  userMetadata: Record<string, unknown> | undefined
): string {
  const profileName = typeof profileFullName === "string" ? profileFullName.trim() : "";
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

export function SettingsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const profileQuery = useDashboardProfile();
  const profileData = profileQuery.data;
  const summaryRole = profileData?.profile.role ?? "";
  const summaryDeptId =
    typeof profileData?.profile.dept_id === "string" ? profileData.profile.dept_id : null;
  const summaryStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess &&
      profileData != null &&
      canAccessApprovalsPage(summaryRole),
    canViewAllDepartmentCards(summaryRole) ? null : summaryDeptId
  );
  const pendingApprovalCount =
    (summaryStatsQuery.data?.pendingPrimaryCount ?? 0) +
    (summaryStatsQuery.data?.pendingFinalCount ?? 0);
  const isAdmin =
    profileQuery.isSuccess &&
    profileData != null &&
    canAccessSystemSettings(profileData.profile.role);
  const deptQuery = useDepartmentsForManagement(
    profileQuery.isSuccess && profileQuery.data !== null && isAdmin
  );
  const deadlineQuery = useMonthDeadlines(
    profileQuery.isSuccess && profileQuery.data !== null && isAdmin
  );
  const appFeatureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null && isAdmin
  );

  const createDeptMut = useCreateDepartmentMutation();
  const renameDeptMut = useRenameDepartmentMutation();
  const deleteDeptMut = useDeleteDepartmentMutation();
  const saveDeadlineMut = useSaveMonthDeadlineMutation();
  const clearAllDataMut = useClearAllKpiDataMutation();
  const setAppFeatureMut = useSetAppFeatureAvailabilityMutation();

  const [newDeptName, setNewDeptName] = useState("");
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState("");
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>({});
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  useEffect(() => {
    if (!profileQuery.isSuccess) return;
    if (profileQuery.data === null) router.replace("/login");
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  useEffect(() => {
    if (!profileQuery.isSuccess || !profileQuery.data) return;
    if (!canAccessSystemSettings(profileQuery.data.profile.role)) {
      router.replace("/dashboard");
    }
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  useEffect(() => {
    if (!deadlineQuery.data) return;
    const next: Record<string, string> = {};
    for (const m of KPI_MONTHS) next[`M${m}`] = "";
    for (const row of deadlineQuery.data) {
      next[`M${row.month}`] = row.input_deadline ?? "";
    }
    setDeadlineDrafts(next);
  }, [deadlineQuery.data]);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function handleCreateDepartment() {
    if (!newDeptName.trim()) {
      window.alert("부서명을 입력해 주세요.");
      return;
    }
    try {
      await createDeptMut.mutateAsync(newDeptName);
      setNewDeptName("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "부서 추가 실패");
    }
  }

  async function handleRenameDepartment() {
    if (!editingDeptId) return;
    if (!editingDeptName.trim()) {
      window.alert("부서명을 입력해 주세요.");
      return;
    }
    try {
      await renameDeptMut.mutateAsync({ id: editingDeptId, name: editingDeptName });
      setEditingDeptId(null);
      setEditingDeptName("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "부서 수정 실패");
    }
  }

  async function handleDeleteDepartment(id: string, name: string) {
    const ok = window.confirm(
      `부서 '${name}'를 삭제하시겠습니까?\n연결된 KPI 데이터가 있으면 DB 제약으로 실패할 수 있습니다.`
    );
    if (!ok) return;
    try {
      await deleteDeptMut.mutateAsync(id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "부서 삭제 실패");
    }
  }

  async function handleSaveDeadline(month: MonthKey) {
    try {
      const key = `M${month}`;
      const value = deadlineDrafts[key]?.trim() ?? "";
      await saveDeadlineMut.mutateAsync({
        month,
        input_deadline: value || null,
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "마감일 저장 실패");
    }
  }

  async function handleResetAllKpiData() {
    if (!isAdmin) {
      window.alert("관리자만 실행할 수 있습니다.");
      return;
    }
    if (resetConfirmText.trim() !== "초기화") {
      window.alert("확인 문구로 '초기화'를 정확히 입력해 주세요.");
      return;
    }
    if (!resetPassword.trim()) {
      window.alert("비밀번호를 입력해 주세요.");
      return;
    }
    const email = ctx?.session.user.email;
    if (!email) {
      window.alert("현재 계정 이메일을 확인할 수 없어 비밀번호 검증을 진행할 수 없습니다.");
      return;
    }
    try {
      const supabase = createBrowserSupabase();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: resetPassword,
      });
      if (authError) {
        throw new Error("비밀번호 확인에 실패했습니다. 다시 확인해 주세요.");
      }
      const ok = window.confirm(
        "정말로 테스트 데이터를 초기화하시겠습니까?\n모든 kpi_targets, kpi_items 데이터가 삭제됩니다."
      );
      if (!ok) return;
      await clearAllDataMut.mutateAsync();
      setResetConfirmText("");
      setResetPassword("");
      window.alert("테스트 데이터 초기화가 완료되었습니다.");
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "테스트 데이터 초기화 중 오류가 발생했습니다."
      );
    }
  }

  const isBusyDept =
    createDeptMut.isPending || renameDeptMut.isPending || deleteDeptMut.isPending;

  const ctx = profileQuery.data;
  const displayName = useMemo(() => {
    if (!ctx) return "";
    return displayNameFromSession(
      ctx.profile.full_name,
      ctx.profile.username,
      ctx.session.user.user_metadata as Record<string, unknown> | undefined
    );
  }, [ctx]);

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }
  if (!ctx) return null;

  const role = ctx.profile.role;
  const userDeptId =
    typeof ctx.profile.dept_id === "string" ? ctx.profile.dept_id : null;
  const isAdminUser = isAdminRole(role);
  const appFeatureRaw = appFeatureQuery.data ?? { capa: false, voc: false, kpi: false };
  const featureAccess = {
    capa: isAdminUser || appFeatureRaw.capa,
    voc: isAdminUser || appFeatureRaw.voc,
    kpi: isAdminUser || appFeatureRaw.kpi,
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50/90 via-white to-white md:flex-row">
      <CtstAppSidebar
        pathname={pathname}
        role={role}
        userDeptId={userDeptId}
        pendingApprovalCount={pendingApprovalCount}
        featureAccess={featureAccess}
        onSignOut={handleSignOut}
      />

      <main className="min-w-0 flex-1">
        <header className="border-b border-sky-100 bg-white/80 px-4 py-4 backdrop-blur-sm sm:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                시스템 설정
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                부서 관리, 월별 입력 마감일, 권한 정보를 관리합니다
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <ChangePasswordButton profileUsername={ctx.profile.username} />
            <div className="flex items-center gap-3 rounded-xl border border-sky-100 bg-white px-4 py-2.5 shadow-sm shadow-sky-100/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <User className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {displayName}
                  <span className="font-normal text-slate-400"> 님</span>
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-sky-600" aria-hidden />
                  <span className="text-xs font-medium text-sky-700">
                    {roleLabelKo(ctx.profile.role)}
                  </span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </header>

        <div className="grid gap-5 px-4 py-6 sm:p-8 xl:grid-cols-2">
          <section className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/40">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800">
              <Building2 className="h-4 w-4 text-sky-600" />
              부서 관리
            </h2>
            {!isAdmin ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                관리자만 부서를 추가/수정/삭제할 수 있습니다.
              </p>
            ) : (
              <>
                <div className="mb-3 flex gap-2">
                  <input
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    placeholder="새 부서명"
                  />
                  <button
                    type="button"
                    disabled={isBusyDept}
                    onClick={() => void handleCreateDepartment()}
                    className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {createDeptMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    추가
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-sky-100">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-sky-50/80 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">부서명</th>
                        <th className="px-3 py-2 text-right font-semibold">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(deptQuery.data ?? []).map((d) => (
                        <tr key={d.id} className="border-t border-sky-50">
                          <td className="px-3 py-2">
                            {editingDeptId === d.id ? (
                              <input
                                value={editingDeptName}
                                onChange={(e) => setEditingDeptName(e.target.value)}
                                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                              />
                            ) : (
                              <span className="font-medium text-slate-800">{d.name}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editingDeptId === d.id ? (
                              <div className="inline-flex gap-2">
                                <button
                                  type="button"
                                  disabled={renameDeptMut.isPending}
                                  onClick={() => void handleRenameDepartment()}
                                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                                >
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDeptId(null);
                                    setEditingDeptName("");
                                  }}
                                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDeptId(d.id);
                                    setEditingDeptName(d.name);
                                  }}
                                  className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  disabled={deleteDeptMut.isPending}
                                  onClick={() => void handleDeleteDepartment(d.id, d.name)}
                                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  삭제
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/40">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800">
              <Save className="h-4 w-4 text-sky-600" />
              월별 입력 마감 설정
            </h2>
            {deadlineQuery.isError ? (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deadlineQuery.error instanceof Error
                  ? deadlineQuery.error.message
                  : "설정 조회 실패"}
              </p>
            ) : (
              <div className="space-y-2">
                {KPI_MONTHS.map((m) => (
                  <div
                    key={m}
                    className="flex items-center justify-between rounded-lg border border-sky-100 bg-sky-50/40 px-3 py-2"
                  >
                    <span className="w-24 text-sm font-medium text-slate-700">{m}월</span>
                    <input
                      type="date"
                      value={deadlineDrafts[`M${m}`] ?? ""}
                      onChange={(e) =>
                        setDeadlineDrafts((prev) => ({ ...prev, [`M${m}`]: e.target.value }))
                      }
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#1a1a1a] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    />
                    <button
                      type="button"
                      disabled={saveDeadlineMut.isPending}
                      onClick={() => void handleSaveDeadline(m)}
                      className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                    >
                      {saveDeadlineMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      저장
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/40">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800">
              <Settings className="h-4 w-4 text-sky-600" />
              앱 메뉴 공개 설정
            </h2>
            {!isAdmin ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                관리자만 변경할 수 있습니다.
              </p>
            ) : appFeatureQuery.isPending ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                설정을 불러오는 중...
              </div>
            ) : appFeatureQuery.isError ? (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {appFeatureQuery.error instanceof Error
                  ? appFeatureQuery.error.message
                  : "앱 메뉴 공개 설정 조회 실패"}
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                {([
                  { key: "kpi", label: "KPI 메뉴", enabled: appFeatureRaw.kpi },
                  { key: "capa", label: "CAPA Simulator", enabled: appFeatureRaw.capa },
                  { key: "voc", label: "VOC 메뉴", enabled: appFeatureRaw.voc },
                ] as const).map((feature) => (
                  <div
                    key={feature.key}
                    className="flex items-center justify-between rounded-lg border border-sky-100 bg-sky-50/40 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{feature.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          feature.enabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {feature.enabled ? "공개" : "잠금"}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={setAppFeatureMut.isPending}
                      onClick={() =>
                        void setAppFeatureMut.mutateAsync({
                          feature: feature.key,
                          enabled: !feature.enabled,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-60"
                    >
                      {setAppFeatureMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Settings className="h-3.5 w-3.5" />
                      )}
                      {feature.enabled ? "잠금" : "공개"}
                    </button>
                  </div>
                ))}
                <p className="text-xs text-slate-500">
                  한눈에 현재 상태를 보고 바로 공개/잠금 전환할 수 있습니다. (관리자는 잠금 상태여도 접근 가능)
                </p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/40 xl:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800">
              <Users className="h-4 w-4 text-sky-600" />
              사용자 권한 요약
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
                <p className="text-xs text-slate-500">현재 사용자</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{displayName}</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
                <p className="text-xs text-slate-500">권한</p>
                <p className="mt-1 text-sm font-semibold text-sky-700">
                  {roleLabelKo(ctx.profile.role)}
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">계정 관리(예정)</p>
                <p className="mt-1 text-sm text-slate-600">
                  사용자 생성/비활성화/권한 변경 기능을 추후 연결할 자리입니다.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm shadow-red-100/40 xl:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-red-700">
              <Trash2 className="h-4 w-4" />
              테스트 데이터 초기화 (관리자 전용)
            </h2>
            {!isAdmin ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                관리자만 실행할 수 있습니다.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  실수 방지를 위해 확인 문구와 계정 비밀번호를 입력해야 합니다.
                </p>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="확인 문구 입력: 초기화"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="현재 계정 비밀번호"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <button
                  type="button"
                  disabled={clearAllDataMut.isPending}
                  onClick={() => void handleResetAllKpiData()}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  {clearAllDataMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  테스트 데이터 초기화 실행
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
