-- 개인 결재라인 템플릿 (본인만 CRUD)
create table if not exists public.approval_line_templates (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  approver_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_line_templates_name_nonempty check (length(trim(name)) > 0)
);

create index if not exists approval_line_templates_owner_idx
  on public.approval_line_templates (owner_profile_id);

alter table public.approval_line_templates enable row level security;

drop policy if exists approval_line_templates_select_own
  on public.approval_line_templates;
create policy approval_line_templates_select_own
  on public.approval_line_templates
  for select
  to authenticated
  using (owner_profile_id = auth.uid());

drop policy if exists approval_line_templates_insert_own
  on public.approval_line_templates;
create policy approval_line_templates_insert_own
  on public.approval_line_templates
  for insert
  to authenticated
  with check (owner_profile_id = auth.uid());

drop policy if exists approval_line_templates_update_own
  on public.approval_line_templates;
create policy approval_line_templates_update_own
  on public.approval_line_templates
  for update
  to authenticated
  using (owner_profile_id = auth.uid())
  with check (owner_profile_id = auth.uid());

drop policy if exists approval_line_templates_delete_own
  on public.approval_line_templates;
create policy approval_line_templates_delete_own
  on public.approval_line_templates
  for delete
  to authenticated
  using (owner_profile_id = auth.uid());

comment on table public.approval_line_templates is
  'KPI 실적 결재라인 개인 템플릿. owner만 조회·저장·삭제.';
