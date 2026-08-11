"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus, Search, UsersRound } from "lucide-react";
import { CtstAppSidebar } from "@/src/components/ctst-app-sidebar";
import { CtstUserProfileMenu } from "@/src/components/ctst-user-profile-menu";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useDashboardSummaryStats,
} from "@/src/hooks/useKpiQueries";
import {
  useAccountAdminBundle,
  useCreateAccount,
  useDeleteAccount,
  useResetAccountPassword,
  useUpdateAccountAssignment,
} from "@/src/hooks/useAccountAdmin";
import {
  approvalNotificationCount,
  approvalNotificationDeptFilter,
  canAccessApprovalsPage,
  isAdminRole,
  roleLabelKo,
} from "@/src/lib/rbac";
import { DEFAULT_RESET_PASSWORD, type AccountAdminRow } from "@/src/lib/account-admin";
import { AccountAssignmentModal } from "@/src/components/account-assignment-modal";

export function AccountsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const profileQuery = useDashboardProfile();
  const profile = profileQuery.data?.profile ?? null;
  const role = profile?.role ?? "";
  const isAdmin = isAdminRole(role);

  const bundleQuery = useAccountAdminBundle(
    profileQuery.isSuccess && profileQuery.data !== null && isAdmin
  );
  const updateMutation = useUpdateAccountAssignment();
  const createMutation = useCreateAccount();
  const deleteMutation = useDeleteAccount();
  const resetPasswordMutation = useResetAccountPassword();

  const featureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null
  );
  const userDeptId = typeof profile?.dept_id === "string" ? profile.dept_id : null;
  const userDeptIds = useMemo(
    () => profile?.dept_ids ?? (userDeptId ? [userDeptId] : []),
    [profile, userDeptId]
  );
  const summaryStatsQuery = useDashboardSummaryStats(
    profileQuery.isSuccess && !!profile && canAccessApprovalsPage(role),
    approvalNotificationDeptFilter(role, userDeptIds)
  );

  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<AccountAdminRow | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("edit");
  const [formOpen, setFormOpen] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (profileQuery.isPending) return;
    if (profileQuery.isError || profileQuery.data == null) {
      router.replace("/login");
    }
  }, [profileQuery.isPending, profileQuery.isError, profileQuery.data, router]);

  const accounts = useMemo(
    () => bundleQuery.data?.accounts ?? [],
    [bundleQuery.data]
  );
  const departments = useMemo(
    () => bundleQuery.data?.departments ?? [],
    [bundleQuery.data]
  );
  const deptNameById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((account) => {
      const haystack = [
        account.fullName ?? "",
        account.username,
        account.roleLabel,
        account.primaryDeptName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [accounts, keyword]);

  async function handleResetPassword(account: AccountAdminRow) {
    const label = account.fullName?.trim() || account.username;
    if (
      !window.confirm(
        `'${label}' 계정의 비밀번호를 초기화할까요?\n초기화 후 비밀번호: ${DEFAULT_RESET_PASSWORD}`
      )
    ) {
      return;
    }
    try {
      setBusyAccountId(account.id);
      await resetPasswordMutation.mutateAsync(account.id);
      window.alert(`비밀번호가 초기화되었습니다.\n새 비밀번호: ${DEFAULT_RESET_PASSWORD}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "비밀번호 초기화 실패");
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleDeleteAccount(account: AccountAdminRow) {
    const label = account.fullName?.trim() || account.username;
    if (
      !window.confirm(
        `'${label}' 계정을 삭제할까요?\n로그인 계정과 프로필이 모두 삭제되며 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }
    try {
      setBusyAccountId(account.id);
      await deleteMutation.mutateAsync(account.id);
      window.alert("계정이 삭제되었습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "계정 삭제 실패");
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
      </div>
    );
  }

  const ctx = profileQuery.data;
  if (!ctx) return null;

  const featureRaw = featureQuery.data ?? { capa: false, voc: false, kpi: false };
  const featureAccess = {
    capa: isAdmin || featureRaw.capa,
    voc: isAdmin || featureRaw.voc,
    kpi: isAdmin || featureRaw.kpi,
  };
  const pendingApprovalCount = approvalNotificationCount(
    role,
    summaryStatsQuery.data?.pendingPrimaryCount ?? 0,
    summaryStatsQuery.data?.pendingFinalCount ?? 0
  );
  const displayName =
    ctx.profile.full_name?.trim() || ctx.profile.username || "사용자";

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
                계정 관리
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                직급·소속 부서·겸직 부서를 조정합니다.
              </p>
            </div>
            <CtstUserProfileMenu
              displayName={displayName}
              roleLabel={roleLabelKo(role)}
              profileUsername={ctx.profile.username}
              userId={ctx.session.user.id}
              notificationsEnabled={featureAccess.kpi}
            />
          </div>
        </header>

        <div className="px-4 py-6 sm:p-8">
          {!isAdmin ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
              계정 관리는 관리자만 이용할 수 있습니다.
            </p>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-sky-50/60 px-4 py-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                  <UsersRound className="h-4 w-4 text-sky-600" aria-hidden />
                  전체 계정 {accounts.length}명
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <input
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="이름·계정 ID·부서 검색"
                      className="h-9 w-64 rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setFormMode("create");
                      setFormOpen(true);
                    }}
                    className="inline-flex h-9 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> 신규 계정
                  </button>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="min-w-[900px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-sky-50/80 text-slate-700">
                      <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                        이름
                      </th>
                      <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                        계정 ID
                      </th>
                      <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                        직급
                      </th>
                      <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                        주 소속 부서
                      </th>
                      <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                        겸직 부서
                      </th>
                      <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                        관리
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundleQuery.isPending ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center">
                          <Loader2
                            className="mx-auto h-6 w-6 animate-spin text-sky-600"
                            aria-hidden
                          />
                        </td>
                      </tr>
                    ) : bundleQuery.isError ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-10 text-center text-sm text-slate-600"
                        >
                          계정 목록을 불러오지 못했습니다.{" "}
                          {bundleQuery.error instanceof Error
                            ? bundleQuery.error.message
                            : ""}
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-10 text-center text-sm text-slate-600"
                        >
                          조건에 맞는 계정이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((account) => (
                        <tr
                          key={account.id}
                          className="border-b border-slate-100 hover:bg-slate-50/70"
                        >
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {account.fullName?.trim() || "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{account.username}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {account.roleLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-800">
                            {account.primaryDeptName ?? (
                              <span className="text-slate-400">미지정</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {account.extraDeptIds.length === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {account.extraDeptIds.map((deptId) => (
                                  <span
                                    key={deptId}
                                    className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200"
                                  >
                                    {deptNameById.get(deptId) ?? "알 수 없음"}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(account);
                                  setFormMode("edit");
                                  setFormOpen(true);
                                }}
                                disabled={busyAccountId === account.id}
                                className="inline-flex h-8 items-center rounded-md bg-sky-600 px-2.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleResetPassword(account)}
                                disabled={busyAccountId === account.id}
                                title={`비밀번호를 ${DEFAULT_RESET_PASSWORD} 로 초기화`}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              >
                                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                                비번 초기화
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteAccount(account)}
                                disabled={
                                  busyAccountId === account.id || account.id === ctx.profile.id
                                }
                                title={
                                  account.id === ctx.profile.id
                                    ? "본인 계정은 삭제할 수 없습니다."
                                    : "계정 삭제"
                                }
                                className="inline-flex h-8 items-center rounded-md border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>

      <AccountAssignmentModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        account={editing}
        mode={formMode}
        departments={departments}
        submitting={updateMutation.isPending || createMutation.isPending}
        onSubmit={async (input) => {
          if (formMode === "create") {
            await createMutation.mutateAsync({
              username: input.username,
              fullName: input.fullName,
              roleLabel: input.roleLabel,
              primaryDeptId: input.primaryDeptId,
              extraDeptIds: input.extraDeptIds,
            });
            window.alert(
              `계정이 생성되었습니다.\n계정 ID: ${input.username.toLowerCase()}\n초기 비밀번호: ${DEFAULT_RESET_PASSWORD}`
            );
            return;
          }
          if (!editing) return;
          await updateMutation.mutateAsync({
            profileId: editing.id,
            roleLabel: input.roleLabel,
            primaryDeptId: input.primaryDeptId,
            extraDeptIds: input.extraDeptIds,
          });
        }}
      />
    </div>
  );
}
