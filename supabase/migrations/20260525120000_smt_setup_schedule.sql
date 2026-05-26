-- SMT Line Set-up 현황: 2Campus 공사 일정과 동일 구조

create table if not exists public.smt_setup_schedule_tasks (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null,
  title text not null,
  plan_start date not null,
  plan_end date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.smt_setup_schedule_weekly (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.smt_setup_schedule_tasks(id) on delete cascade,
  year int not null,
  week_key text not null,
  achievement_rate numeric not null default 0 check (achievement_rate >= 0 and achievement_rate <= 100),
  description text null,
  evidence_url text null,
  evidence_urls text[] null,
  evidence_original_filenames text[] null,
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (task_id, year, week_key)
);

create index if not exists smt_setup_schedule_weekly_task_year_idx
  on public.smt_setup_schedule_weekly(task_id, year);

create index if not exists smt_setup_schedule_tasks_sort_idx
  on public.smt_setup_schedule_tasks(sort_order);

create table if not exists public.smt_setup_schedule_summary (
  year int primary key,
  overall_achievement_rate numeric not null default 0
    check (overall_achievement_rate >= 0 and overall_achievement_rate <= 100),
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.smt_setup_schedule_tasks enable row level security;
alter table public.smt_setup_schedule_weekly enable row level security;
alter table public.smt_setup_schedule_summary enable row level security;

drop policy if exists smt_setup_schedule_tasks_select_authenticated on public.smt_setup_schedule_tasks;
create policy smt_setup_schedule_tasks_select_authenticated
on public.smt_setup_schedule_tasks
for select
to authenticated
using (true);

drop policy if exists smt_setup_schedule_tasks_write_privileged on public.smt_setup_schedule_tasks;
create policy smt_setup_schedule_tasks_write_privileged
on public.smt_setup_schedule_tasks
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

drop policy if exists smt_setup_schedule_weekly_select_authenticated on public.smt_setup_schedule_weekly;
create policy smt_setup_schedule_weekly_select_authenticated
on public.smt_setup_schedule_weekly
for select
to authenticated
using (true);

drop policy if exists smt_setup_schedule_weekly_write_privileged on public.smt_setup_schedule_weekly;
create policy smt_setup_schedule_weekly_write_privileged
on public.smt_setup_schedule_weekly
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

drop policy if exists smt_setup_schedule_summary_select_authenticated on public.smt_setup_schedule_summary;
create policy smt_setup_schedule_summary_select_authenticated
on public.smt_setup_schedule_summary
for select
to authenticated
using (true);

drop policy if exists smt_setup_schedule_summary_write_privileged on public.smt_setup_schedule_summary;
create policy smt_setup_schedule_summary_write_privileged
on public.smt_setup_schedule_summary
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

insert into public.smt_setup_schedule_tasks (sort_order, title, plan_start, plan_end)
select v.sort_order, v.title, v.plan_start::date, v.plan_end::date
from (
  values
    (1, '1. SMT 신규 라인 · 인프라 공사', '2026-04-23', '2026-05-26'),
    (2, '1. SMT 신규 라인 · 설비 셋업', '2026-05-26', '2026-05-29'),
    (3, '1. SMT 신규 라인 · 검증 및 Qual', '2026-05-29', '2026-06-05'),
    (4, '1. SMT 신규 라인 · 양산가동', '2026-06-08', '2026-06-30'),
    (5, '2. SMT 이설 라인 · 인프라 공사', '2026-06-08', '2026-06-09'),
    (6, '2. SMT 이설 라인 · 설비 셋업', '2026-06-09', '2026-06-11'),
    (7, '2. SMT 이설 라인 · 검증 및 Qual', '2026-06-10', '2026-06-13'),
    (8, '2. SMT 이설 라인 · 통합 양산', '2026-06-15', '2026-06-30')
) as v(sort_order, title, plan_start, plan_end)
where not exists (select 1 from public.smt_setup_schedule_tasks);

insert into public.smt_setup_schedule_summary (year, overall_achievement_rate)
values (2026, 0)
on conflict (year) do nothing;
