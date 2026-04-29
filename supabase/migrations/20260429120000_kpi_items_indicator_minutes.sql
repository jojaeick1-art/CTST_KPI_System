-- KPI: 분(min) 단위 지표 — 시간(h)과 동일한 목표 대비 달성률 규칙, indicator_type만 구분

alter table public.kpi_items
  drop constraint if exists kpi_items_indicator_type_check;

alter table public.kpi_items
  add constraint kpi_items_indicator_type_check
  check (
    indicator_type in (
      'normal',
      'ppm',
      'quantity',
      'count',
      'money',
      'time',
      'minutes',
      'uph',
      'headcount'
    )
  );
