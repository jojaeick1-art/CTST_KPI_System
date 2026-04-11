-- 관리자: 소속 부서와 무관하게 모든 부서의 kpi_items / kpi_targets 쓰기 허용
-- (앱에서 관리자가 타 부서 실적·KPI를 편집할 수 있도록 RLS 정합)

drop policy if exists kpi_items_write_own_department on public.kpi_items;

create policy kpi_items_write_own_department
on public.kpi_items
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_write_kpi(p.role::text)
      and (
        public.ctst_normalize_role(p.role::text) = 'admin'
        or p.dept_id = kpi_items.dept_id
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_write_kpi(p.role::text)
      and (
        public.ctst_normalize_role(p.role::text) = 'admin'
        or p.dept_id = kpi_items.dept_id
      )
  )
);

drop policy if exists kpi_targets_write_own_department on public.kpi_targets;

create policy kpi_targets_write_own_department
on public.kpi_targets
for all
to authenticated
using (
  exists (
    select 1
    from public.kpi_items ki
    join public.profiles p on p.id = auth.uid()
    where ki.id = kpi_targets.kpi_id
      and public.ctst_can_write_kpi(p.role::text)
      and (
        public.ctst_normalize_role(p.role::text) = 'admin'
        or p.dept_id = ki.dept_id
      )
  )
)
with check (
  exists (
    select 1
    from public.kpi_items ki
    join public.profiles p on p.id = auth.uid()
    where ki.id = kpi_targets.kpi_id
      and public.ctst_can_write_kpi(p.role::text)
      and (
        public.ctst_normalize_role(p.role::text) = 'admin'
        or p.dept_id = ki.dept_id
      )
  )
);
