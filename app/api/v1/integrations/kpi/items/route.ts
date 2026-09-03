import { requireHubApiToken } from "@/src/lib/hub-api-auth";
import {
  HUB_INTERNAL_ERROR,
  HUB_SERVER_MISCONFIGURED,
  HUB_UNAUTHORIZED,
  badRequest,
  isPlausibleUuid,
  listResponse,
  paginateArray,
  parsePagination,
} from "@/src/lib/hub-api-response";
import {
  CURRENT_KPI_YEAR,
  fetchHubDepartmentBundles,
  getHubServiceClient,
  toHubKpiItem,
} from "@/src/lib/hub-kpi-read";

export const dynamic = "force-dynamic";

const VALID_STATUS = ["active", "closed"] as const;
const VALID_HOLD_DROP = ["hold", "drop", "none"] as const;

/**
 * KPI 항목 + 화면과 동일한 계산값(`average_achievement` 등).
 * `department_id`가 없으면 전체 부서를 순회해서 모은다.
 *
 * `updated_since` 는 아직 지원하지 않는다: 이 응답이 재사용하는
 * `fetchDepartmentKpiDetail()`(kpi-queries.ts) 의 반환 타입에 updated_at 이 없고,
 * kpi_items.updated_at 컬럼 실존 여부도 라이브로 확인되지 않았다. 지원하려면
 * 해당 함수의 select·반환 타입을 먼저 확장해야 한다 — 구현 보고서 "미확정 사항" 참고.
 */
export async function GET(request: Request) {
  const auth = requireHubApiToken(request);
  if (!auth.ok) {
    return auth.status === 500 ? HUB_SERVER_MISCONFIGURED() : HUB_UNAUTHORIZED();
  }

  const searchParams = new URL(request.url).searchParams;

  const pagination = parsePagination(searchParams);
  if ("error" in pagination) return badRequest(pagination.error);

  if (searchParams.get("updated_since") !== null) {
    return badRequest(
      "updated_since is not supported on this endpoint yet (kpi_items.updated_at is not confirmed to exist)."
    );
  }

  let year: number = CURRENT_KPI_YEAR;
  const yearRaw = searchParams.get("year");
  if (yearRaw !== null) {
    const n = Number(yearRaw);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) {
      return badRequest("year must be a 4-digit integer.");
    }
    year = n;
  }

  const departmentId = searchParams.get("department_id");
  if (departmentId !== null && !isPlausibleUuid(departmentId)) {
    return badRequest("department_id must be a valid UUID.");
  }

  const statusFilter = searchParams.get("status");
  if (
    statusFilter !== null &&
    !VALID_STATUS.includes(statusFilter as (typeof VALID_STATUS)[number])
  ) {
    return badRequest(`status must be one of: ${VALID_STATUS.join(", ")}.`);
  }

  const holdDropFilter = searchParams.get("hold_drop_status");
  if (
    holdDropFilter !== null &&
    !VALID_HOLD_DROP.includes(holdDropFilter as (typeof VALID_HOLD_DROP)[number])
  ) {
    return badRequest(`hold_drop_status must be one of: ${VALID_HOLD_DROP.join(", ")}.`);
  }

  try {
    const client = getHubServiceClient();
    const bundles = await fetchHubDepartmentBundles(client, {
      year,
      departmentId: departmentId ?? undefined,
    });

    let items = bundles.flatMap((bundle) =>
      bundle.items.map((item) =>
        toHubKpiItem(bundle.department.department_id, year, item)
      )
    );

    if (statusFilter) {
      items = items.filter((item) => item.status === statusFilter);
    }
    if (holdDropFilter) {
      items = items.filter((item) =>
        holdDropFilter === "none"
          ? item.hold_drop_status === null
          : item.hold_drop_status === holdDropFilter
      );
    }

    const { pageItems, total, totalPages } = paginateArray(
      items,
      pagination.page,
      pagination.pageSize
    );

    return listResponse(pageItems, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      filters: {
        year,
        department_id: departmentId ?? null,
        status: statusFilter ?? null,
        hold_drop_status: holdDropFilter ?? null,
      },
    });
  } catch (error) {
    console.error(
      "[hub-api] items 조회 실패",
      error instanceof Error ? error.message : error
    );
    return HUB_INTERNAL_ERROR();
  }
}
