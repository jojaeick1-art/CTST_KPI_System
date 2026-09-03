import { NextResponse } from "next/server";

/**
 * `/api/v1/integrations/kpi/*` 공통 응답 형식.
 * 목록 응답은 항상 `{ data, pagination, meta }` 봉투를 쓴다.
 */

export const HUB_API_TIMEZONE = "Asia/Seoul";
export const HUB_API_DEFAULT_PAGE_SIZE = 100;
export const HUB_API_MAX_PAGE_SIZE = 500;

export type HubPagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type HubListMeta = {
  source: "kpi";
  timezone: typeof HUB_API_TIMEZONE;
  fetched_at: string;
  filters: Record<string, unknown>;
  [extra: string]: unknown;
};

export type HubListResponse<T> = {
  data: T[];
  pagination: HubPagination;
  meta: HubListMeta;
};

export function errorJson(
  status: number,
  code: string,
  message: string
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const HUB_UNAUTHORIZED = () =>
  errorJson(401, "UNAUTHORIZED", "Valid Hub API credentials are required.");

export const HUB_SERVER_MISCONFIGURED = () =>
  errorJson(500, "INTERNAL_ERROR", "The service is temporarily unavailable.");

export const HUB_INTERNAL_ERROR = () =>
  errorJson(500, "INTERNAL_ERROR", "The service is temporarily unavailable.");

export const HUB_NOT_FOUND = (message = "Resource not found.") =>
  errorJson(404, "NOT_FOUND", message);

export const HUB_FORBIDDEN = (message = "Access to this resource is not allowed.") =>
  errorJson(403, "FORBIDDEN", message);

export function badRequest(message: string): NextResponse {
  return errorJson(400, "BAD_REQUEST", message);
}

export type ParsedPagination = { page: number; pageSize: number };

/** `page`/`page_size` 쿼리 파라미터 검증. 문제가 있으면 에러 메시지 문자열을 반환한다. */
export function parsePagination(
  searchParams: URLSearchParams
): ParsedPagination | { error: string } {
  let page = 1;
  let pageSize = HUB_API_DEFAULT_PAGE_SIZE;

  const pageRaw = searchParams.get("page");
  if (pageRaw !== null) {
    const n = Number(pageRaw);
    if (!Number.isInteger(n) || n < 1) {
      return { error: "page must be a positive integer." };
    }
    page = n;
  }

  const pageSizeRaw = searchParams.get("page_size");
  if (pageSizeRaw !== null) {
    const n = Number(pageSizeRaw);
    if (!Number.isInteger(n) || n < 1 || n > HUB_API_MAX_PAGE_SIZE) {
      return {
        error: `page_size must be an integer between 1 and ${HUB_API_MAX_PAGE_SIZE}.`,
      };
    }
    pageSize = n;
  }

  return { page, pageSize };
}

/** 이미 전체를 메모리에 올린 배열을 요청한 page/page_size 로 자른다. */
export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number
): { pageItems: T[]; total: number; totalPages: number } {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { pageItems, total, totalPages };
}

export function listResponse<T>(
  pageItems: T[],
  opts: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    filters: Record<string, unknown>;
    /** 목록 페이지네이션과 별개로 meta에 얹을 부가 정보 (예: 부서별 집계값) */
    extraMeta?: Record<string, unknown>;
  }
): NextResponse<HubListResponse<T>> {
  return NextResponse.json({
    data: pageItems,
    pagination: {
      page: opts.page,
      page_size: opts.pageSize,
      total: opts.total,
      total_pages: opts.totalPages,
    },
    meta: {
      source: "kpi",
      timezone: HUB_API_TIMEZONE,
      fetched_at: new Date().toISOString(),
      filters: opts.filters,
      ...(opts.extraMeta ?? {}),
    },
  });
}

/** UUID(v1~v5, nil 포함 느슨한 형태) 형식 검증 — Supabase uuid 컬럼 필터용 */
export function isPlausibleUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}
