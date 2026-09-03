# KPI Hub 연동용 읽기 전용 API — 코드 분석 및 설계안

`KPI_READONLY_API_REQUEST_PROMPT.md` 요청에 대한 응답. 코드는 수정하지 않았으며, 아래 내용은 저장소의 실제 코드(`src/lib/kpi-queries.ts`, `supabase/migrations/*.sql`, 이번 세션에서 직접 조회한 라이브 DB 스키마)를 근거로 작성했다. 확인되지 않은 부분은 "확인 필요"로 표시했다.

---

## 0. 핵심 요약 (먼저 읽을 것)

1. **테이블은 대부분 마이그레이션 이력 밖에서 생성됨.** `kpi_items`, `kpi_targets`, `departments`, `profiles`는 최초 생성이 Supabase Studio에서 이뤄졌고(`supabase/schema-kpi.sql`이 주석 처리된 참고용 문서로만 남아 있음), 이후 컬럼 추가만 마이그레이션으로 관리된다. 그래서 "전체 DDL"은 마이그레이션만 봐서는 알 수 없고, 라이브 DB 조회 또는 앱 코드의 실제 select 목록으로 역추적해야 한다. 아래 컬럼 목록은 라이브 DB 조회(`kpi_targets`)와 앱 코드의 필드 접근 패턴(`kpi_items`)을 근거로 한다.
2. **계산값은 전부 프런트엔드(TypeScript, 브라우저 전용)에서 만들어진다.** DB에 View나 계산용 RPC가 없다. `src/lib/kpi-queries.ts` 안의 순수 함수들이 `kpi_items` + `kpi_targets` + `kpi_milestones`를 조인해 온 뒤 JS로 달성률·부서 평균·가중 점수를 계산한다. 이 파일의 fetch 함수들은 `createBrowserSupabase()`(브라우저 전용 클라이언트)에 의존하므로 **서버 Route Handler에서 그대로 호출할 수 없다** — 최소 리팩터링이 필요하다(6번 항목 참고).
3. **"첨부파일 메타데이터" 전용 테이블이 없다.** 첨부파일 경로는 `kpi_targets.evidence_url`/`evidence_urls`(text[])/`evidence_original_filenames`(text[]) 컬럼과, 월별 실적을 담는 `kpi_targets.performance_monthly`(jsonb) 안의 셀별 배열에 나뉘어 저장된다. MIME 타입·파일 크기·업로드 시각·활성 상태 컬럼은 **존재하지 않는다.** 이 정보는 Supabase Storage `storage.objects` 메타데이터(경로로 join)에서 가져와야 한다 — 4번 항목 참고.
4. **`담당자 ID`가 없다.** `kpi_items`의 담당자는 `manager_name`(자유 텍스트 이름)이며 `profiles.id`를 참조하는 FK가 아니다. 반면 실적 제출자(`kpi_targets.performance_submitted_by`)는 실제 `profiles.id` FK다. 스펙이 요구하는 "담당자 ID"는 현재 데이터 모델에 없는 개념이라, 이름 문자열로 제공하거나 신규 컬럼 설계가 필요하다.
5. **다운로드는 이미 2단계 구조로 되어 있다.** ① 짧은 만료(60초) 직접 서명 URL 시도 → ② 실패 시 `download_requests` 큐에 넣고 서버 PC의 별도 Electron 위젯이 Realtime으로 받아 처리(600초 서명 URL). Hub API도 이 두 단계를 그대로 재사용해야 한다. 하나만 구현하면 향후 Storage 원본이 정리될 때 조용히 깨질 수 있다.
6. **profiles RLS는 이번 세션에 이미 적용 완료**(관리자만 쓰기). `kpi_items`/`kpi_targets`는 조회는 로그인 사용자 전체 허용, 쓰기는 관리자 또는 담당 부서로 제한. **Storage(`kpi-evidence` 버킷)는 RLS가 사실상 전면 개방**(`Allow All Access`, qual=`true`) — Hub API 설계와 별개로 이미 존재하는 노출이며, 서명 URL 발급 로직 자체가 이 노출을 늘리지도 줄이지도 않는다는 점은 유의해야 한다.

