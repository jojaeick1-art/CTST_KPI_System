-- 첨부파일 다운로드 요청 큐.
-- 클라이언트는 storage_path를 넣고, 로컬/백엔드 위젯은 signed_url을 채운 뒤 status를 ready로 변경한다.

create table if not exists public.download_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'error')),
  signed_url text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.download_requests
  add column if not exists requested_by uuid default auth.uid() references public.profiles(id) on delete cascade,
  add column if not exists storage_path text,
  add column if not exists status text default 'pending',
  add column if not exists signed_url text,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists download_requests_requested_by_created_idx
on public.download_requests(requested_by, created_at desc);

create index if not exists download_requests_status_created_idx
on public.download_requests(status, created_at asc);

alter table public.download_requests enable row level security;

drop policy if exists download_requests_insert_own
on public.download_requests;

create policy download_requests_insert_own
on public.download_requests
for insert
to authenticated
with check (requested_by = auth.uid());

drop policy if exists download_requests_select_own_or_admin
on public.download_requests;

create policy download_requests_select_own_or_admin
on public.download_requests
for select
to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
);

drop policy if exists download_requests_admin_update
on public.download_requests;

create policy download_requests_admin_update
on public.download_requests
for update
to authenticated
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
