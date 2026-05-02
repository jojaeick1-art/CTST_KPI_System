import type {
  KpiVocRequest,
  MySubmittedPerformanceProgressRow,
} from "@/src/lib/kpi-queries";

const STORAGE_KEY = "ctst-kpi-seen-notifications-v1";

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

  const vocItems: UserNotificationItem[] = [];
  for (const v of args.vocRequests) {
    if (v.createdBy !== uid) continue;
    const { title, subtitle } = vocLabel(v);
    vocItems.push({
      id: vocNotificationId(v),
      kind: "voc",
      title,
      subtitle,
      href: "/voc",
      sortKey: vocSortKey(v),
    });
  }

  /** 반려·회수·승인·대기 → VOC(최신순) 순으로 보기 좋게 */
  const perfSorted = [...perfItems].sort((a, b) => a.sortKey - b.sortKey);
  const vocSorted = [...vocItems].sort((a, b) => a.sortKey - b.sortKey);
  return [...perfSorted, ...vocSorted];
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
