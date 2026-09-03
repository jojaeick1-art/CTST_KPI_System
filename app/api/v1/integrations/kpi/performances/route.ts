import { requireHubApiToken } from "@/src/lib/hub-api-auth";
import {
  HUB_INTERNAL_ERROR,
  HUB_SERVER_MISCONFIGURED,
  HUB_UNAUTHORIZED,
  badRequest,
  isPlausibleUuid,
  listResponse,
  parsePagination,
} from "@/src/lib/hub-api-response";
import {
  fetchHubPerformancesPage,
  getHubServiceClient,
  isHubApprovalStep,
} from "@/src/lib/hub-kpi-read";

export const dynamic = "force-dynamic";

/**
 * kpi_targets 원본 필드 그대로(달성률 등 계산값은 여기서 만들지 않는다 —
 * `calculated-results` 참고). year 는 필수가 아니다: 생략하면 전체 연도를 반환한다.
 *
 * `updated_since` 는 지원하지 않는다 — kpi_targets 에 updated_at 컬럼이
 * 없음을 이번 세션에서 라이브 DB로 직접 확인했다(추정 아님).
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
      "updated_since is not supported: kpi_targets has no updated_at column."
    );
  }

  let year: number | undefined;
  const yearRaw = searchParams.get("year");
  if (yearRaw !== null) {
    const n = Number(yearRaw);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) {
      return badRequest("year must be a 4-digit integer.");
    }
    year = n;
  }

  const departmentId = searchParams.get("department_id") ?? undefined;
  if (departmentId !== undefined && !isPlausibleUuid(departmentId)) {
    return badRequest("department_id must be a valid UUID.");
  }

  const kpiItemId = searchParams.get("kpi_item_id") ?? undefined;
  if (kpiItemId !== undefined && !isPlausibleUuid(kpiItemId)) {
    return badRequest("kpi_item_id must be a valid UUID.");
  }

  const approvalStepRaw = searchParams.get("approval_step");
  let approvalStep: Parameters<typeof fetchHubPerformancesPage>[1]["approvalStep"];
  if (approvalStepRaw !== null) {
    if (!isHubApprovalStep(approvalStepRaw)) {
      return badRequest(
        "approval_step must be one of: draft, pending_primary, pending_final, approved, pending."
      );
    }
    approvalStep = approvalStepRaw;
  }

  try {
    const client = getHubServiceClient();
    const from = (pagination.page - 1) * pagination.pageSize;
    const to = from + pagination.pageSize - 1;

    const { rows, total } = await fetchHubPerformancesPage(
      client,
      {
        year,
        departmentId,
        kpiItemId,
        approvalStep,
      },
      { from, to }
    );

    const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.pageSize);

    return listResponse(rows, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      filters: {
        year: year ?? null,
        department_id: departmentId ?? null,
        kpi_item_id: kpiItemId ?? null,
        approval_step: approvalStepRaw ?? null,
      },
    });
  } catch (error) {
    console.error(
      "[hub-api] performances 조회 실패",
      error instanceof Error ? error.message : error
    );
    return HUB_INTERNAL_ERROR();
  }
}