---

## 1. 제공 가능한 데이터 목록

| 구분 | 제공 가능 | 비고 |
|---|---|---|
| 부서 목록 (id, name) | ✅ | `departments` 테이블 그대로 |
| 사용자/담당자(프로필) | ✅ (일부 제한) | id·username·full_name·role·주 소속 dept_id는 가능. `activeness`(활성 상태) 컬럼은 미확인 — 계정 삭제 시 로그인 계정 자체가 사라지므로 "비활성 계정" 개념이 별도로 없음 |
| KPI 항목 전체 필드 | ✅ | 아래 2번 표 참고 |
| 실적(kpi_targets) 전체 필드 | ✅ | 아래 2번 표 참고 |
| 기존 계산값 (달성률·가중점수 등) | ✅ (재사용 방식 결정 필요) | 전부 프런트 JS 함수로 생성 — 3번 항목 |
| 첨부파일 메타데이터 | ⚠️ 부분 가능 | 파일명·경로는 가능. MIME·크기·업로드시각·업로더는 Storage 메타데이터 join 필요, 활성/삭제 상태는 추적 안 됨 |
| 첨부파일 다운로드 URL | ✅ | 기존 로직 재사용 |
| 담당자 ID(FK) | ❌ 없음 | `kpi_items.manager_name`은 텍스트. 실적 제출자만 FK 있음 |

---

## 2. 실제 테이블·컬럼과 연결 관계

View나 RPC는 존재하지 않는다(전부 base table 직접 조회). 연결 관계는 다음과 같다.

```
departments (id, name)
  └─ kpi_items.dept_id  (FK)
       ├─ kpi_milestones.kpi_id  (FK, 월별 목표)
       ├─ kpi_items.primary_kpi_id  (자기참조, "두 번째 목표" 연결)
       └─ kpi_targets.kpi_id  (FK, 실적+승인+증빙)
            └─ kpi_targets.performance_submitted_by → profiles.id (FK)

profiles (id, username, full_name, role, dept_id)
  └─ profile_department_roles (profile_id, dept_id, role)   ← 겸직(다중 부서)
```

### `kpi_items` (앱 코드에서 확인된 필드 — 라이브 DDL 재확인 권장)

`id, dept_id, main_topic, sub_topic, detail_activity, bm, weight, manager_name(담당자 표시명), evaluation_type, unit, indicator_type, target_value, target_direction, qualitative_calc_type, aggregation_type, target_fill_policy, achievement_cap, kpi_structure_version, period_start_month, period_end_month, target_final_value, status(active/closed), hold_drop_status(hold/drop/null), hold_drop_reason, primary_kpi_id`

근거: `src/lib/kpi-queries.ts` 내 `pickText`/`pickNumber` 필드명 배열 및 `supabase/migrations/2026041*~2026072*_kpi_items_*.sql` 일련의 ALTER 문.

### `kpi_targets` (라이브 DB `information_schema.columns` 직접 조회로 확인 — 이번 세션에서 실행)

`id, kpi_id, half_type, schedule, effect, h1_target, h1_result, h1_rate, h1_effect, h1_target_value, h1_target_pct, h2_schedule, h2_target, h2_result, h2_rate, h2_effect, h2_target_value, h2_target_pct, challenge_goal, remarks, year, quarter, approval_step(draft/pending_primary/pending_final/approved), rejection_reason, evidence_url, performance_monthly(jsonb), performance_submitted_by(→profiles.id)`

### `kpi_milestones`: `kpi_id, target_month, target_value, note` (월별 목표)

### `departments`: `id, name` (그 외 컬럼 미확인)

### `profiles`: `id, username, full_name, role, dept_id` + `profile_department_roles(profile_id, dept_id, role)`로 겸직 부서 추가

---

## 3. 기존 계산값 목록과 생성 위치

전부 **`src/lib/kpi-queries.ts`의 순수 TypeScript 함수**에서 생성된다. DB View/RPC 없음.

