-- 투자 심의 대시보드: 항목 + 단계 컬럼 + 계획/실적(첨부 포함)

create or replace function public.ctst_can_access_investment_dashboard(role_text text)
returns boolean
language sql
stable
as $$
  select public.ctst_normalize_role(role_text) in (
    'admin',
    'ceo',
    'group_leader',
    'team_leader',
    'group_team_leader'
  );
$$;

create or replace function public.ctst_can_edit_investment_dashboard(role_text text)
returns boolean
language sql
stable
as $$
  select public.ctst_normalize_role(role_text) in (
    'admin',
    'group_leader',
    'team_leader',
    'group_team_leader'
  );
$$;

create table if not exists public.investment_projects (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 1,
  item_name text not null,
  amount_k_krw numeric(16, 2) null,
  dept_name text null,
  owner_name text null,
  detail text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_stage_columns (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 1,
  name text not null,
  created_at timestamptz not null default now(),
  unique(name)
);

create table if not exists public.investment_stage_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.investment_projects(id) on delete cascade,
  stage_column_id uuid not null references public.investment_stage_columns(id) on delete cascade,
  plan_date date null,
  actual_date date null,
  evidence_storage_path text null,
  evidence_file_name text null,
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(project_id, stage_column_id)
);

create index if not exists investment_projects_sort_idx
  on public.investment_projects(sort_order);

create index if not exists investment_stage_columns_sort_idx
  on public.investment_stage_columns(sort_order);

create index if not exists investment_stage_entries_project_idx
  on public.investment_stage_entries(project_id);

create index if not exists investment_stage_entries_stage_idx
  on public.investment_stage_entries(stage_column_id);

alter table public.investment_projects enable row level security;
alter table public.investment_stage_columns enable row level security;
alter table public.investment_stage_entries enable row level security;

drop policy if exists investment_projects_select on public.investment_projects;
create policy investment_projects_select
on public.investment_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_access_investment_dashboard(p.role::text)
  )
);

drop policy if exists investment_projects_write on public.investment_projects;
create policy investment_projects_write
on public.investment_projects
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_investment_dashboard(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_investment_dashboard(p.role::text)
  )
);

drop policy if exists investment_stage_columns_select on public.investment_stage_columns;
create policy investment_stage_columns_select
on public.investment_stage_columns
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_access_investment_dashboard(p.role::text)
  )
);

drop policy if exists investment_stage_columns_write on public.investment_stage_columns;
create policy investment_stage_columns_write
on public.investment_stage_columns
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_investment_dashboard(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_investment_dashboard(p.role::text)
  )
);

drop policy if exists investment_stage_entries_select on public.investment_stage_entries;
create policy investment_stage_entries_select
on public.investment_stage_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_access_investment_dashboard(p.role::text)
  )
);

drop policy if exists investment_stage_entries_write on public.investment_stage_entries;
create policy investment_stage_entries_write
on public.investment_stage_entries
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_investment_dashboard(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_investment_dashboard(p.role::text)
  )
);

insert into public.investment_stage_columns (sort_order, name)
select v.sort_order, v.name
from (
  values
    (1, '투자'),
    (2, '입고'),
    (3, '양산기여')
) as v(sort_order, name)
where not exists (
  select 1 from public.investment_stage_columns c where c.name = v.name
);
