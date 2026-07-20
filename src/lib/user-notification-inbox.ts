import type {
  KpiVocRequest,
  KpiVocStatus,
  MySubmittedPerformanceProgressRow,
} from "@/src/lib/kpi-queries";

const SEEN_KEY_PREFIX = "ctst-kpi-seen-notifications-v2:";
const HISTORY_KEY_PREFIX = "ctst-kpi-notification-history-v2:";
const HISTORY_LIMIT = 200;

/** 프로필·사이드바 배지 갱신용 */
export const USER_NOTIFICATION_SEEN_EVENT = "ctst-user-notification-seen";

export type UserNotificationItem = {
  id: string;
  kind: "performance" | "voc";
  title: string;
  subtitle: string;
  href: string;
  /** 정렬·표시용 */
  sortKey: number;
};

export type UserNotificationHistoryEntry = UserNotificationItem & {
  readAt: string;
};

function seenStorageKey(userId: string): string {
  return `${SEEN_KEY_PREFIX}${userId.trim()}`;
}

function historyStorageKey(userId: string): string {
  return `${HISTORY_KEY_PREFIX}${userId.trim()}`;
}

function safeParseSeen(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return new Set();
    return new Set(v.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function safeParseHistory(raw: string | null): UserNotificationHistoryEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (row): row is UserNotificationHistoryEntry =>
        row != null &&
        typeof row === "object" &&
        typeof (row as UserNotificationHistoryEntry).id === "string" &&
        typeof (row as UserNotificationHistoryEntry).title === "string" &&
        typeof (row as UserNotificationHistoryEntry).readAt === "string"
    );
  } catch {
    return [];
  }
}

export function loadSeenNotificationIds(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const uid = userId.trim();
  if (!uid) return new Set();
  return safeParseSeen(window.localStorage.getItem(seenStorageKey(uid)));
}

function saveSeenNotificationIds(userId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  const uid = userId.trim();
  if (!uid) return;
  try {
    window.localStorage.setItem(seenStorageKey(uid), JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

export function loadNotificationHistory(
  userId: string
): UserNotificationHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const uid = userId.trim();
  if (!uid) return [];
  const rows = safeParseHistory(
    window.localStorage.getItem(historyStorageKey(uid))
  );
  return [...rows].sort(
    (a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime()
  );
}

function appendNotificationHistory(
  userId: string,
  items: UserNotificationItem[],
  readAt: string
) {
  if (typeof window === "undefined" || items.length === 0) return;
  const uid = userId.trim();
  if (!uid) return;

  const existing = safeParseHistory(
    window.localStorage.getItem(historyStorageKey(uid))
  );
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const item of items) {
    byId.set(item.id, { ...item, readAt });
  }
  const merged = [...byId.values()].sort(
    (a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime()
  );
  const trimmed = merged.slice(0, HISTORY_LIMIT);
  try {
    window.localStorage.setItem(
      historyStorageKey(uid),
      JSON.stringify(trimmed)
    );
  } catch {
    /* ignore quota */
  }
}

function emitSeenEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(USER_NOTIFICATION_SEEN_EVENT));
  }
}

/** 읽음 처리 + 이력 저장 (사용자별) */
export function markNotificationsAsRead(
  userId: string,
  items: readonly UserNotificationItem[]
) {
  const uid = userId.trim();
  if (!uid || items.length === 0) return;

  const next = loadSeenNotificationIds(uid);
  for (const item of items) next.add(item.id);
  saveSeenNotificationIds(uid, next);
  appendNotificationHistory(uid, [...items], new Date().toISOString());
  emitSeenEvent();
}

/** @deprecated markNotificationsAsRead 사용 */
export function mergeSeenNotificationIds(userId: string, ...newIds: string[]) {
  const uid = userId.trim();
  if (!uid || newIds.length === 0) return;
  const next = loadSeenNotificationIds(uid);
  for (const id of newIds) next.add(id);
  saveSeenNotificationIds(uid, next);
  emitSeenEvent();
}

