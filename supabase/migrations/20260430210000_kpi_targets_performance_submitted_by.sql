-- 실적 제출자(auth.users.id) — 승인 대기 중 본인 회수(withdraw) 시 검증용 (레거시 분기 행)
alter table public.kpi_targets
  add column if not exists performance_submitted_by uuid;

comment on column public.kpi_targets.performance_submitted_by is
  '분기/반기 실적 제출 직후 로그인 사용자 UUID. 월별(JSON)은 performance_monthly.*.submitted_by 사용.';
