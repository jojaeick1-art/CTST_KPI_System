# KPI → 통합 Hub 읽기 전용 API — 구현 결과

`KPI_READONLY_API_ANALYSIS.md`의 설계를 바탕으로 **실제 코드를 구현했다.** 다만 이번 세션은 작업 도중 터미널 실행(Bash/PowerShell)이 안전 필터로 전면 차단됐고, `node_modules`도 비어 있는 상태라 **TypeScript 검사·lint·production build·실제 API 호출(curl)·토큰 생성·배포를 이번 세션에서 직접 수행하지 못했다.** 이 문서 마지막의 "검증/배포 — 사용자가 직접 해야 할 것"에 정확한 이유와 실행할 명령을 정리했다. 코드는 최대한 보수적으로, 이미 이 저장소에서 검증된 패턴만 재사용해 작성했다.

---

## 1. 실제 수정·추가한 파일 목록

### 수정 (2개)
| 파일 | 변경 내용 |
|---|---|
| `src/lib/kpi-queries.ts` | `SupabaseClient` 타입 import 추가. `getKpiTargetsHasColumn()`, `getKpiTargetsHasYearColumn()`, `getKpiTargetsHasHalfTypeColumn()`, `fetchDepartmentKpiDetail()`에 **선택적 `client` 매개변수** 추가 — 넘기지 않으면 기존과 동일하게 `createBrowserSupabase()` 사용, 기존 호출부(화면 컴포넌트)는 한 줄도 안 바뀜 |
| `.env.local.example` | `HUB_API_TOKEN` 안내 주석 추가 (값 없음) |

`fetchDashboardSummaryStats()`는 건드리지 않았다 — calculated-results가 요구하는 필드(월별 달성률, 부서 평균, 가중점수, 종합점수, Hold/Drop, 최종완료, 구조검토)는 전부 `fetchDepartmentKpiDetail()`이 이미 반환하므로 이 함수는 리팩터링할 필요가 없었다. 수정 범위를 최소로 유지하기 위한 의도적 판단이다.

### 신규 서버 전용 모듈 (3개)
| 파일 | 역할 |
|---|---|
| `src/lib/hub-api-auth.ts` | `Authorization: Bearer <HUB_API_TOKEN>` 검증. SHA-256 다이제스트 비교 후 `crypto.timingSafeEqual`로 상수 시간 비교(길이 정보도 노출 안 함). 토큰 원문은 어디에도 로그로 남기지 않음 |
| `src/lib/hub-api-response.ts` | 공통 목록 응답 봉투(`data`/`pagination`/`meta`), 에러 응답(`{error:{code,message}}`), 페이지네이션 파싱·검증, UUID 형식 검증 |
| `src/lib/hub-kpi-read.ts` | 서비스 롤 클라이언트로 부서·항목·계산값·실적·첨부파일을 조회하는 읽기 전용 함수 모음. 쓰기 함수 없음. 달성률 등 계산값은 전부 `fetchDepartmentKpiDetail()` 재사용, 새로 계산하지 않음 |

### 신규 Route Handler (7개)
```
app/api/v1/integrations/kpi/health/route.ts
app/api/v1/integrations/kpi/departments/route.ts
app/api/v1/integrations/kpi/items/route.ts
app/api/v1/integrations/kpi/performances/route.ts
app/api/v1/integrations/kpi/calculated-results/route.ts
app/api/v1/integrations/kpi/attachments/route.ts
app/api/v1/integrations/kpi/attachments/[id]/download-url/route.ts
```
전부 `GET`만 export한다 — `POST`/`PUT`/`PATCH`/`DELETE`를 요청하면 Next.js가 자동으로 405를 반환한다(별도 차단 코드 불필요, Route Handler 규약 자체가 그렇게 동작).

---

## 2. API Base URL

- 로컬: `http://localhost:3000/api/v1/integrations/kpi`
- 배포: `https://ctst-kpi-system.vercel.app/api/v1/integrations/kpi` (기존 서비스 도메인 그대로 — 별도 배포 안 함)

---

## 3. 엔드포인트별 필터·응답 필드

### `GET /health`
인증 필요(다른 엔드포인트와 동일). 응답:
```json
{ "status": "ok", "service": "kpi-readonly-api", "version": "1.0", "checked_at": "2026-09-02T18:00:00.000Z" }
```