| 계산값 | 생성 함수 | 비고 |
|---|---|---|
| 월별 달성률 | `monthlyAchievementRatesByMonth()` (L1220) | `kpi_targets.performance_monthly` 기반 |
| 항목 대표 달성률(`averageAchievement`) | `periodEndOverallAchievementPercentFromMonthlyTarget()`(L1030) 우선, 없으면 `representativeAchievementPercentForRates()`(L1354) | "당월 단독" vs "누적 계산" 두 모드 분기 |
| 승인된 반기 실적률 수집 | `collectApprovedAchievementRatesForItemTargets()`(L1329) | 레거시 반기 구조용 |
| 부서 평균 달성률 | `fetchDepartmentKpiDetail()` 내부 (L2412) | Hold/Drop 항목·2목표(부항목) 제외, 미제출은 0%로 포함 |
| 부서 가중 점수 (임계형/진척형/정성형) | `weightedAverage()` + `pushWeightedScore()` (L2145~2160) | 지표유형·BM 텍스트로 트랙 분류 |
| 종합 점수(compositeScore) | `fetchDepartmentKpiDetail()` (L2419~2423) | 임계 30% + 진척 50% + 정성 20% 가중 |
| 최종 완료 여부 | `status === "closed"` (L2389) | 단순 필드 매핑 |
| Hold/Drop 활성 여부 | `isKpiHoldDropActive()` (L1594) | hold/drop이면 분자·분모에서 제외 |
| 평가 대상 여부(현재월) | `itemIsEvaluatedInMonth()` (department-detail-client.tsx) | 평가 시작·종료월 + 목표 존재 여부 기준 — **UI 컴포넌트에 있음, kpi-queries.ts 밖** |
| 구조 검토 필요 여부 | `needsStructureReview` 계산식 (L2340) | 구버전 구조·필드 누락 감지 |
| 승인 상태 대표값 | `aggregateApprovalStepForItem()` (L1684) | 여러 kpi_targets 행 중 우선순위로 대표 1개 |

**재사용 방식 판단**: 스펙 3가지 선택지 중 **1번(계산 함수 서버 재사용)을 권장**한다. 이유는 6번(수정할 파일) 항목 참고.

---

## 4. 첨부파일 구조와 다운로드 방식

### 저장 위치
- Storage 버킷: `kpi-evidence` (다른 버킷 없음)
- 경로 규칙: `kpi/{kpi_targets.id}/{원본파일명_정제}_{6자리구분자}.{확장자}` — `uploadEvidenceFile()` (kpi-queries.ts L3237)
- **부서/항목 ID는 경로에 없다.** 실적 레코드(`kpi_targets.id`) 기준으로만 저장된다.

### 메타데이터 위치 (전용 테이블 없음)
- `kpi_targets.evidence_url`(레거시 단일) / `evidence_urls`(text[]) / `evidence_original_filenames`(text[])
- `kpi_targets.performance_monthly`(jsonb) — 월별 셀 안에 각각 `evidence_urls`/`evidence_original_filenames` 보유 가능
- MIME·크기·업로더·업로드시각·삭제상태 컬럼 **없음** → `storage.objects`를 경로로 join해서 `metadata->>'size'`, `metadata->>'mimetype'`, `owner`, `created_at`으로 보완 가능(라이브 조회로 확인됨). 단 소프트 삭제 이력은 없음(하드 삭제만 존재) — **확인 필요/설계 필요**.

### 다운로드 흐름 (2단계, `src/lib/evidence-download-requests.ts`)
1. `requestEvidenceSignedUrl(storagePath)` 호출 → `download_requests` 테이블에 `storage_path`만 insert
2. 1초 간격 폴링으로 `status`가 `ready`가 될 때까지 대기 (최대 45초)
3. 별도 **서버 PC에서 상시 실행 중인 Electron 위젯**(`main.js`, 이 저장소 밖)이 Supabase Realtime으로 새 요청을 감지 → 로컬에 미러링된 사본에서 파일을 찾아 `_widget_staging/{요청id}/파일명` 경로로 재업로드 → 600초 서명 URL 발급 후 `download_requests.signed_url`에 기록
4. 병렬로 `tryDirectSignedUrl()`이 `storage.from("kpi-evidence").createSignedUrl(path, 60)`을 직접 시도 — **현재는 Storage 원본 파일이 삭제되지 않으므로(위젯의 `DELETE_SERVER_AFTER_SYNC_WHEN_LOCAL_EXISTS = false`) 이 경로만으로도 대부분 성공**

