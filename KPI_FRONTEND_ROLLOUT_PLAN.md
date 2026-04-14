# KPI 프론트 적용 순서 (기간/마일스톤 모델)

## 목표
- 상/하반기 고정 입력을 기간 기반 입력으로 전환
- 기존 사용자 혼란(% 합산/반기 고정) 제거
- 기존 승인/월 실적 흐름은 유지

## 1단계: 등록 팝업 필드 재구성
- 파일: `app/dashboard/department/[id]/kpi-create-modal.tsx`
- 변경:
  - `평가 시작월`, `평가 종료월` 필드 추가
  - `최종목표값` 필드 추가
  - `상/하반기 목표값`은 선택 마일스톤 UI로 단계적 전환
  - `%는 합산 개념이 아님` 안내문 추가

## 2단계: 생성 API payload 확장
- 파일: `src/lib/kpi-queries.ts`
- 변경:
  - `CreateManualKpiInput`에 아래 필드 추가
    - `periodStartMonth`
    - `periodEndMonth`
    - `targetDirection`
    - `targetFinalValue`
    - `milestones[]` (선택)
  - `createManualKpiItem()`에서 `kpi_items` 신규 컬럼 저장
  - milestone 입력값은 `kpi_milestones` 저장

## 3단계: 훅/호출부 연결
- 파일: `src/hooks/useKpiQueries.ts`
- 변경:
  - mutation 타입 갱신
- 파일: `app/dashboard/department/[id]/department-detail-client.tsx`
- 변경:
  - 모달 submit payload 변경
  - 성공/실패 메시지 문구 갱신

## 4단계: 조회 모델 확장
- 파일: `src/lib/kpi-queries.ts`
- 변경:
  - `DepartmentKpiDetailItem`에 기간/최종목표 필드 포함
  - 목록에서 평가기간 텍스트 생성

## 5단계: 상세 모달 그래프 기간 반영
- 파일: `app/dashboard/department/[id]/performance-modal.tsx`
- 변경:
  - 월 활성 구간 계산 시 `period_start_month~period_end_month` 우선 사용
  - 반기 일정 파싱은 레거시 fallback으로 유지

## 6단계: 레거시 호환
- 레거시 데이터(`h1_target`, `h2_target`)는 읽기 fallback 유지
- 신규 저장은 기간 모델 우선
- 호환 종료 전까지 반기 라벨은 보조 표기로 유지

## 완료 기준
- 상반기만/하반기만/커스텀 기간 KPI 등록 가능
- `% KPI`의 목표 합산 혼동 제거(합산 100 미강제)
- 가중치 100 정책은 기존대로 유지
