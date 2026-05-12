-- CTST 2Campus 공사 일정: 주간 실적(승인 없음) + 계획 일정

create table if not exists public.campus2_schedule_tasks (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null,
  title text not null,
  plan_start date not null,
  plan_end date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campus2_schedule_weekly (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.campus2_schedule_tasks(id) on delete cascade,
  year int not null,
  week_key text not null,
  achievement_rate numeric not null default 0 check (achievement_rate >= 0 and achievement_rate <= 100),
  description text null,
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (task_id, year, week_key)
);

create index if not exists campus2_schedule_weekly_task_year_idx
  on public.campus2_schedule_weekly(task_id, year);

create index if not exists campus2_schedule_tasks_sort_idx
  on public.campus2_schedule_tasks(sort_order);

create or replace function public.ctst_can_edit_campus2_schedule(role_text text)
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

alter table public.campus2_schedule_tasks enable row level security;
alter table public.campus2_schedule_weekly enable row level security;

drop policy if exists campus2_schedule_tasks_select_authenticated on public.campus2_schedule_tasks;
create policy campus2_schedule_tasks_select_authenticated
on public.campus2_schedule_tasks
for select
to authenticated
using (true);

drop policy if exists campus2_schedule_tasks_write_privileged on public.campus2_schedule_tasks;
create policy campus2_schedule_tasks_write_privileged
on public.campus2_schedule_tasks
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_campus2_schedule(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_campus2_schedule(p.role::text)
  )
);

drop policy if exists campus2_schedule_weekly_select_authenticated on public.campus2_schedule_weekly;
create policy campus2_schedule_weekly_select_authenticated
on public.campus2_schedule_weekly
for select
to authenticated
using (true);

drop policy if exists campus2_schedule_weekly_write_privileged on public.campus2_schedule_weekly;
create policy campus2_schedule_weekly_write_privileged
on public.campus2_schedule_weekly
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_campus2_schedule(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_campus2_schedule(p.role::text)
  )
);

insert into public.campus2_schedule_tasks (sort_order, title, plan_start, plan_end)
select v.sort_order, v.title, v.plan_start::date, v.plan_end::date
from (
  values
    (1, '구매 및 제작 자재 준비', '2026-04-18', '2026-05-09'),
    (2, 'SMT Line 공사 우선 진행', '2026-04-18', '2026-05-26'),
    (3, '신형 SMT Line Set-up', '2026-05-27', '2026-06-05'),
    (4, '2층 SMT Line 이전 및 Set-up', '2026-06-08', '2026-06-13'),
    (5, '1층 잔여 구역 공사', '2026-05-27', '2026-06-07'),
    (6, '2층 Advan T5588 이전 및 Set-up', '2026-06-08', '2026-06-14'),
    (7, '2층 Auto P-RDT, LPDDR, Laser M/K 설비 이전 및 Set-up', '2026-06-06', '2026-06-12'),
    (8, '2층 Layout, 전기, 공조, 공압 공사', '2026-06-09', '2026-06-12'),
    (9, '1Camps Die Tester 36Para 이전 및 Set-up', '2026-06-13', '2026-06-20')
) as v(sort_order, title, plan_start, plan_end)
where not exists (select 1 from public.campus2_schedule_tasks);
