-- KPI: 금액(만원) — 금액(억)과 동일 달성률 규칙, 단위만 만원

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
      'money_manwon',
      'time',
      'minutes',
      'uph',
      'headcount',
      'cpk'
    )
  );

alter table public.kpi_items
  drop constraint if exists kpi_items_unit_chk;

alter table public.kpi_items
  add constraint kpi_items_unit_chk
  check (
    unit is null
    or unit in (
      '%',
      '수율(%)',
      'PPM',
      'ea',
      '건',
      '명',
      'k',
      '억',
      '만원',
      '시간(hr)',
      'UPH',
      '분(min)',
      'Cpk'
    )
  );

comment on column public.kpi_items.unit is
  'Display/input unit: %, 수율(%), PPM, ea, 건, 명, k, 억, 만원, 시간(hr), UPH, 분(min), Cpk.';