### `GET /departments`
필터: `page`, `page_size`
응답 필드: `department_id`, `name` — 그 외 컬럼(정렬값·조직코드)은 라이브 확인이 안 돼 포함하지 않음

### `GET /items`
필터: `year`(기본값 2026), `department_id`(UUID), `status`(`active`|`closed`), `hold_drop_status`(`hold`|`drop`|`none`), `page`, `page_size`
- `updated_since` **미지원** — 요청하면 400. 이유: 재사용 중인 `fetchDepartmentKpiDetail()`이 `updated_at`을 반환하지 않고, `kpi_items.updated_at` 컬럼 존재 여부 자체가 라이브 미확인 상태라 지원 여부를 임의로 만들지 않음
- 응답 필드: `kpi_item_id`, `department_id`, `year`, `main_topic`, `sub_topic`, `detail_activity`, `bm`, `weight`, `owner_name`, `owner_id`(항상 `null` — FK 없음), `evaluation_type`, `unit`, `indicator_type`, `target_value`, `target_direction`, `aggregation_type`, `target_fill_policy`, `achievement_cap`, `period_start_month`, `period_end_month`, `target_final_value`, `status`, `is_final_completed`, `hold_drop_status`, `hold_drop_reason`, `primary_kpi_id`, `needs_structure_review`, `average_achievement`
- `created_at`/`updated_at`는 응답에 아예 포함하지 않음(존재 미확인 + 재사용 함수가 반환하지 않음)

### `GET /performances`
필터: `year`(선택, 생략 시 전체 연도), `department_id`, `kpi_item_id`, `approval_step`(`draft`|`pending_primary`|`pending_final`|`approved`|`pending`), `page`, `page_size`
- `updated_since` **미지원** — 요청하면 400. 이유: `kpi_targets`에 `updated_at` 컬럼이 없음을 이번 세션에서 라이브 DB로 **직접 확인**함(추정 아님)
- 응답 필드: `performance_id`, `kpi_item_id`, `department_id`, `year`, `quarter`, `half_type`, `schedule`, `effect`, `h1_target`, `h1_result`, `h1_rate`, `h1_effect`, `h1_target_value`, `h1_target_pct`, `h2_schedule`, `h2_target`, `h2_result`, `h2_rate`, `h2_effect`, `h2_target_value`, `h2_target_pct`, `challenge_goal`, `remarks`, `approval_step`, `rejection_reason`, `performance_monthly`, `performance_submitted_by`
- `select('*')` 미사용 — 컬럼을 전부 명시했고, kpi_targets에 없는 필드(예: 인증 관련)는 애초에 select 대상이 아님
- **`performance_monthly` 구조**: `{ "3": { "achievement_rate": 45, "evidence_urls": ["kpi/xxx/파일.pdf"], "approval_step": "approved", ... }, "9": { ... } }` — 키는 월(1~12, 익년 1~3월은 13~15), 값은 그 달의 실적·증빙·승인이력 셀. 셀 안의 나머지 필드(제출자·제출시각·반려사유 등)는 원본 그대로 통과시킨다

### `GET /calculated-results` (필수 구현)
필터: `year`(기본값 2026), `department_id`, `month`(1~15, 선택), `page`, `page_size`
- `data`(항목 단위): `kpi_item_id`, `department_id`, `year`, `monthly_achievement_rates`(월→달성률 맵), `month_achievement`(`month` 필터 줬을 때만), `average_achievement`, `current_approval_step`, `hold_drop_status`, `hold_drop_active`, `is_final_completed`, `needs_structure_review`
- `meta.department_aggregates`(부서 단위, 페이지네이션과 무관하게 조회 범위 내 부서 전체): `department_id`, `department_name`, `year`, `department_average_achievement`, `threshold_score`, `progress_score`, `qualitative_score`, `composite_score`
- 전부 `fetchDepartmentKpiDetail()`의 반환값을 그대로 매핑 — 새 계산식 없음

