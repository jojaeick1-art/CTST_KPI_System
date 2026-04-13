-- 실적 방식: 수량(quantity), 건수(count) 추가
alter table public.kpi_items
  drop constraint if exists kpi_items_indicator_type_check;

alter table public.kpi_items
  add constraint kpi_items_indicator_type_check
  check (indicator_type in ('normal', 'ppm', 'quantity', 'count'));

comment on column public.kpi_items.target_value is
  '목표값: ppm·quantity·count에서 실적(actual_value)과 비교해 달성률 계산. 일반(normal)은 null.';
