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
import { fetchHubAttachments, getHubServiceClient } from "@/src/lib/hub-kpi-read";

export const dynamic = "force-dynamic";

/**
 * kpi_targets.evidence_url(레거시) + performance_monthly 셀별 증빙을 정규화한 목록.
 * 동일 파일이 레거시·월별 필드에 동시에 있으면 경로 기준으로 중복 제거한다
 * (`hub-kpi-read.ts`의 `extractEvidenceEntries` 참고).
 *
 * mime_type/size_bytes/uploaded_at/uploader_id 는 kpi_targets 에 저장되지 않아
 * `storage.objects` 메타데이터를 경로로 조회해 보강한다 — 조회에 실패해도
 * 목록 자체는 내려주고 해당 필드만 null 로 채운다.
 */
export async function GET(request: Request) {
  const auth = requireHubApiToken(request);
  if (!auth.ok) {
    return auth.status === 500 ? HUB_SERVER_MISCONFIGURED() : HUB_UNAUTHORIZED();
  }

  const searchParams = new URL(request.url).searchParams;

  const pagination = parsePagination(searchParams);
  if ("error" in pagination) return badRequest(pagination.error);

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

  try {
    const client = getHubServiceClient();
    const attachments = await fetchHubAttachments(client, {
      year,
      departmentId,
      kpiItemId,
    });

    const { pageItems, total, totalPages } = paginateArray(
      attachments,
      pagination.page,
      pagination.pageSize
    );

    return listResponse(pageItems, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
      filters: {
        year: year ?? null,
        department_id: departmentId ?? null,
        kpi_item_id: kpiItemId ?? null,
      },
    });
  } catch (error) {
    console.error(
      "[hub-api] attachments 조회 실패",
      error instanceof Error ? error.message : error
    );
    return HUB_INTERNAL_ERROR();
  }
}