**설계 시사점**: Hub의 `download-url` 엔드포인트는 4번(직접 서명, 60초, 즉시 응답)만 구현해도 현재는 충분하다. 다만 향후 원본을 서버 PC로만 이관하고 Supabase에서 정리하는 정책으로 바뀌면 2~3번 큐 방식도 필요해진다 — 이 위젯 정책이 바뀔 계획이 있는지 **확인 필요**.

---

## 5. 인증·권한 (RLS) 현황

| 대상 | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `kpi_items` | 로그인 사용자 전체 허용 | 관리자 또는 담당 부서(`ctst_profile_has_department`) |
| `kpi_targets` | 로그인 사용자 전체 허용 | 관리자 또는 담당 부서 |
| `profiles` | 로그인 사용자 전체 허용 (이번 세션 적용) | **관리자만** (이번 세션 적용) |
| `departments` | RLS 미적용(전체 공개) | — |
| `storage.objects`(kpi-evidence 등) | **사실상 전면 개방**(`Allow All Access`, qual=true) | 동일 |

로그인: Supabase Auth, 계정 ID를 `{username}@ctst.local`로 매핑해 이메일처럼 사용(`usernameToAuthEmail()`). 역할은 `profiles.role`(한글 라벨 포함)을 `ctst_normalize_role()`로 정규화해 판정.

이미 이번 세션에서 만든 관리자 API(`app/api/admin/accounts/*`)가 "요청 헤더의 Bearer 토큰 → `auth.getUser()`로 본인 확인 → `profiles.role` 조회" 패턴을 쓰고 있다. Hub는 로그인 사용자가 아니라 **서버 간 통신**이므로 이 패턴 그대로는 맞지 않고, 7번에서 별도 방식을 제안한다.

---

## 6. 제안 API 목록과 수정할 파일

### 신규 서버 전용 헬퍼 (2개)

| 파일 | 역할 |
|---|---|
| `src/lib/hub-api-auth.ts` | Hub 전용 Bearer 토큰 검증 (`HUB_API_TOKEN` 서버 환경변수와 상수 시간 비교) |
| `src/lib/hub-kpi-read.ts` | 서비스 롤 클라이언트로 부서/항목/실적/첨부파일을 읽고 기존 계산 함수를 재사용하는 조회 함수 모음 |

### 신규 Route Handler (7개) — `app/api/admin/accounts/*`와 동일한 배치 규칙

```
app/api/v1/integrations/kpi/health/route.ts
app/api/v1/integrations/kpi/departments/route.ts
app/api/v1/integrations/kpi/items/route.ts
app/api/v1/integrations/kpi/performances/route.ts
app/api/v1/integrations/kpi/attachments/route.ts
app/api/v1/integrations/kpi/attachments/[id]/download-url/route.ts
app/api/v1/integrations/kpi/calculated-results/route.ts   (선택 — 5번 항목 참고)
```

### 기존 파일 수정 (계산 함수 재사용을 위한 최소 변경, 1개)

| 파일 | 변경 내용 | 리스크 |
|---|---|---|
| `src/lib/kpi-queries.ts` | `fetchDepartmentKpiDetail()`, `fetchDashboardSummaryStats()` 등에 **선택적 `client` 매개변수 추가**(기본값 = 기존 `createBrowserSupabase()`) | 기존 호출부(department-detail-client.tsx 등)는 인자를 안 넘기면 지금과 100% 동일하게 동작 — **하위 호환 시그니처 변경**이라 기존 화면 코드는 한 줄도 안 바뀜 |

