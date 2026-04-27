-- CTST KPI evaluation structure Rev02
-- Existing rows stay at structure version 1 so the UI can ask users to review them.

alter table public.kpi_items
  add column if not exists evaluation_type text,
  add column if not exists unit text,
  add column if not exists qualitative_calc_type text,
  add column if not exists aggregation_type text,
  add column if not exists target_fill_policy text,
  add column if not exists achievement_cap numeric,
  add column if not exists kpi_structure_version int not null default 1;

alter table public.kpi_items
  drop constraint if exists kpi_items_indicator_type_check;

alter table public.kpi_items
  add constraint kpi_items_indicator_type_check
  check (indicator_type in ('normal', 'ppm', 'quantity', 'count', 'money', 'time', 'uph', 'headcount'));

alter table public.kpi_items
  drop constraint if exists kpi_items_evaluation_type_chk;

alter table public.kpi_items
  add constraint kpi_items_evaluation_type_chk
  check (evaluation_type is null or evaluation_type in ('quantitative', 'qualitative'));

alter table public.kpi_items
  drop constraint if exists kpi_items_unit_chk;

alter table public.kpi_items
  add constraint kpi_items_unit_chk
  check (unit is null or unit in ('%', 'PPM', 'ea', '건', '명', 'k', '억', '시간', 'UPH'));

alter table public.kpi_items
  drop constraint if exists kpi_items_qualitative_calc_type_chk;

alter table public.kpi_items
  add constraint kpi_items_qualitative_calc_type_chk
  check (qualitative_calc_type is null or qualitative_calc_type in ('progress', 'completion'));

alter table public.kpi_items
  drop constraint if exists kpi_items_aggregation_type_chk;

alter table public.kpi_items
  add constraint kpi_items_aggregation_type_chk
  check (aggregation_type is null or aggregation_type in ('monthly', 'cumulative'));

alter table public.kpi_items
  drop constraint if exists kpi_items_target_fill_policy_chk;

alter table public.kpi_items
  add constraint kpi_items_target_fill_policy_chk
  check (target_fill_policy is null or target_fill_policy in ('exclude', 'carry_forward'));

alter table public.kpi_items
  drop constraint if exists kpi_items_achievement_cap_chk;

alter table public.kpi_items
  add constraint kpi_items_achievement_cap_chk
  check (achievement_cap is null or achievement_cap >= 100);

comment on column public.kpi_items.evaluation_type is
  'Evaluation type: quantitative numeric KPI or qualitative progress/completion KPI.';
comment on column public.kpi_items.unit is
  'Display/input unit: %, PPM, ea, 건, 명, k, 억, 시간, UPH.';
comment on column public.kpi_items.qualitative_calc_type is
  'Qualitative calculation: progress compares progress % to target %, completion is 0/100.';
comment on column public.kpi_items.aggregation_type is
  'Monthly view calculation basis: monthly or cumulative.';
comment on column public.kpi_items.target_fill_policy is
  'How to handle months without targets: exclude or carry_forward.';
comment on column public.kpi_items.achievement_cap is
  'Achievement display cap. Null means no cap; 100/120 are common values.';
comment on column public.kpi_items.kpi_structure_version is
  'KPI structure version. Rev02 form saves 2; existing migrated rows remain 1 and require review.';
