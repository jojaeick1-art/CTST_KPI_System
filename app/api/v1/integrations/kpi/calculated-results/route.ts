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
  toHubCalculatedResult,
  type HubDepartmentAggregate,
} from "@/src/lib/hub-kpi-read";

export const dynamic = "force-dynamic";

/**
 * 기존 화면과 동일한 계산값. 새 계산 로직을 만들지 않고
 * `fetchDepartmentKpiDetail()`(kpi-queries.ts) 결과를 그대로 매핑한다.
 *
 * `data`는 KPI 항목 단위 계산값(월별 달성률 등), 부서 단위 집계값
 * (부서 평균·가중점수·종합점수)은 항목 목록과 페이지네이션 단위가 달라
 * `meta.department_aggregates`에 별도로 담는다.
 */
export async function GET(request: Request) {
  const auth = requireHubApiToken(request);
  if (!auth.ok) {
    return auth.status === 500 ? HUB_SERVER_MISCONFIGURED() : HUB_UNAUTHORIZED();
  }

  const searchParams = new URL(request.url).searchParams;

  const pagination = parsePagination(searchParams);
  if ("error" in pagination) return badRequest(pagination.error);

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

  let month: number | null = null;
  const monthRaw = searchParams.get("month");
  if (monthRaw !== null) {
    const n = Number(monthRaw);
    if (!Number.isInteger(n) || n < 1 || n > 15) {
      return badRequest("month must be an integer between 1 and 15.");
    }
    month = n;
  }

  try {
    const client = getHubServiceClient();
    const bundles = await fetchHubDepartmentBundles(client, {
      year,
      departmentId: departmentId ?? undefined,
    });

    const items = bundles.flatMap((bundle) =>
      bundle.items.map((item) =>
        toHubCalculatedResult(bundle.department.department_id, year, item, month)
      )
    );

    const departmentAggregates: HubDepartmentAggregate[] = bundles.map((bundle) => ({
      department_id: bundle.department.department_id,
      department_name: bundle.department.name,
      year,
      department_average_achievement: bundle.aggregates.department_average_achievement,
      threshold_score: bundle.aggregates.threshold_score,
      progress_score: bundle.aggregates.progress_score,
      qualitative_score: bundle.aggregates.qualitative_score,
      composite_score: bundle.aggregates.composite_score,
    }));

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
        month,
      },
      extraMeta: { department_aggregates: departmentAggregates },
    });
  } catch (error) {
    console.error(
      "[hub-api] calculated-results 조회 실패",
      error instanceof Error ? error.message : error
    );
    return HUB_INTERNAL_ERROR();
  }
}