이 방식을 권장하는 이유: 스펙이 명시한 "화면과 API의 계산값이 반드시 일치해야 한다"는 요구를 코드 중복 없이 만족시키는 유일한 방법이다. 함수를 복제하면 당장은 되지만 이후 화면 계산 로직이 바뀔 때 API가 따로 안 바뀌면 값이 갈린다.

### 환경변수 (신규 1개)

`HUB_API_TOKEN` — Hub가 보내는 고정 시크릿. `SUPABASE_SERVICE_ROLE_KEY`와 동일하게 서버 전용, `NEXT_PUBLIC_` 접두어 절대 금지.

---

## 7. 인증 방식 제안

스펙의 3가지 옵션 중 **1번(Hub 전용 서버 간 API 토큰)을 권장**한다.

- 2번(Cloudflare Access)은 이 프로젝트가 현재 Cloudflare를 쓰지 않음(Vercel 직접 배포) — 도입하려면 별도 인프라 작업 필요, 범위 밖.
- 3번(Hub 전용 Supabase 사용자)은 RLS를 다시 설계해야 하고, Hub가 "로그인 사용자"처럼 취급되면 실수로 쓰기 권한이 새는 경로가 늘어남.
- 1번은 이미 이 저장소에 확립된 패턴(`app/api/admin/accounts/*`이 서버 전용 시크릿으로 Supabase Admin API를 호출)과 구조적으로 가장 가깝고, 구현이 가장 단순하며 감사(audit)하기도 쉽다.

구현: Hub가 `Authorization: Bearer {HUB_API_TOKEN}`으로 요청 → Route Handler가 상수 시간 비교로 검증 → 통과 시 `SUPABASE_SERVICE_ROLE_KEY`로 만든 서비스 롤 클라이언트(RLS 완전 우회)로 조회. **쓰기 관련 함수는 이 클라이언트로 절대 호출하지 않는다** — 라우트 자체가 GET만 export하도록 강제.

---

## 8. API 요청·응답 예시 (2개만 대표로 제시, 나머지는 동일 패턴)

### `GET /api/v1/integrations/kpi/items?year=2026&page=1&page_size=100`

```json
{
  "data": [
    {
      "kpi_item_id": "5c9e...-uuid",
      "department_id": "49562c52-...",
      "year": 2026,
      "main_topic": "차별화 기술 및 시스템 설계",
      "sub_topic": "전용 제조 설비 개발",
      "detail_activity": "Reball & Attach공정 Comp. Jig ↔ Tray Dumping In-line화",
      "bm": "Manual",
      "owner_name": "정영석",
      "owner_id": null,
      "weight": 3,
      "indicator_type": "normal",
      "period_start_month": 3,
      "period_end_month": 9,
      "status": "active",
      "is_final_completed": false,
      "hold_drop_status": null,
      "needs_structure_review": false,
      "average_achievement": 45.0,
      "created_at": "확인 필요",
      "updated_at": "확인 필요"
    }
  ],
  "pagination": { "page": 1, "page_size": 100, "total": 1, "total_pages": 1 },
  "meta": { "year": 2026, "timezone": "Asia/Seoul", "fetched_at": "2026-08-11T10:00:00+09:00" }
}
```

`owner_id`가 `null`인 것은 누락이 아니라 **현재 스키마에 해당 FK가 없어서**다(0번 요약 4번 참고).

### `GET /api/v1/integrations/kpi/attachments/{attachment_id}/download-url`

```json
{
  "attachment_id": "kpi-evidence:kpi/3f2a.../보고서_9x2k1a.pdf",
  "signed_url": "https://xxxx.supabase.co/storage/v1/object/sign/kpi-evidence/...",
  "expires_in_seconds": 60,
  "expires_at": "2026-08-11T10:01:00+09:00"
}
```

`attachment_id`는 전용 테이블이 없어 **Storage 경로 자체를 안정적인 식별자로 인코딩**해 쓰는 방식을 제안한다(예: `bucket:path`). 별도 정수/UUID PK가 필요하면 신규 테이블 설계가 선행돼야 한다 — **확인 필요(Hub 쪽에서 반드시 자체 발급 UUID가 필요한지)**.

