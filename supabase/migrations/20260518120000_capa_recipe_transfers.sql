-- CAPA 레시피 로컬 위젯 브리지 전달 큐 (Storage는 전달 매개만, 상세는 TTL·삭제로 정리)

create table if not exists public.capa_recipe_transfers (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('recipe_save', 'recipe_load')),
  storage_path text null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'error')),
  signed_url text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capa_recipe_transfers_requested_by_created_idx
  on public.capa_recipe_transfers(requested_by, created_at desc);

create index if not exists capa_recipe_transfers_status_created_idx
  on public.capa_recipe_transfers(status, created_at asc);

alter table public.capa_recipe_transfers enable row level security;

drop policy if exists capa_recipe_transfers_insert_own on public.capa_recipe_transfers;
create policy capa_recipe_transfers_insert_own
  on public.capa_recipe_transfers for insert to authenticated
  with check (requested_by = auth.uid());

drop policy if exists capa_recipe_transfers_select_own_or_admin on public.capa_recipe_transfers;
create policy capa_recipe_transfers_select_own_or_admin
  on public.capa_recipe_transfers for select to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_normalize_role(p.role::text) = 'admin'
    )
  );

drop policy if exists capa_recipe_transfers_admin_update on public.capa_recipe_transfers;
create policy capa_recipe_transfers_admin_update
  on public.capa_recipe_transfers for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_normalize_role(p.role::text) = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_normalize_role(p.role::text) = 'admin'
    )
  );