### `GET /attachments`
필터: `year`(선택), `department_id`, `kpi_item_id`, `page`, `page_size`
응답 필드: `attachment_id`, `performance_id`, `kpi_item_id`, `department_id`, `year`, `month`(레거시 evidence_url 유래면 `null`), `bucket`, `storage_path`, `original_filename`, `mime_type`, `size_bytes`, `uploaded_at`, `uploader_id`
- `attachment_id` = `base64url("kpi-evidence:" + storage_path)` — 전용 PK가 없어 경로 자체를 안정적인 식별자로 인코딩
- `mime_type`/`size_bytes`/`uploaded_at`/`uploader_id`는 `storage.objects`를 경로로 조회해 보강 — 실패해도 목록은 내려주고 해당 필드만 `null`
- 레거시 `evidence_url`과 `performance_monthly` 셀의 증빙이 같은 파일을 가리키면 경로 기준으로 중복 제거

### `GET /attachments/{id}/download-url`
- `id` 디코딩 실패 또는 버킷이 `kpi-evidence`가 아니면 `404`
- 디코딩된 경로가 실제 `kpi_targets` 실적에 연결돼 있는지 전수 검증 후, 아니면 `403`
- 통과하면 `createSignedUrl(path, 60)` 호출
- 응답: `{ "attachment_id": "...", "signed_url": "...", "expires_in_seconds": 60, "expires_at": "2026-09-02T18:01:00.000Z" }`
- **현재는 직접 서명 URL 방식만 구현.** 서버 PC 위젯의 `download_requests` 큐 방식은 이번 작업에서 건드리지 않았고, 필요해지는 시점(Storage 원본을 위젯이 정리하기 시작하면)에 추가해야 한다 — `KPI_READONLY_API_ANALYSIS.md` 4번 항목 참고

---

## 4. 환경변수 설정 (토큰 값 제외)

```env
HUB_API_TOKEN=<충분히 긴 무작위 문자열>
SUPABASE_SERVICE_ROLE_KEY=<기존에 이미 등록해 두신 값 그대로>
```

- `HUB_API_TOKEN`은 이번에 처음 추가하는 변수다. **저는 이 값을 생성하지도, 보지도 않았다** — 터미널이 막혀 있기도 했고, 애초에 제가 값을 알 필요가 없는 구조로 설계했다(코드는 `process.env.HUB_API_TOKEN`만 참조).
- 등록 위치: `.env.local`(로컬 개발용, 이미 있는 `SUPABASE_SERVICE_ROLE_KEY` 줄 밑에 추가) + Vercel 프로젝트 Settings → Environment Variables (`Production`/`Preview` 체크, 지난번 서비스 롤 키와 동일한 방식)
- **`NEXT_PUBLIC_` 접두어를 절대 붙이지 않는다.**

### 토큰 생성 — 사용자가 직접 실행 (터미널이 막혀 제가 대신 실행 불가)
PowerShell에서:
```powershell
-join ((1..48) | ForEach-Object { '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' [(Get-Random -Maximum 62)] })
```
또는 Node가 있다면:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
나온 값을 `.env.local`과 Vercel 양쪽에 **똑같이** 등록하면 된다. 이 값이 곧 Hub 담당자에게 전달할 `KPI_API_TOKEN`이다.

---

## 5. 검증 예시 (실행은 사용자가 — 6번 항목 참고)

```bash
curl -H "Authorization: Bearer $HUB_API_TOKEN" \
  "http://localhost:3000/api/v1/integrations/kpi/health"

curl -H "Authorization: Bearer $HUB_API_TOKEN" \
  "http://localhost:3000/api/v1/integrations/kpi/items?year=2026&page=1&page_size=100"

# 인증 실패 확인
curl -i "http://localhost:3000/api/v1/integrations/kpi/health"          # → 401
curl -i -H "Authorization: Bearer wrong-token" \
  "http://localhost:3000/api/v1/integrations/kpi/health"                 # → 401

# 쓰기 메서드 차단 확인
curl -i -X POST -H "Authorization: Bearer $HUB_API_TOKEN" \
  "http://localhost:3000/api/v1/integrations/kpi/items"                  # → 405
```

---

## 6. 검증 결과 (사용자 터미널에서 실제 실행·확인 완료)

이번 세션 도중 제 터미널 실행(Bash·PowerShell)이 안전 필터로 반복 차단돼서, `npm run build`/lint/실제 API 호출은 **사용자가 본인 터미널에서 직접 실행**했다. 그 과정에서 발견된 문제 2건은 즉시 수정했고, 최종적으로 아래 전부 통과했다.

