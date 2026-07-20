"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
} from "recharts";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { CtstUserProfileMenu } from "@/src/components/ctst-user-profile-menu";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
  useDepartmentsForManagement,
  useInactiveUsers,
  useLoginAuditRows,
  useLoginStatsByDept,
  useLoginStatsByUser,
  useLoginSummaryStats,
  useProfilesForLogFilters,
} from "@/src/hooks/useKpiQueries";
import {
  approvalNotificationCount,
  canAccessApprovalsPage,
  canAccessSystemSettings,
  isAdminRole,
  roleLabelKo,
} from "@/src/lib/rbac";
import type {
  LoginStatsByDeptRow,
  LoginStatsByUserRow,
  LoginStatsFilterInput,
} from "@/src/lib/kpi-queries";

type LogsTableTab = "dept" | "user" | "inactive" | "audit";
type Period = "day" | "month";

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

function sixMonthsAgoIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  return d.toISOString().slice(0, 7);
}

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function statusLabel(inactiveDays: number | null): string {
  if (inactiveDays === null) return "미접속 이력 없음";
  if (inactiveDays >= 60) return "위험";
  if (inactiveDays >= 30) return "장기 미접속";
  if (inactiveDays >= 8) return "주의";
  return "정상";
}

function buildDeptChartData(rows: LoginStatsByDeptRow[]) {
  const periodMap = new Map<string, Record<string, string | number>>();
  const deptNames = Array.from(new Set(rows.map((row) => row.deptName)));
  for (const row of rows) {
    const existing = periodMap.get(row.periodLabel) ?? { periodLabel: row.periodLabel };
    existing[row.deptName] = row.loginCount;
    periodMap.set(row.periodLabel, existing);
  }
  return {
    deptNames,
    data: Array.from(periodMap.values()),
  };
}

function buildTopUserChartData(rows: LoginStatsByUserRow[]) {
  const byUser = new Map<
    string,
    { name: string; deptName: string; loginCount: number }
  >();
  for (const row of rows) {
    const key = row.userId;
    const prev = byUser.get(key);
    byUser.set(key, {
      name: row.fullName?.trim() || row.username,
      deptName: row.deptName,
      loginCount: (prev?.loginCount ?? 0) + row.loginCount,
    });
  }
  return [...byUser.values()]
    .sort((a, b) => b.loginCount - a.loginCount)
    .slice(0, 10)
    .map((row) => ({
      name: row.name,
      deptName: row.deptName,
      loginCount: row.loginCount,
    }));
}

function aggregateDeptTable(rows: LoginStatsByDeptRow[]) {
  const map = new Map<
    string,
    { deptName: string; loginCount: number; uniqueUserCount: number }
  >();
  for (const row of rows) {
    const prev = map.get(row.deptName);
    map.set(row.deptName, {
      deptName: row.deptName,
      loginCount: (prev?.loginCount ?? 0) + row.loginCount,
      uniqueUserCount: Math.max(prev?.uniqueUserCount ?? 0, row.uniqueUserCount),
    });
  }
  return [...map.values()].sort((a, b) => b.loginCount - a.loginCount);
}

function aggregateUserTable(rows: LoginStatsByUserRow[]) {
  const map = new Map<
    string,
    { name: string; deptName: string; loginCount: number }
  >();
  for (const row of rows) {
    const key = row.userId;
    const prev = map.get(key);
    map.set(key, {
      name: row.fullName?.trim() || row.username,
      deptName: row.deptName,
      loginCount: (prev?.loginCount ?? 0) + row.loginCount,
    });
  }
  return [...map.values()].sort((a, b) => b.loginCount - a.loginCount);
}

