import { requireHubApiToken } from "@/src/lib/hub-api-auth";
import {
  HUB_INTERNAL_ERROR,
  HUB_SERVER_MISCONFIGURED,
  HUB_UNAUTHORIZED,
  badRequest,
  listResponse,
  paginateArray,
  parsePagination,
} from "@/src/lib/hub-api-response";
import { fetchHubDepartments, getHubServiceClient } from "@/src/lib/hub-kpi-read";

export const dynamic = "force-dynamic";

/** 최소 필드: department_id, name. 그 외 컬럼은 라이브 확인이 안 돼 포함하지 않는다. */
export async function GET(request: Request) {
  const auth = requireHubApiToken(request);
  if (!auth.ok) {
    return auth.status === 500 ? HUB_SERVER_MISCONFIGURED() : HUB_UNAUTHORIZED();
  }

  const searchParams = new URL(request.url).searchParams;
  const pagination = parsePagination(searchParams);
  if ("error" in pagination) return badRequest(pagination.error);

  try {
    const client = getHubServiceClient();
    const departments = await fetchHubDepartments(client);
    const { pageItems, total, totalPages } = paginateArray(
      departments,
      pagination.page,
      pagination.pageSize
    );
    return listResponse(pageItems, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      filters: {},
    });
  } catch (error) {
    console.error(
      "[hub-api] departments 조회 실패",
      error instanceof Error ? error.message : error
    );
    return HUB_INTERNAL_ERROR();
  }
}
