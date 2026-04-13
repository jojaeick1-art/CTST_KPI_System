-- KPI 항목: 일반 vs 역지표(PPM). 목표 PPM은 kpi_items.target_value, 월별 실적 PPM은 performance_monthly JSON의 actual_value.
alter table public.kpi_items
  add column if not exists indicator_type text not null default 'normal',
  add column if not exists target_value double precision null;

alter table public.kpi_items
  drop constraint if exists kpi_items_indicator_type_check;

alter table public.kpi_items
  add constraint kpi_items_indicator_type_check
  check (indicator_type in ('normal', 'ppm'));

comment on column public.kpi_items.indicator_type is
  'normal: 달성률(%) 직접 입력. ppm: 역지표 — 실적 PPM은 performance_monthly.*.actual_value, 달성률은 공식으로 계산해 achievement_rate에 저장.';

comment on column public.kpi_items.target_value is
  '역지표(ppm)일 때 목표 PPM. 일반 항목에서는 null.';

comment on column public.kpi_targets.performance_monthly is
  '월별 실적: {"1":{"achievement_rate":50,"actual_value":null,"approval_step":"approved","remarks":null,"evidence_url":null,"rejection_reason":null}, ... }. ppm 항목은 actual_value에 실적 PPM.';
