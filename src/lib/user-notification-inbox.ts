import type {
  KpiVocRequest,
  KpiVocStatus,
  MySubmittedPerformanceProgressRow,
} from "@/src/lib/kpi-queries";

const STORAGE_KEY = "ctst-kpi-seen-notifications-v1";

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

export function loadSeenNotificationIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  return safeParseSeen(window.localStorage.getItem(STORAGE_KEY));
}

export function saveSeenNotificationIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

/** 드롭다운을 열어 확인한 시점의 알림 id를 모두 읽음 처리 */
export function mergeSeenNotificationIds(...newIds: string[]) {
  const next = loadSeenNotificationIds();
  for (const id of newIds) next.add(id);
  saveSeenNotificationIds(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(USER_NOTIFICATION_SEEN_EVENT));
  }
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
  const ids = adminPendingVocNotificationIds(vocRequests, adminUserId);
  if (ids.length === 0) return;
  mergeSeenNotificationIds(...ids);
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
        href: "/voc",
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
      href: "/voc",
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

/** 실적함 승인 대기 — 건수가 바뀌면 새 알림으로 다시 표시 */
export function approvalPendingNotificationId(
  pendingPrimaryCount: number,
  pendingFinalCount: number
): string {
  return `approval-pending:${pendingPrimaryCount}:${pendingFinalCount}`;
}

export function buildApprovalPendingNotification(
  pendingCount: number,
  pendingPrimaryCount: number,
  pendingFinalCount: number
): UserNotificationItem | null {
  if (pendingCount <= 0) return null;
  return {
    id: approvalPendingNotificationId(pendingPrimaryCount, pendingFinalCount),
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
