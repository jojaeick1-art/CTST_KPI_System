-- 가중치에 소수(예: 2.5) 입력 시 integer 컬럼에서 오류 방지
alter table public.kpi_items
  alter column weight type double precision
  using (weight::double precision);

comment on column public.kpi_items.weight is
  'KPI 가중치. 엑셀 업로드·화면에서 소수(예: 2.5) 허용';
