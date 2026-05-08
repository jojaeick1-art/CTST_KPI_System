-- 사용자별 추가 담당 부서 권한.
-- profiles.dept_id(주 소속)는 유지하고, 겸임/복수 담당 부서는 이 테이블로 확장한다.

create table if not exists public.profile_department_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dept_id uuid not null references public.departments(id) on delete cascade,
  role text not null default 'team_leader',
  created_at timestamptz not null default now(),
  primary key (profile_id, dept_id, role)
);

create index if not exists profile_department_roles_profile_idx
on public.profile_department_roles(profile_id);

create index if not exists profile_department_roles_dept_idx
on public.profile_department_roles(dept_id);

alter table public.profile_department_roles enable row level security;

drop policy if exists profile_department_roles_select_own_or_admin
on public.profile_department_roles;

create policy profile_department_roles_select_own_or_admin
on public.profile_department_roles
for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
);

drop policy if exists profile_department_roles_admin_write
on public.profile_department_roles;

create policy profile_department_roles_admin_write
on public.profile_department_roles
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
);

create or replace function public.ctst_profile_has_department(
  input_profile_id uuid,
  input_dept_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = input_profile_id
      and p.dept_id = input_dept_id
  )
  or exists (
    select 1
    from public.profile_department_roles pdr
    where pdr.profile_id = input_profile_id
      and pdr.dept_id = input_dept_id
  );
$$;

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
        or public.ctst_profile_has_department(p.id, kpi_items.dept_id)
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
        or public.ctst_profile_has_department(p.id, kpi_items.dept_id)
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
        or public.ctst_profile_has_department(p.id, ki.dept_id)
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
        or public.ctst_profile_has_department(p.id, ki.dept_id)
      )
  )
);

insert into public.profile_department_roles (profile_id, dept_id, role)
select
  p.id,
  d.id,
  'team_leader'
from public.profiles p
cross join public.departments d
where p.id = 'dbc0ddde-7046-4c21-b5ce-6b4f8a3e7303'::uuid
  and regexp_replace(trim(d.name), '\s+', '', 'g') = '품질팀(CS)'
on conflict (profile_id, dept_id, role) do nothing;
