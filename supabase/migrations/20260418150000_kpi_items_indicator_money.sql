-- 실적 방식: 금액(억) — UI/계산은 수량(k)과 동일하나 표시 단위가 억
alter table public.kpi_items
  drop constraint if exists kpi_items_indicator_type_check;

alter table public.kpi_items
  add constraint kpi_items_indicator_type_check
  check (indicator_type in ('normal', 'ppm', 'quantity', 'count', 'money'));

comment on column public.kpi_items.target_value is
  '목표값: ppm·quantity·count·money 에서 실적(actual_value)과 비교해 달성률 계산. 일반(normal)은 null. 금액은 억 단위 숫자.';