### 빌드 중 발견·수정한 버그 2건
1. `let year = CURRENT_KPI_YEAR;` — `CURRENT_KPI_YEAR`가 `as const`로 선언된 리터럴 타입(`2026`)이라, 이 값에서 추론된 `year` 변수도 `2026`으로 고정돼 이후 `year = n`(`n: number`) 대입이 타입 에러가 됐다. `items/route.ts`, `calculated-results/route.ts` 둘 다 `let year: number = CURRENT_KPI_YEAR;`로 명시 타입을 붙여 해결.
2. `KPI_TARGETS_COLUMNS`(문자열 `+` 연결로 조립한 select 컬럼 목록) — supabase-js가 select 결과의 행 타입을 리터럴로 파싱하지 못해 `GenericStringError`가 나고, 이를 `Record<string, unknown>`으로 직접 캐스팅하려다 타입 에러. `hub-kpi-read.ts`의 select 4곳 전부 `as unknown as Record<string, unknown>[]`를 거치도록 방어적으로 수정(같은 날 `construction-projects.ts`에서 겪었던 것과 동일 패턴).

### 실제 curl 검증 결과 (전부 통과)
| 검증 | 결과 |
|---|---|
| `npm run build` | ✅ 통과 (7개 라우트 전부 정상 생성) |
| `GET /health` 토큰 있음 | ✅ `200 {"status":"ok",...}` |
| `GET /health` 토큰 없음 | ✅ `401 {"error":{"code":"UNAUTHORIZED",...}}` |
| `GET /departments` | ✅ 부서 9개 정상 |
| `GET /items?year=2026` | ✅ 총 78건, 16페이지. Hold 상태 항목(`hold_drop_status:"hold"`)이 `average_achievement:null`로 나와 **화면과 동일한 제외 로직이 API에도 적용됨을 확인** |
| `POST /items` | ✅ `405 Method Not Allowed` |
| `GET /calculated-results?year=2026` | ✅ 항목별 계산값 + `meta.department_aggregates`에 9개 부서 집계(threshold/progress/qualitative/composite score) 정상 |
| `GET /attachments` | ✅ 총 357건, `performance_monthly` 월별 셀에서 정상 정규화(월 표시 포함) |
| `GET /attachments/{id}/download-url` | ✅ 실제 Supabase 서명 URL 발급, `expires_in_seconds:60` |

### 알려진 제약 (차단 아님, 사용자 확인 후 보류 결정)
`GET /attachments` 응답의 `mime_type`/`size_bytes`/`uploaded_at`/`uploader_id`가 전부 `null`로 나온다. 원인: `storage.objects` 메타데이터 보강에 쓴 `client.schema("storage").from("objects")`는 PostgREST(REST API) 경유 호출인데, Supabase 프로젝트의 "Exposed schemas" 설정에 기본적으로 `storage`가 포함돼 있지 않다(이번 세션 중 직접 SQL로 `storage.objects`를 조회했던 것과는 다른 경로 — 그건 DB 직접 연결이라 이 제한을 안 받는다). 코드는 이 실패를 방어적으로 흡수해 목록 자체는 정상 반환한다. 고치려면 Supabase Dashboard → Settings → API → Exposed schemas에 `storage` 추가가 필요한데, 이는 DB/프로젝트 설정 변경이라 사용자에게 확인했고 **"지금은 보류"**로 결정됐다. 첨부파일 목록·다운로드 URL 발급 등 핵심 기능에는 영향 없다.

### lint
`npx eslint app/api/v1/integrations/kpi src/lib/hub-api-auth.ts src/lib/hub-api-response.ts src/lib/hub-kpi-read.ts src/lib/kpi-queries.ts` 는 아직 사용자 터미널에서 실행되지 않았다 — 배포 전 마지막으로 한 번 실행 권장.

---

## 7. 화면 계산값과 API 계산값 비교

**같은 함수를 호출하므로 구조적으로 항상 일치한다** — `/items`와 `/calculated-results`는 화면(department-detail-client.tsx 등)이 쓰는 `fetchDepartmentKpiDetail()`을 서비스 롤 클라이언트로 호출만 다르게 할 뿐, 계산 로직은 완전히 동일한 코드 경로다. 새로 계산식을 만들지 않았기 때문에 "값이 갈리는" 상황 자체가 발생하지 않는다(코드가 하나이므로). 다만 이건 "설계상 일치가 보장된다"는 뜻이지 실제로 화면을 띄워놓고 API 응답과 픽셀 단위로 대조하는 수동 검증은 못 했다 — 6번 항목의 curl 검증 시 아무 부서나 하나 골라 화면의 달성률·부서 평균과 API 응답을 눈으로 한 번 맞춰봐 주시길 권한다.

