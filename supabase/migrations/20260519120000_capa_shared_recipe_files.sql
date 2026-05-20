-- CAPA 레시피 JSON 공유 카탈로그 (Storage: kpi-evidence/capa-bridge/shared/recipes/{id}.json)

create or replace function public.ctst_can_manage_capa_recipe(role_text text)
returns boolean
language sql
stable
as $$
  select public.ctst_normalize_role(role_text) in (
    'admin',
    'ceo',
    'team_leader',
    'group_leader',
    'group_team_leader'
  );
$$;

comment on function public.ctst_can_manage_capa_recipe(text) is
  'CAPA 레시피 파일 CUD — 관리자·대표·팀장·그룹장';

create or replace function public.ctst_can_run_capa_simulator(role_text text)
returns boolean
language sql
stable
as $$
  select public.ctst_can_manage_capa_recipe(role_text)
    or public.ctst_normalize_role(role_text) in (
      'principal',
      'manager',
      'senior',
      'pro'
    );
$$;

comment on function public.ctst_can_run_capa_simulator(text) is
  'CAPA 레시피 조회·시뮬레이터 — 레시피 관리 권한 또는 프로~책임';

create table if not exists public.capa_recipe_files (
  id uuid primary key,
  name text not null,
  storage_path text not null unique,
  process_count int not null default 0 check (process_count >= 0),
  schema_version text not null default '2.0',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capa_recipe_files_updated_at_idx
  on public.capa_recipe_files(updated_at desc);

create index if not exists capa_recipe_files_created_by_idx
  on public.capa_recipe_files(created_by);

comment on table public.capa_recipe_files is
  'CAPA 레시피 JSON 메타데이터 — 실제 파일은 Storage capa-bridge/shared/recipes/';

alter table public.capa_recipe_files enable row level security;

drop policy if exists capa_recipe_files_select_capa on public.capa_recipe_files;
create policy capa_recipe_files_select_capa
  on public.capa_recipe_files for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_run_capa_simulator(p.role::text)
    )
  );

drop policy if exists capa_recipe_files_insert_manage on public.capa_recipe_files;
create policy capa_recipe_files_insert_manage
  on public.capa_recipe_files for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );

drop policy if exists capa_recipe_files_update_manage on public.capa_recipe_files;
create policy capa_recipe_files_update_manage
  on public.capa_recipe_files for update to authenticated
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

drop policy if exists capa_recipe_files_delete_manage on public.capa_recipe_files;
create policy capa_recipe_files_delete_manage
  on public.capa_recipe_files for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );

-- 위젯 브리지: CAPA 사용자는 본인이 요청한 전달 행 조회 가능
drop policy if exists capa_recipe_transfers_select_capa on public.capa_recipe_transfers;
create policy capa_recipe_transfers_select_capa
  on public.capa_recipe_transfers for select to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_normalize_role(p.role::text) = 'admin'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_run_capa_simulator(p.role::text)
    )
  );

drop policy if exists capa_recipe_transfers_insert_capa on public.capa_recipe_transfers;
create policy capa_recipe_transfers_insert_capa
  on public.capa_recipe_transfers for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_run_capa_simulator(p.role::text)
    )
  );

-- Storage: capa-bridge/* (kpi-evidence 버킷)
drop policy if exists storage_capa_bridge_select on storage.objects;
create policy storage_capa_bridge_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kpi-evidence'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_run_capa_simulator(p.role::text)
    )
  );

drop policy if exists storage_capa_bridge_insert_manage on storage.objects;
create policy storage_capa_bridge_insert_manage
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kpi-evidence'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );

drop policy if exists storage_capa_bridge_update_manage on storage.objects;
create policy storage_capa_bridge_update_manage
  on storage.objects for update to authenticated
  using (
    bucket_id = 'kpi-evidence'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  )
  with check (
    bucket_id = 'kpi-evidence'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );

drop policy if exists storage_capa_bridge_delete_manage on storage.objects;
create policy storage_capa_bridge_delete_manage
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'kpi-evidence'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );
