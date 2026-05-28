-- CAPA 공정 그룹 관리 + 레시피 소속 공정

create table if not exists public.capa_process_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.capa_process_groups enable row level security;

drop policy if exists capa_process_groups_select_capa on public.capa_process_groups;
create policy capa_process_groups_select_capa
  on public.capa_process_groups for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_run_capa_simulator(p.role::text)
    )
  );

drop policy if exists capa_process_groups_manage on public.capa_process_groups;
create policy capa_process_groups_manage
  on public.capa_process_groups for all to authenticated
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

alter table public.capa_recipe_files
  add column if not exists process_group text;

update public.capa_recipe_files
set process_group = 'SMT'
where process_group is null or btrim(process_group) = '';

alter table public.capa_recipe_files
  alter column process_group set default 'SMT';

insert into public.capa_process_groups(name, sort_order)
values
  ('SMT', 10),
  ('Die Test', 20),
  ('실장 Test', 30),
  ('Advan', 40),
  ('P-RDT', 50),
  ('S-RDT', 60),
  ('Dut marking', 70),
  ('Repair', 80),
  ('Reball', 90)
on conflict (name) do nothing;
