/**
 * 반려함·회수함 사이드바 배지용 — 상세를 연 행 ID를 localStorage에 저장해
 * 미확인(미조회) 건만 카운트한다.
 */
export const KPI_INBOX_SEEN_EVENT = "ctst-kpi-inbox-seen";

export type InboxSeenBucket = "rejected" | "withdrawn";

function storageKey(uid: string, bucket: InboxSeenBucket): string {
  return `ctst-kpi-inbox-seen:v1:${uid}:${bucket}`;
}

export function readSeenInboxRowIds(
  uid: string,
  bucket: InboxSeenBucket
): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(uid, bucket));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

/** 실적 상세(모달)를 열었을 때 호출 — 해당 행을 읽음 처리 */
export function markInboxRowSeen(
  uid: string,
  bucket: InboxSeenBucket,
  rowId: string
): void {
  if (typeof window === "undefined") return;
  const s = readSeenInboxRowIds(uid, bucket);
  if (s.has(rowId)) return;
  s.add(rowId);
  localStorage.setItem(storageKey(uid, bucket), JSON.stringify([...s]));
  window.dispatchEvent(new Event(KPI_INBOX_SEEN_EVENT));
}

export function countUnreadInboxRows(
  rows: readonly { id: string }[],
  uid: string | undefined,
  bucket: InboxSeenBucket
): number {
  if (!uid?.trim()) return 0;
  const seen = readSeenInboxRowIds(uid.trim(), bucket);
  return rows.filter((r) => !seen.has(r.id)).length;
}
