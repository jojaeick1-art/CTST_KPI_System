-- KPI VOC request workflow
-- Users submit KPI-related VOC items; admins triage and update status.

create table if not exists public.kpi_voc_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_by_name text not null default '',
  dept_id uuid null references public.departments(id) on delete set null,
  category text not null,
  title text not null,
  description text not null,
  status text not null default 'submitted',
  priority text not null default 'normal',
  admin_note text null,
  handled_by uuid null references public.profiles(id) on delete set null,
  handled_at timestamptz null,
  constraint kpi_voc_requests_category_chk check (
    category in ('department', 'permission', 'uiux', 'calculation', 'data', 'approval', 'other')
  ),
  constraint kpi_voc_requests_status_chk check (
    status in ('submitted', 'received', 'in_progress', 'done', 'rejected')
  ),
  constraint kpi_voc_requests_priority_chk check (
    priority in ('normal', 'high', 'urgent')
  ),
  constraint kpi_voc_requests_title_chk check (length(trim(title)) between 1 and 120),
  constraint kpi_voc_requests_description_chk check (length(trim(description)) between 1 and 4000)
);

create index if not exists kpi_voc_requests_created_by_idx
on public.kpi_voc_requests(created_by, created_at desc);

create index if not exists kpi_voc_requests_status_idx
on public.kpi_voc_requests(status, created_at desc);

create index if not exists kpi_voc_requests_dept_idx
on public.kpi_voc_requests(dept_id, created_at desc);

create or replace function public.kpi_voc_requests_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kpi_voc_requests_touch_updated_at_trg on public.kpi_voc_requests;
create trigger kpi_voc_requests_touch_updated_at_trg
before update on public.kpi_voc_requests
for each row execute function public.kpi_voc_requests_touch_updated_at();

alter table public.kpi_voc_requests enable row level security;

drop policy if exists kpi_voc_requests_select_own_or_admin on public.kpi_voc_requests;
create policy kpi_voc_requests_select_own_or_admin
on public.kpi_voc_requests for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
);

drop policy if exists kpi_voc_requests_insert_own on public.kpi_voc_requests;
create policy kpi_voc_requests_insert_own
on public.kpi_voc_requests for insert to authenticated
with check (
  created_by = auth.uid()
  and status = 'submitted'
  and handled_by is null
  and handled_at is null
);

drop policy if exists kpi_voc_requests_update_admin on public.kpi_voc_requests;
create policy kpi_voc_requests_update_admin
on public.kpi_voc_requests for update to authenticated
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

drop policy if exists kpi_voc_requests_delete_admin on public.kpi_voc_requests;
create policy kpi_voc_requests_delete_admin
on public.kpi_voc_requests for delete to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
);

comment on table public.kpi_voc_requests is
  'KPI VOC requests submitted by users and processed by admins.';
