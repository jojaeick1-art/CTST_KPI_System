-- CTST 2Campus 종합 달성률(직접 입력)

create table if not exists public.campus2_schedule_summary (
  year int primary key,
  overall_achievement_rate numeric not null default 0
    check (overall_achievement_rate >= 0 and overall_achievement_rate <= 100),
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.campus2_schedule_summary enable row level security;

drop policy if exists campus2_schedule_summary_select_authenticated on public.campus2_schedule_summary;
create policy campus2_schedule_summary_select_authenticated
on public.campus2_schedule_summary
for select
to authenticated
using (true);

drop policy if exists campus2_schedule_summary_write_privileged on public.campus2_schedule_summary;
create policy campus2_schedule_summary_write_privileged
on public.campus2_schedule_summary
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

insert into public.campus2_schedule_summary (year, overall_achievement_rate)
values (2026, 0)
on conflict (year) do nothing;
