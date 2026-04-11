-- 월별 실적·승인 상태 저장 (JSON). 추가 후 Supabase Dashboard → Settings → API → Reload schema 권장.
alter table public.kpi_targets
  add column if not exists performance_monthly jsonb not null default '{}'::jsonb;

comment on column public.kpi_targets.performance_monthly is
  '월별 실적: {"1":{"achievement_rate":50,"approval_step":"approved","remarks":null,"evidence_url":null,"rejection_reason":null}, ... }';
