-- KPI Hold / Drop 상태 (최종완료 status 와 별도)
alter table public.kpi_items
  add column if not exists hold_drop_status text null;

alter table public.kpi_items
  add column if not exists hold_drop_reason text null;

alter table public.kpi_items
  drop constraint if exists kpi_items_hold_drop_status_chk;

alter table public.kpi_items
  add constraint kpi_items_hold_drop_status_chk
  check (
    hold_drop_status is null
    or hold_drop_status in ('hold', 'drop')
  );

comment on column public.kpi_items.hold_drop_status is
  'KPI Hold/Drop 상태. null=정상, hold=보류, drop=중단. 적용 중에는 달성률 집계에서 제외.';

comment on column public.kpi_items.hold_drop_reason is
  'Hold/Drop 사유 텍스트.';
