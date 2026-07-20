create table if not exists public.user_login_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  username_snapshot text not null,
  full_name_snapshot text,
  role_snapshot text,
  dept_id_snapshot uuid references public.departments(id) on delete set null,
  dept_name_snapshot text,
  event_type text not null check (event_type in ('login_success', 'logout', 'login_failed')),
  source text not null default 'web',
  logged_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_login_audit_logs_logged_at_idx
  on public.user_login_audit_logs (logged_at desc);

create index if not exists user_login_audit_logs_user_logged_at_idx
  on public.user_login_audit_logs (user_id, logged_at desc);

create index if not exists user_login_audit_logs_dept_logged_at_idx
  on public.user_login_audit_logs (dept_id_snapshot, logged_at desc);

create index if not exists user_login_audit_logs_event_logged_at_idx
  on public.user_login_audit_logs (event_type, logged_at desc);

alter table public.user_login_audit_logs enable row level security;

drop policy if exists "user_login_audit_logs_insert_own" on public.user_login_audit_logs;
create policy "user_login_audit_logs_insert_own"
on public.user_login_audit_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_login_audit_logs_select_admin" on public.user_login_audit_logs;
create policy "user_login_audit_logs_select_admin"
on public.user_login_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', '관리자')
  )
);

create or replace view public.v_login_stats_daily_by_dept as
select
  date(timezone('Asia/Seoul', l.logged_at)) as log_date,
  l.dept_id_snapshot as dept_id,
  coalesce(nullif(l.dept_name_snapshot, ''), '미지정') as dept_name,
  count(*) filter (where l.event_type = 'login_success')::int as login_count,
  count(distinct l.user_id) filter (where l.event_type = 'login_success')::int as unique_user_count
from public.user_login_audit_logs l
group by 1, 2, 3;

create or replace view public.v_login_stats_monthly_by_dept as
select
  date_trunc('month', timezone('Asia/Seoul', l.logged_at))::date as log_month,
  l.dept_id_snapshot as dept_id,
  coalesce(nullif(l.dept_name_snapshot, ''), '미지정') as dept_name,
  count(*) filter (where l.event_type = 'login_success')::int as login_count,
  count(distinct l.user_id) filter (where l.event_type = 'login_success')::int as unique_user_count
from public.user_login_audit_logs l
group by 1, 2, 3;

create or replace view public.v_login_stats_daily_by_user as
select
  date(timezone('Asia/Seoul', l.logged_at)) as log_date,
  l.user_id,
  l.username_snapshot as username,
  l.full_name_snapshot as full_name,
  l.dept_id_snapshot as dept_id,
  coalesce(nullif(l.dept_name_snapshot, ''), '미지정') as dept_name,
  count(*) filter (where l.event_type = 'login_success')::int as login_count
from public.user_login_audit_logs l
group by 1, 2, 3, 4, 5, 6;

create or replace view public.v_login_stats_monthly_by_user as
select
  date_trunc('month', timezone('Asia/Seoul', l.logged_at))::date as log_month,
  l.user_id,
  l.username_snapshot as username,
  l.full_name_snapshot as full_name,
  l.dept_id_snapshot as dept_id,
  coalesce(nullif(l.dept_name_snapshot, ''), '미지정') as dept_name,
  count(*) filter (where l.event_type = 'login_success')::int as login_count
from public.user_login_audit_logs l
group by 1, 2, 3, 4, 5, 6;

create or replace view public.v_user_last_login as
select
  p.id as user_id,
  p.username,
  p.full_name,
  p.role,
  p.dept_id,
  d.name as dept_name,
  max(l.logged_at) filter (where l.event_type = 'login_success') as last_login_at,
  case
    when max(l.logged_at) filter (where l.event_type = 'login_success') is null then null
    else floor(
      extract(
        epoch from (
          timezone('Asia/Seoul', now()) -
          timezone('Asia/Seoul', max(l.logged_at) filter (where l.event_type = 'login_success'))
        )
      ) / 86400
    )::int
  end as inactive_days
from public.profiles p
left join public.departments d
  on d.id = p.dept_id
left join public.user_login_audit_logs l
  on l.user_id = p.id
group by p.id, p.username, p.full_name, p.role, p.dept_id, d.name;
