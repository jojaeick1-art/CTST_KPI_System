"use client";

import { ChangePasswordModal } from "@/app/dashboard/change-password-modal";
import { NotificationHistoryModal } from "@/src/components/notification-history-modal";
import {
  buildApprovalPendingNotification,
  buildUserNotifications,
  countUnseenNotifications,
  filterUnseenNotifications,
  loadSeenNotificationIds,
  markNotificationsAsRead,
  USER_NOTIFICATION_SEEN_EVENT,
  type UserNotificationItem,
} from "@/src/lib/user-notification-inbox";
import {
  useDashboardProfile,
  useDashboardSummaryStats,
  useKpiVocRequests,
  useMySubmittedPerformanceProgress,
} from "@/src/hooks/useKpiQueries";
import {
  approvalNotificationCount,
  approvalNotificationDeptFilter,
  canAccessApprovalsPage,
  isAdminRole,
} from "@/src/lib/rbac";
import { Bell, ChevronDown, KeyRound, Loader2, Shield, User } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type CtstUserProfileMenuProps = {
  displayName: string;
  roleLabel: string;
  profileUsername: string;
  userId: string;
  /** KPI 잠금 등에서 알림 조회를 끕니다. 비밀번호 메뉴는 유지됩니다. */
  notificationsEnabled?: boolean;
};

export function CtstUserProfileMenu({
  displayName,
  roleLabel,
  profileUsername,
  userId,
  notificationsEnabled = true,
}: CtstUserProfileMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [seenVersion, setSeenVersion] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const profileQuery = useDashboardProfile();
  const role = profileQuery.data?.profile.role;
  const isAdmin = isAdminRole(role);
  const userDeptIds = useMemo(() => {
    const p = profileQuery.data?.profile;
    if (!p) return [];
    return p.dept_ids ?? (typeof p.dept_id === "string" ? [p.dept_id] : []);
  }, [profileQuery.data?.profile]);

  const canSeeApprovals =
    role !== undefined && canAccessApprovalsPage(role);
  const approvalStatsQuery = useDashboardSummaryStats(
    notificationsEnabled && !!userId && canSeeApprovals,
    approvalNotificationDeptFilter(role, userDeptIds)
  );
  const pendingApprovalCount = approvalNotificationCount(
    role,
    approvalStatsQuery.data?.pendingPrimaryCount ?? 0,
    approvalStatsQuery.data?.pendingFinalCount ?? 0
  );

  const progressQuery = useMySubmittedPerformanceProgress(
    notificationsEnabled && !!userId
  );
  const vocQuery = useKpiVocRequests(notificationsEnabled && !!userId);

  const notifications = useMemo((): UserNotificationItem[] => {
    if (!notificationsEnabled || !userId) return [];
    const rows = progressQuery.data ?? [];
    const voc = vocQuery.data ?? [];
    const base = buildUserNotifications({
      performanceRows: rows,
      vocRequests: voc,
      userId,
      isAdmin,
    });
    const approvalItem = buildApprovalPendingNotification(
      userId,
      pendingApprovalCount
    );
    return approvalItem ? [approvalItem, ...base] : base;
  }, [
    notificationsEnabled,
    userId,
    isAdmin,
    progressQuery.data,
    vocQuery.data,
    pendingApprovalCount,
    approvalStatsQuery.data?.pendingPrimaryCount,
    approvalStatsQuery.data?.pendingFinalCount,
  ]);

  const seenSet = useMemo(() => {
    if (!userId) return new Set<string>();
    return loadSeenNotificationIds(userId);
  }, [userId, notifications, seenVersion]);

  const unreadNotifications = useMemo(
    () => filterUnseenNotifications(notifications, seenSet),
    [notifications, seenSet]
  );

  const unseenCount = useMemo(
    () => countUnseenNotifications(notifications, seenSet),
    [notifications, seenSet]
  );

  const markAllNotificationsRead = useCallback(() => {
    if (!userId || unreadNotifications.length === 0) return;
    markNotificationsAsRead(userId, unreadNotifications);
    setSeenVersion((v) => v + 1);
  }, [userId, unreadNotifications]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node)) return;
      if (!el.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    const onSeen = () => setSeenVersion((v) => v + 1);
    window.addEventListener(USER_NOTIFICATION_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(USER_NOTIFICATION_SEEN_EVENT, onSeen);
  }, []);

  const loading =
    notificationsEnabled &&
    (progressQuery.isPending ||
      vocQuery.isPending ||
      (canSeeApprovals && approvalStatsQuery.isPending));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="relative flex items-center gap-3 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-left shadow-sm shadow-sky-100/50 transition hover:border-sky-300 hover:bg-sky-50/40"
        aria-expanded={menuOpen}
        aria-haspopup="true"
      >
        {unseenCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white"
            aria-label={`확인하지 않은 알림 ${unseenCount}건`}
          >
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        ) : null}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <User className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">
            <span className="sr-only">접속자 </span>
            {displayName}
            <span className="font-normal text-slate-400"> 님</span>
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden />
            <span className="truncate text-xs font-medium text-sky-700">
              {roleLabel}
            </span>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            menuOpen ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {menuOpen ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(100vw-24px,320px)] origin-top overflow-hidden rounded-xl border border-sky-200 bg-white shadow-lg shadow-slate-200/60"
          role="menu"
        >
        <div className="border-b border-slate-100 p-1">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-sky-800 transition hover:bg-sky-50"
            onClick={() => {
              setMenuOpen(false);
              setPwOpen(true);
            }}
          >
            <KeyRound className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
            비밀번호 변경
          </button>
        </div>

        <div className="max-h-[min(60vh,360px)] overflow-y-auto p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Bell className="h-3.5 w-3.5" aria-hidden />
              알림
            </span>
            <div className="flex items-center gap-1.5">
              {unseenCount > 0 ? (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unseenCount > 99 ? "99+" : unseenCount}
                </span>
              ) : null}
              {unreadNotifications.length > 0 ? (
                <button
                  type="button"
                  className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-sky-700 transition hover:bg-sky-50"
                  onClick={markAllNotificationsRead}
                >
                  모두 읽음
                </button>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
            </div>
          ) : unreadNotifications.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-slate-500">
              새 알림이 없습니다.
            </p>
          ) : (
            <ul className="space-y-1">
              {unreadNotifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      role="menuitem"
                      className="block rounded-lg border border-red-100/80 bg-red-50/70 px-2 py-2 transition hover:border-red-200 hover:bg-red-50"
                      onClick={() => {
                        if (userId) {
                          markNotificationsAsRead(userId, [n]);
                          setSeenVersion((v) => v + 1);
                        }
                        setMenuOpen(false);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-400"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800">
                            {n.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
                            {n.subtitle}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {n.kind === "performance" ? "실적" : "VOC"}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 p-2">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50"
            onClick={() => {
              setMenuOpen(false);
              setHistoryOpen(true);
            }}
          >
            알람 이력 보기
          </button>
        </div>
        </div>
      ) : null}

      <ChangePasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        profileUsername={profileUsername}
      />

      <NotificationHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        userId={userId}
        refreshKey={seenVersion}
      />
    </div>
  );
}
