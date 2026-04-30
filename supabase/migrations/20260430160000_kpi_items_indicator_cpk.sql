-- KPI: Cpk(공정능력지수) — 목표·실적은 kpi_items.target_value / performance_monthly.actual_value,
-- 달성률은 수량형과 동일 비율식(측정 방향 up/down).

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
      '시간(hr)',
      'UPH',
      '분(min)',
      'Cpk'
    )
  );

comment on column public.kpi_items.unit is
  'Display/input unit: %, 수율(%), PPM, ea, 건, 명, k, 억, 시간(hr), UPH, 분(min), Cpk.';