---

## 9. 기존 기능에 미치는 영향

| 영역 | 영향 | 근거 |
|---|---|---|
| 기존 화면(KPI 등록/승인/대시보드 등) | **없음** | 신규 API는 별도 경로(`/api/v1/integrations/kpi/*`)이고, 유일한 공유 파일 변경(`kpi-queries.ts`)도 하위 호환 시그니처라 기존 호출부 무변경 |
| Supabase DB 부하 | 경미 증가 가능 | Hub가 주기 폴링하면 `kpi_items`/`kpi_targets` 조회가 늘어남 — `updated_since` 필터·캐싱 필요 (kpi_items/kpi_targets에 `updated_at`이 실제로 있는지는 **확인 필요**, 없으면 증분 조회 자체가 불가능해 별도 트리거·컬럼 추가 필요) |
| Storage 부하 | 경미 | 서명 URL 발급 자체는 다운로드가 아니므로 미미. 실제 다운로드는 Hub가 URL로 직접 받아가므로 이 서버를 거치지 않음 |
| 위젯(별도 백업 프로그램) | **없음** | Hub API는 `download_requests` 큐를 건드리지 않고 직접 서명(4번 항목 경로)만 쓰는 것을 권장하므로 위젯 처리량에 영향 없음 |
| 보안 | Storage 전면 개방 상태는 그대로 | Hub API 도입 여부와 무관하게 이미 노출된 상태 — 별개로 손볼지는 사용자 판단 필요 |

---

## 10. 구현 및 테스트 순서 (제안)

1. `kpi_items`/`kpi_targets`의 실제 전체 컬럼(특히 `created_at`/`updated_at` 존재 여부)을 라이브 DB에서 재확인 — `updated_since` 증분 조회 가능 여부 결정
2. `HUB_API_TOKEN` 발급 방식 확정, `.env.local` + Vercel 등록
3. `src/lib/hub-api-auth.ts` 작성 (Bearer 토큰 검증만, 최소 구현)
4. `fetchDepartmentKpiDetail()` 등에 `client` 매개변수 추가 — 기존 스크린 정상 동작 회귀 테스트 먼저 통과 확인
5. `departments` → `items` → `performances` → `attachments` → `download-url` 순으로 Route Handler 구현 (의존성 낮은 것부터)
6. `owner_id` 등 스펙과 실제 스키마가 어긋나는 항목은 이 문서 공유 후 Hub 팀과 필드 정의 재협의
7. 스펙 9번 테스트 항목(개수 일치·ID 연결·계산값 일치·HOLD 상태 일치·페이지네이션·증분조회·인증·쓰기차단·서명URL 만료·기존 화면 회귀) 순서대로 검증
8. 첨부파일 개수가 많은 부서 1곳을 골라 `storage.objects` join 기반 메타데이터가 실제 파일과 맞는지 수동 대조

---

## 확인 필요 목록 (재정리)

- `kpi_items`/`kpi_targets`/`departments`의 정확한 전체 DDL(라이브 DB `information_schema` 재조회 권장 — 이번 세션은 안전 필터로 실행 불가했음)
- `created_at`/`updated_at` 컬럼 존재 여부(증분 조회 가능성 좌우)
- `download_requests`의 `staging_path`/`signed_expires_at`/`processed_at` 컬럼(위젯 코드에는 있으나 이 저장소 마이그레이션에서는 미확인 — 위젯 쪽에서 별도로 ALTER 했을 가능성)
- `attachment_id`를 Hub가 자체 UUID로 원하는지, 아니면 경로 인코딩으로 충분한지
- 위젯의 "서버 원본 삭제 정책"이 향후 바뀔 계획이 있는지(다운로드 큐 방식 구현 필요 여부 결정)
- `profiles`의 "활성 상태" 개념 필요 여부(현재는 계정 삭제=완전 삭제라 별도 플래그 없음)
