-- KPI period/milestone model expansion
-- Goal:
-- 1) decouple evaluation period from half-year fixed fields
-- 2) keep existing approval/performance flow compatible

alter table public.kpi_items
  add column if not exists period_start_month int,
  add column if not exists period_end_month int,
  add column if not exists target_direction text,
  add column if not exists target_final_value numeric,
  add column if not exists status text default 'active',
  add column if not exists extended_from_month int,
  add column if not exists extended_reason text;

update public.kpi_items
set period_start_month = coalesce(period_start_month, 1)
where period_start_month is null;

update public.kpi_items
set period_end_month = coalesce(period_end_month, 12)
where period_end_month is null;

update public.kpi_items
set target_direction = coalesce(target_direction, 'up')
where target_direction is null;

update public.kpi_items
set status = coalesce(status, 'active')
where status is null;

alter table public.kpi_items
  alter column period_start_month set not null,
  alter column period_end_month set not null,
  alter column target_direction set not null,
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kpi_items_period_start_month_chk'
  ) then
    alter table public.kpi_items
      add constraint kpi_items_period_start_month_chk
      check (period_start_month between 1 and 15);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kpi_items_period_end_month_chk'
  ) then
    alter table public.kpi_items
      add constraint kpi_items_period_end_month_chk
      check (period_end_month between 1 and 15);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kpi_items_period_range_chk'
  ) then
    alter table public.kpi_items
      add constraint kpi_items_period_range_chk
      check (period_start_month <= period_end_month);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kpi_items_target_direction_chk'
  ) then
    alter table public.kpi_items
      add constraint kpi_items_target_direction_chk
      check (target_direction in ('up', 'down', 'na'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kpi_items_status_chk'
  ) then
    alter table public.kpi_items
      add constraint kpi_items_status_chk
      check (status in ('active', 'extended', 'closed'));
  end if;
end $$;

create table if not exists public.kpi_milestones (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references public.kpi_items(id) on delete cascade,
  target_month int not null check (target_month between 1 and 15),
  target_value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kpi_milestones_kpi_id_target_month_uidx
  on public.kpi_milestones(kpi_id, target_month);

create index if not exists kpi_milestones_kpi_id_idx
  on public.kpi_milestones(kpi_id);

comment on column public.kpi_items.period_start_month is 'Evaluation period start month index (1~12 and next-year 1~3 as 13~15).';
comment on column public.kpi_items.period_end_month is 'Evaluation period end month index (1~12 and next-year 1~3 as 13~15).';
comment on column public.kpi_items.target_direction is 'Achievement direction: up/down/na.';
comment on column public.kpi_items.target_final_value is 'Final target value at period end.';
comment on table public.kpi_milestones is 'Optional milestone targets per KPI by month.';