/** 접수 직후·관리 전 (`submitted` / 레거시 `received`) */
export function isVocPendingReceiptStatus(status: KpiVocStatus): boolean {
  return status === "submitted" || status === "received";
}

function adminVocPendingNotificationId(request: KpiVocRequest): string {
  return `voc-admin-pending:${request.id}`;
}

/** 관리자 — 타인이 접수한 대기 VOC 알림 id */
export function adminPendingVocNotificationIds(
  vocRequests: readonly KpiVocRequest[],
  adminUserId: string
): string[] {
  const uid = adminUserId.trim();
  if (!uid) return [];
  return vocRequests
    .filter(
      (v) =>
        isVocPendingReceiptStatus(v.status) &&
        v.createdBy.trim() !== uid
    )
    .map((v) => adminVocPendingNotificationId(v));
}

export function markAdminPendingVocNotificationsSeen(
  vocRequests: readonly KpiVocRequest[],
  adminUserId: string
): void {
  const uid = adminUserId.trim();
  const ids = adminPendingVocNotificationIds(vocRequests, uid);
  if (ids.length === 0) return;
  mergeSeenNotificationIds(uid, ...ids);
}

export function countAdminUnseenPendingVoc(
  vocRequests: readonly KpiVocRequest[],
  adminUserId: string,
  seen: Set<string>
): number {
  return adminPendingVocNotificationIds(vocRequests, adminUserId).filter(
    (id) => !seen.has(id)
  ).length;
}

const PERF_NOTIFY_RANKS = new Set([0, 1, 2, 3, 6]);

function perfNotificationId(row: MySubmittedPerformanceProgressRow): string {
  return `perf:${row.id}:${row.sortRank}:${row.progressLabel}`;
}

function perfSortKey(row: MySubmittedPerformanceProgressRow): number {
  const r = row.sortRank;
  if (r === 2 || r === 3) return 0;
  if (r === 0 || r === 1) return 1;
  if (r === 6) return 2;
  return 9;
}

function performanceHref(row: MySubmittedPerformanceProgressRow): string {
  const dept = row.deptId?.trim();
  if (!dept) return "/dashboard";
  const month = row.month != null ? String(row.month) : "";
  const q = new URLSearchParams();
  q.set("openKpi", row.kpiItemId);
  if (month) q.set("month", month);
  return `/dashboard/department/${encodeURIComponent(dept)}?${q.toString()}`;
}

function vocHref(request: KpiVocRequest): string {
  const q = new URLSearchParams();
  q.set("vocId", request.id);
  return `/voc?${q.toString()}`;
}

function vocLabel(request: KpiVocRequest): { title: string; subtitle: string } {
  const t = request.title.trim() || "제목 없음";
  switch (request.status) {
    case "submitted":
      return {
        title: "VOC 접수 대기",
        subtitle: `「${t}」`,
      };
    case "received":
      return {
        title: "VOC 접수 완료",
        subtitle: `「${t}」`,
      };
    case "in_progress":
      return {
        title: "VOC 조치 중",
        subtitle: `「${t}」`,
      };
    case "done":
      return {
        title: "VOC 처리 완료",
        subtitle: `「${t}」`,
      };
    case "rejected":
      return {
        title: "VOC 반려·보류",
        subtitle: `「${t}」`,
      };
    default:
      return { title: "VOC 알림", subtitle: `「${t}」` };
  }
}

function vocNotificationId(request: KpiVocRequest): string {
  return `voc:${request.id}:${request.status}`;
}

function vocSortKey(request: KpiVocRequest): number {
  const base = new Date(request.updatedAt || request.createdAt).getTime();
  return -base;
}

/**
 * 실적 진행 + 본인 VOC를 알림 목록으로 합칩니다.
 */
