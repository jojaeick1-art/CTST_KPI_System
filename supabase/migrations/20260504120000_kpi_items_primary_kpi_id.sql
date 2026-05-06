-- 두 번째 목표 행이 첫 번째 KPI와 묶일 때 사용 (그래프·목록 통합 표시)
alter table public.kpi_items
  add column if not exists primary_kpi_id uuid references public.kpi_items (id) on delete cascade;

create index if not exists kpi_items_primary_kpi_id_idx on public.kpi_items (primary_kpi_id);

comment on column public.kpi_items.primary_kpi_id is
  '첫 번째 목표 KPI의 id. 두 번째 목표 행만 설정; null이면 최상위 항목.';