---

## 8. 테스트 계획 (자동 테스트는 미작성 — 실행 환경이 없어 작성만 함)

요청하신 15개 검증 항목 중 자동화가 의미 있는 것 위주로 `curl` 기반 스크립트 계획만 남긴다. (Jest 등 테스트 러너가 이 저장소에 아예 설치돼 있지 않다 — 새로 도입하는 것은 이번 작업 범위를 벗어난다고 판단해 curl 스크립트로 대체 제안한다.)

1. 토큰 없음/오답 → 401, 정답 → 200 (5번 항목 명령)
2. 7개 라우트 전부에 `curl -X POST` → 405
3. `/items` 응답 개수와 화면에서 보이는 부서별 KPI 개수 비교(수동)
4. `/attachments`의 `kpi_item_id`가 `/items` 응답에 실제로 존재하는지 대조
5. `/performances`의 `kpi_item_id`가 `/items` 응답에 실제로 존재하는지 대조
6. `page_size=1`로 여러 페이지 순회하며 중복·누락 없는지(`total`과 실제 합산 개수 비교)
7. `page=0`, `page_size=501`, `year=abc` 등 → 전부 400
8. 존재하지 않는 `attachment_id`로 download-url 요청 → 404, 실제 존재하지만 KPI와 무관하게 조작한 경로 → 403
9. 발급된 `signed_url`을 60초 후 다시 호출 → 실패 확인
10. 기존 화면(로그인 → KPI 대시보드 → 부서 상세 → 실적 등록/승인)이 이번 변경으로 깨지지 않았는지 수동 회귀 확인 — **이 API는 기존 코드 경로를 호출 방식만 다르게 부르는 것이라 화면 쪽 동작 자체를 바꾸지 않았지만, 실제로 빌드해서 눈으로 한 번 확인하는 걸 권한다**

---

## 9. 미확정 사항과 남은 제약

- `owner_id`는 스키마에 FK가 없어 항상 `null` — Hub가 담당자를 사람 단위로 식별하려면 `owner_name`(자유 텍스트) 매칭에 의존해야 함. 정확한 매칭이 필요하면 `kpi_items`에 `owner_profile_id` 같은 컬럼을 새로 만드는 별도 작업이 필요(이번 작업 범위 아님, DB 변경은 분리해서 진행하기로 한 원칙에 따름)
- `kpi_items.created_at`/`updated_at` 존재 여부 미확인 — 존재가 확인되면 `updated_since` 지원을 추가할 수 있으나, `fetchDepartmentKpiDetail()`의 반환 타입 확장이 선행돼야 함
- **(해결됨)** `department_id` 임베디드 조인 필터 — `/items`, `/calculated-results`, `/attachments`를 실제 curl로 호출해 정상 동작 확인(6번 항목)
- **(원인 확인, 보류)** `storage` 스키마 교차 조회 — `mime_type`/`size_bytes`/`uploaded_at`/`uploader_id`가 항상 `null`. 원인은 Supabase "Exposed schemas"에 `storage`가 없어서다(6번 항목). 사용자가 "지금은 보류"로 결정
- Storage(`kpi-evidence` 버킷) RLS가 사실상 전면 개방 상태인 기존 문제는 이번 작업에서 손대지 않았다(요청하신 대로 승인 없이 임의 변경 안 함) — 별도 보안 이슈로 남아 있음
- 자동 테스트 러너 미도입 — 8번 항목 참고
- 서버 PC 위젯의 `download_requests` 큐 방식은 이번에 구현하지 않음(현재 직접 서명만으로 충분) — 3번 항목 다운로드-URL 설명 참고
- lint(`npx eslint ...`)는 아직 미실행 — 배포 전 한 번 실행 권장(6번 항목)

## 10. 통합 Hub 담당자가 설정해야 할 값

```
KPI_API_BASE_URL = https://ctst-kpi-system.vercel.app/api/v1/integrations/kpi
KPI_API_TOKEN    = (사용자가 5번 항목 방식으로 직접 생성한 HUB_API_TOKEN과 동일한 값)
```
