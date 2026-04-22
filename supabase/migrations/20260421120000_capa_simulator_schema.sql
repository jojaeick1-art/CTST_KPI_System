-- CAPA 시뮬레이터: 레시피(모델·공정·설비) + 사용자 시나리오 저장

create or replace function public.ctst_can_manage_capa_recipe(role_text text)
returns boolean
language sql
stable
as $$
  select public.ctst_normalize_role(role_text) in ('admin', 'ceo', 'team_leader', 'group_leader');
$$;

comment on function public.ctst_can_manage_capa_recipe(text) is
  'CAPA 레시피(모델/공정/설비) CUD — 관리자·대표·팀장·그룹장';

create table if not exists public.sim_models (
  id uuid primary key default gen_random_uuid(),
  model_code text not null unique,
  model_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sim_processes (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.sim_models(id) on delete cascade,
  process_code text not null,
  process_name text not null,
  seq_no int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, process_code)
);

create index if not exists sim_processes_model_id_idx on public.sim_processes(model_id);

create table if not exists public.sim_equipments (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.sim_processes(id) on delete cascade,
  equipment_name text not null,
  ct_sec numeric not null check (ct_sec > 0),
  std_uptime_rate numeric not null default 1
    check (std_uptime_rate > 0 and std_uptime_rate <= 1),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sim_equipments_process_id_idx on public.sim_equipments(process_id);

create table if not exists public.sim_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid not null references public.sim_models(id) on delete cascade,
  name text not null,
  shift_type text not null check (shift_type in ('8h', '12h')),
  work_days numeric not null check (work_days > 0),
  input_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sim_scenarios_user_id_idx on public.sim_scenarios(user_id);

create table if not exists public.sim_scenario_process_selection (
  scenario_id uuid not null references public.sim_scenarios(id) on delete cascade,
  process_id uuid not null references public.sim_processes(id) on delete cascade,
  primary key (scenario_id, process_id)
);

comment on table public.sim_models is 'CAPA 모델(제품 라인업) 마스터';
comment on table public.sim_processes is '모델별 공정 순서';
comment on table public.sim_equipments is '공정별 설비 및 C/T, 표준 가동률';
comment on table public.sim_scenarios is '사용자별 시뮬레이션 저장';

alter table public.sim_models enable row level security;
alter table public.sim_processes enable row level security;
alter table public.sim_equipments enable row level security;
alter table public.sim_scenarios enable row level security;
alter table public.sim_scenario_process_selection enable row level security;

-- 레시피 조회: 인증 사용자 전원
drop policy if exists sim_models_select_authed on public.sim_models;
create policy sim_models_select_authed
on public.sim_models for select to authenticated using (true);

drop policy if exists sim_processes_select_authed on public.sim_processes;
create policy sim_processes_select_authed
on public.sim_processes for select to authenticated using (true);

drop policy if exists sim_equipments_select_authed on public.sim_equipments;
create policy sim_equipments_select_authed
on public.sim_equipments for select to authenticated using (true);

-- 레시피 CUD: 그룹장 이상 (admin·ceo·group_leader)
drop policy if exists sim_models_recipe_manage on public.sim_models;
create policy sim_models_recipe_manage
on public.sim_models for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_manage_capa_recipe(p.role::text)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_manage_capa_recipe(p.role::text)
  )
);

drop policy if exists sim_processes_recipe_manage on public.sim_processes;
create policy sim_processes_recipe_manage
on public.sim_processes for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_manage_capa_recipe(p.role::text)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_manage_capa_recipe(p.role::text)
  )
);

drop policy if exists sim_equipments_recipe_manage on public.sim_equipments;
create policy sim_equipments_recipe_manage
on public.sim_equipments for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_manage_capa_recipe(p.role::text)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_manage_capa_recipe(p.role::text)
  )
);

-- 시나리오: 본인 것만
drop policy if exists sim_scenarios_select_own on public.sim_scenarios;
create policy sim_scenarios_select_own
on public.sim_scenarios for select to authenticated
using (user_id = auth.uid());

drop policy if exists sim_scenarios_insert_own on public.sim_scenarios;
create policy sim_scenarios_insert_own
on public.sim_scenarios for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists sim_scenarios_update_own on public.sim_scenarios;
create policy sim_scenarios_update_own
on public.sim_scenarios for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists sim_scenarios_delete_own on public.sim_scenarios;
create policy sim_scenarios_delete_own
on public.sim_scenarios for delete to authenticated
using (user_id = auth.uid());

drop policy if exists sim_scenario_process_selection_all_own on public.sim_scenario_process_selection;
create policy sim_scenario_process_selection_all_own
on public.sim_scenario_process_selection for all to authenticated
using (
  exists (
    select 1 from public.sim_scenarios s
    where s.id = sim_scenario_process_selection.scenario_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sim_scenarios s
    where s.id = sim_scenario_process_selection.scenario_id
      and s.user_id = auth.uid()
  )
);

-- 데모 데이터 (최초 1회만 적용되는 마이그레이션 전제)
insert into public.sim_models (model_code, model_name, description, is_active)
values ('DEMO-M1', '데모 모델 M1', 'CAPA 시뮬레이터 데모 레시피', true)
on conflict (model_code) do nothing;

insert into public.sim_processes (model_id, process_code, process_name, seq_no, is_active)
select m.id, v.code, v.name, v.seq, true
from public.sim_models m
cross join (values
  ('SMT', 'SMT', 10),
  ('ASSY', '조립', 20),
  ('TEST', '테스트', 30)
) as v(code, name, seq)
where m.model_code = 'DEMO-M1'
  and not exists (
    select 1 from public.sim_processes sp
    where sp.model_id = m.id and sp.process_code = v.code
  );

insert into public.sim_equipments (process_id, equipment_name, ct_sec, std_uptime_rate, sort_order)
select p.id, v.eq, v.ct, v.uptime, v.ord
from public.sim_processes p
join public.sim_models m on m.id = p.model_id
cross join (values
  ('SMT', '로더', 6.5::numeric, 0.98::numeric, 1),
  ('SMT', '프린터', 11.2::numeric, 0.96::numeric, 2),
  ('SMT', 'SPI', 9.8::numeric, 0.95::numeric, 3),
  ('SMT', '마운터1', 7.4::numeric, 0.94::numeric, 4),
  ('SMT', '마운터2', 8.1::numeric, 0.94::numeric, 5),
  ('SMT', 'MAOI', 10.6::numeric, 0.93::numeric, 6),
  ('SMT', '리플로우', 13.5::numeric, 0.97::numeric, 7),
  ('SMT', 'SAOI', 12.1::numeric, 0.92::numeric, 8),
  ('SMT', '라벨', 5.9::numeric, 0.98::numeric, 9),
  ('SMT', '라우터', 14.3::numeric, 0.91::numeric, 10),
  ('SMT', '언로더', 6.1::numeric, 0.98::numeric, 11),
  ('ASSY', '조립기 1', 18::numeric, 0.88::numeric, 1),
  ('TEST', '테스터 1', 22::numeric, 0.95::numeric, 1)
) as v(pcode, eq, ct, uptime, ord)
where m.model_code = 'DEMO-M1' and p.process_code = v.pcode
  and not exists (
    select 1 from public.sim_equipments e
    where e.process_id = p.id and e.equipment_name = v.eq
  );