export function buildUserNotifications(args: {
  performanceRows: MySubmittedPerformanceProgressRow[];
  vocRequests: KpiVocRequest[];
  userId: string;
  /** 관리자에게 타인의 신규 VOC 접수 알림 */
  isAdmin?: boolean;
}): UserNotificationItem[] {
  const uid = args.userId.trim();
  const perfItems: UserNotificationItem[] = [];
  for (const row of args.performanceRows) {
    if (!PERF_NOTIFY_RANKS.has(row.sortRank)) continue;
    perfItems.push({
      id: perfNotificationId(row),
      kind: "performance",
      title: row.progressLabel,
      subtitle: [
        row.departmentName,
        row.periodLabel,
        row.kpiMainLabel,
        row.kpiSubLabel,
      ]
        .filter(Boolean)
        .join(" · "),
      href: performanceHref(row),
      sortKey: perfSortKey(row) * 1e15 + row.sortRank,
    });
  }

  const adminVocItems: UserNotificationItem[] = [];
  if (args.isAdmin) {
    for (const v of args.vocRequests) {
      if (!isVocPendingReceiptStatus(v.status)) continue;
      if (v.createdBy.trim() === uid) continue;
      const t = v.title.trim() || "제목 없음";
      const dept = v.deptName?.trim() || "—";
      const name =
        v.createdByName?.trim() && v.createdByName.trim() !== "-"
          ? v.createdByName.trim()
          : "—";
      adminVocItems.push({
        id: adminVocPendingNotificationId(v),
        kind: "voc",
        title: "새 VOC 접수",
        subtitle: `「${t}」 · ${dept} · ${name}`,
        href: vocHref(v),
        sortKey: vocSortKey(v) - 1e12,
      });
    }
  }

  const ownVocItems: UserNotificationItem[] = [];
  for (const v of args.vocRequests) {
    if (v.createdBy !== uid) continue;
    const { title, subtitle } = vocLabel(v);
    ownVocItems.push({
      id: vocNotificationId(v),
      kind: "voc",
      title,
      subtitle,
      href: vocHref(v),
      sortKey: vocSortKey(v),
    });
  }

  /** 반려·회수·승인·대기 → 관리자 VOC(최신) → 본인 VOC(최신) */
  const perfSorted = [...perfItems].sort((a, b) => a.sortKey - b.sortKey);
  const adminVocSorted = [...adminVocItems].sort((a, b) => a.sortKey - b.sortKey);
  const ownVocSorted = [...ownVocItems].sort((a, b) => a.sortKey - b.sortKey);
  return [...perfSorted, ...adminVocSorted, ...ownVocSorted];
}

export function countUnseenNotifications(
  items: UserNotificationItem[],
  seen: Set<string>
): number {
  let n = 0;
  for (const it of items) {
    if (!seen.has(it.id)) n += 1;
  }
  return n;
}

/** 사용자별 고정 ID — 읽으면 건수가 바뀌어도 다시 표시하지 않음 */
export function approvalPendingNotificationId(userId: string): string {
  return `approval-pending:${userId.trim()}`;
}

export function buildApprovalPendingNotification(
  userId: string,
  pendingCount: number
): UserNotificationItem | null {
  if (pendingCount <= 0) return null;
  const uid = userId.trim();
  if (!uid) return null;
  return {
    id: approvalPendingNotificationId(uid),
    kind: "performance",
    title: "실적 승인 대기",
    subtitle:
      pendingCount === 1
        ? "승인이 필요한 실적이 1건 있습니다."
        : `승인이 필요한 실적이 ${pendingCount}건 있습니다.`,
    href: "/dashboard/approvals",
    sortKey: -2e15,
  };
}

/** 읽음 처리된 알림은 목록·배지에서 제외 */
export function filterUnseenNotifications(
  items: UserNotificationItem[],
  seen: Set<string>
): UserNotificationItem[] {
  return items.filter((it) => !seen.has(it.id));
}

export function formatNotificationReadAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