export function LogsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const profileQuery = useDashboardProfile();
  const ctx = profileQuery.data;

  const [period, setPeriod] = useState<Period>("month");
  const [startDate, setStartDate] = useState<string>(sixMonthsAgoIso());
  const [endDate, setEndDate] = useState<string>(currentMonthIso());
  const [deptId, setDeptId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<LogsTableTab>("dept");

  useEffect(() => {
    if (period === "month") {
      setStartDate((prev) => (prev.length === 7 ? prev : sixMonthsAgoIso()));
      setEndDate((prev) => (prev.length === 7 ? prev : currentMonthIso()));
      return;
    }
    setStartDate((prev) => (prev.length === 10 ? prev : thirtyDaysAgoIso()));
    setEndDate((prev) => (prev.length === 10 ? prev : todayIso()));
  }, [period]);

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

  const role = ctx?.profile.role ?? "";
  const userDeptId =
    typeof ctx?.profile.dept_id === "string" ? ctx.profile.dept_id : null;
  const pendingApprovalStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess &&
      profileQuery.data !== null &&
      canAccessApprovalsPage(role),
    null
  );
  const pendingApprovalCount = approvalNotificationCount(
    role,
    pendingApprovalStatsQuery.data?.pendingPrimaryCount ?? 0,
    pendingApprovalStatsQuery.data?.pendingFinalCount ?? 0
  );
  const isAdminUser = isAdminRole(role);
  const appFeatureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null && isAdminUser
  );
  const appFeatureRaw =
    appFeatureQuery.data ?? { capa: false, voc: false, kpi: false };
  const featureAccess = {
    capa: isAdminUser || appFeatureRaw.capa,
    voc: isAdminUser || appFeatureRaw.voc,
    kpi: isAdminUser || appFeatureRaw.kpi,
  };

  const departmentsQuery = useDepartmentsForManagement(
    profileQuery.isSuccess && profileQuery.data !== null && canAccessSystemSettings(role)
  );
  const profilesQuery = useProfilesForLogFilters(
    profileQuery.isSuccess && profileQuery.data !== null && canAccessSystemSettings(role)
  );

  const filters = useMemo<LoginStatsFilterInput>(
    () => ({
      period,
      startDate,
      endDate,
      deptId: deptId || null,
      userId: userId || null,
    }),
    [period, startDate, endDate, deptId, userId]
  );

  const enabled =
    profileQuery.isSuccess &&
    profileQuery.data !== null &&
    canAccessSystemSettings(role);

  const summaryQuery = useLoginSummaryStats(filters, enabled);
  const deptStatsQuery = useLoginStatsByDept(filters, enabled);
  const userStatsQuery = useLoginStatsByUser(filters, enabled);
  const inactiveUsersQuery = useInactiveUsers(
    { deptId: deptId || null, userId: userId || null, minInactiveDays: 30 },
    enabled
  );
  const auditRowsQuery = useLoginAuditRows(filters, enabled);

  const visibleProfiles = useMemo(() => {
    const rows = profilesQuery.data ?? [];
    if (!deptId) return rows;
    return rows.filter((row) => row.deptId === deptId);
  }, [profilesQuery.data, deptId]);

  useEffect(() => {
    if (!userId) return;
    if (visibleProfiles.some((row) => row.id === userId)) return;
    setUserId("");
  }, [userId, visibleProfiles]);

  const deptChart = useMemo(
    () => buildDeptChartData(deptStatsQuery.data ?? []),
    [deptStatsQuery.data]
  );
  const topUsersChart = useMemo(
    () => buildTopUserChartData(userStatsQuery.data ?? []),
    [userStatsQuery.data]
  );
  const deptTableRows = useMemo(
    () => aggregateDeptTable(deptStatsQuery.data ?? []),
    [deptStatsQuery.data]
  );
  const userTableRows = useMemo(
    () => aggregateUserTable(userStatsQuery.data ?? []),
    [userStatsQuery.data]
  );

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

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

  const loading =
    summaryQuery.isPending ||
    deptStatsQuery.isPending ||
    userStatsQuery.isPending ||
    inactiveUsersQuery.isPending ||
    auditRowsQuery.isPending ||
    departmentsQuery.isPending ||
    profilesQuery.isPending;
  const errorMessage =
    [summaryQuery, deptStatsQuery, userStatsQuery, inactiveUsersQuery, auditRowsQuery]
      .map((query) => query.error)
      .find(Boolean) instanceof Error
      ? (
          [summaryQuery, deptStatsQuery, userStatsQuery, inactiveUsersQuery, auditRowsQuery]
            .map((query) => query.error)
            .find(Boolean) as Error
        ).message
      : null;

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

      <main className="relative z-0 min-w-0 flex-1">
        <header className="sticky top-0 z-20 shrink-0 border-b border-sky-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur-md sm:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                로그 조회
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                부서별/사용자별 접속 통계, 마지막 접속일, 장기 미접속 현황을 확인합니다.
              </p>
            </div>
            <CtstUserProfileMenu
              displayName={displayName}
              roleLabel={roleLabelKo(ctx.profile.role)}
              profileUsername={ctx.profile.username}
              userId={ctx.session.user.id}
              notificationsEnabled={featureAccess.kpi}
            />
          </div>
        </header>

        <div className="space-y-5 px-4 py-6 sm:p-8">
          <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">집계 단위</span>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as Period)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="month">월별</option>
                    <option value="day">일별</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">시작</span>
                  <input
                    type={period === "month" ? "month" : "date"}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">종료</span>
                  <input
                    type={period === "month" ? "month" : "date"}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">부서</span>
                  <select
                    value={deptId}
                    onChange={(e) => setDeptId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="">전체 부서</option>
                    {(departmentsQuery.data ?? []).map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">사용자</span>
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="">전체 사용자</option>
                    {visibleProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {(profile.fullName?.trim() || profile.username) +
                          (profile.deptName ? ` · ${profile.deptName}` : "")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPeriod("month");
                    setStartDate(sixMonthsAgoIso());
                    setEndDate(currentMonthIso());
                    setDeptId("");
                    setUserId("");
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  초기화
                </button>
              </div>
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              로그 조회 데이터를 불러오지 못했습니다. 마이그레이션 적용 여부와 RLS를 확인해 주세요. ({errorMessage})
            </div>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
              <div className="flex items-center gap-2 text-sky-700">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-semibold">총 접속 수</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">
                {summaryQuery.data?.totalLoginCount ?? 0}
              </p>
            </article>
            <article className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
              <div className="flex items-center gap-2 text-emerald-700">
                <Users className="h-4 w-4" />
                <span className="text-xs font-semibold">활성 사용자</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">
                {summaryQuery.data?.activeUserCount ?? 0}
              </p>
            </article>
            <article className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
              <div className="flex items-center gap-2 text-slate-700">
                <CalendarDays className="h-4 w-4" />
                <span className="text-xs font-semibold">사용자당 평균</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">
                {summaryQuery.data?.avgLoginsPerUser ?? 0}
              </p>
            </article>
            <article className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
              <div className="flex items-center gap-2 text-amber-700">
                <Clock3 className="h-4 w-4" />
                <span className="text-xs font-semibold">30일+ 미접속</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">
                {summaryQuery.data?.inactive30dCount ?? 0}
              </p>
            </article>
            <article className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
              <div className="flex items-center gap-2 text-slate-700">
                <Clock3 className="h-4 w-4" />
                <span className="text-xs font-semibold">가장 최근 접속</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                {formatDateTime(summaryQuery.data?.latestLoginAt)}
              </p>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <article className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-slate-800">
                  부서별 {period === "month" ? "월별" : "일별"} 접속 횟수
                </h2>
                <p className="text-xs text-slate-500">
                  그래프 아래 표와 같은 조건으로 집계됩니다.
                </p>
              </div>
              <div className="h-[320px]">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptChart.data}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="periodLabel" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {deptChart.deptNames.map((deptName, idx) => (
                        <Bar
                          key={deptName}
                          dataKey={deptName}
                          fill={["#0ea5e9", "#14b8a6", "#6366f1", "#f59e0b", "#ef4444"][idx % 5]}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-slate-800">사용자별 접속 Top 10</h2>
                <p className="text-xs text-slate-500">선택한 기간 누적 접속 기준입니다.</p>
              </div>
              <div className="h-[320px]">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topUsersChart} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={90} />
                      <Tooltip />
                      <Bar dataKey="loginCount" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {[
                ["dept", "부서별 목록"],
                ["user", "사용자별 목록"],
                ["inactive", "미접속자 목록"],
                ["audit", "상세 로그"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key as LogsTableTab)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === key
                      ? "bg-sky-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "dept" ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">부서</th>
                      <th className="px-3 py-2 text-right font-semibold">총 접속 수</th>
                      <th className="px-3 py-2 text-right font-semibold">활성 사용자 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptTableRows.map((row) => (
                      <tr key={row.deptName} className="border-t border-sky-50">
                        <td className="px-3 py-2">{row.deptName}</td>
                        <td className="px-3 py-2 text-right">{row.loginCount}</td>
                        <td className="px-3 py-2 text-right">{row.uniqueUserCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {activeTab === "user" ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">사용자</th>
                      <th className="px-3 py-2 text-left font-semibold">부서</th>
                      <th className="px-3 py-2 text-right font-semibold">접속 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTableRows.map((row) => (
                      <tr key={`${row.name}-${row.deptName}`} className="border-t border-sky-50">
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.deptName}</td>
                        <td className="px-3 py-2 text-right">{row.loginCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {activeTab === "inactive" ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">사용자</th>
                      <th className="px-3 py-2 text-left font-semibold">부서</th>
                      <th className="px-3 py-2 text-left font-semibold">마지막 접속</th>
                      <th className="px-3 py-2 text-right font-semibold">미접속 일수</th>
                      <th className="px-3 py-2 text-center font-semibold">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(inactiveUsersQuery.data ?? []).map((row) => (
                      <tr key={row.userId} className="border-t border-sky-50">
                        <td className="px-3 py-2">{row.fullName?.trim() || row.username}</td>
                        <td className="px-3 py-2">{row.deptName ?? "-"}</td>
                        <td className="px-3 py-2">{formatDateTime(row.lastLoginAt)}</td>
                        <td className="px-3 py-2 text-right">{row.inactiveDays ?? "-"}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              (row.inactiveDays ?? 0) >= 60
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {statusLabel(row.inactiveDays)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">접속 시각</th>
                      <th className="px-3 py-2 text-left font-semibold">사용자</th>
                      <th className="px-3 py-2 text-left font-semibold">부서</th>
                      <th className="px-3 py-2 text-left font-semibold">이벤트</th>
                      <th className="px-3 py-2 text-left font-semibold">소스</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditRowsQuery.data ?? []).map((row) => (
                      <tr key={row.id} className="border-t border-sky-50">
                        <td className="px-3 py-2">{formatDateTime(row.loggedAt)}</td>
                        <td className="px-3 py-2">{row.fullName?.trim() || row.username}</td>
                        <td className="px-3 py-2">{row.deptName ?? "-"}</td>
                        <td className="px-3 py-2">{row.eventType}</td>
                        <td className="px-3 py-2">{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
