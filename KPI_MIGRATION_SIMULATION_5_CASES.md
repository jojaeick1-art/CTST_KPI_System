# KPI 데이터 이관 시뮬레이션 (5건)

## 공통 원칙
- `%`는 기간별 독립 목표치이며 합산 100을 강제하지 않음
- 합계 100 검증은 `가중치`에만 적용
- 월 인덱스는 1~12 + 익년 1~3월을 13~15로 사용

## CASE 1: 상반기만 KPI (기존)
- 기존
  - h1_target: `6월`
  - h1_target_pct: `80`
  - h2_target: null
- 이관
  - period_start_month: 1
  - period_end_month: 6
  - target_final_value: 80
  - milestone: (6, 80)

## CASE 2: 상반기 KPI가 하반기로 연장
- 기존
  - 상반기 목표 75로 시작
  - 운영 중 10월까지 연장
- 이관
  - status: `extended`
  - extended_from_month: 6
  - period_end_month: 10
  - extended_reason: `검증 지연으로 일정 연장`
  - milestone: (6, 75), (10, 90)

## CASE 3: 하반기 목표만, 실제 운영은 1월부터 시작
- 기존
  - h2_target: `12월`
  - h2_target_pct: `100`
- 이관
  - period_start_month: 1
  - period_end_month: 12
  - target_final_value: 100
  - milestone: (12, 100)
  - 주석: 상반기는 준비/선행 활동 구간

## CASE 4: PPM KPI (낮을수록 좋은 지표)
- 기존
  - indicator_type: ppm
  - target_value: 120
- 이관
  - target_direction: `down`
  - target_final_value: 120
  - period_start_month: 1
  - period_end_month: 12
  - milestone: 선택(예: 6월 150, 12월 120)

## CASE 5: 일정형 KPI
- 기존
  - 기준: 일정
  - 상/하반기 일정 문구만 존재
- 이관
  - target_direction: `na`
  - period_start_month: 시작 월
  - period_end_month: 종료 월
  - target_final_value: 100 (진척률 완료 기준)
  - milestone: 주요 마일스톤(예: 3월 30, 6월 60, 9월 90, 12월 100)

## 검증 체크
- 기간 외 월에는 실적 입력 비활성화
- 달성률 계산은 target_direction 기준으로 분기
- 부서 가중치 합계 정책(<=100) 유지
