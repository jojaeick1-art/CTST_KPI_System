-- RLS 강화: 조회는 전 부서 허용, 쓰기는 소속 부서만 허용
-- 목적:
-- 1) 모든 계정이 전 부서 KPI 조회 가능
-- 2) 실적 등록/수정/승인/반려는 본인 소속 부서 KPI만 가능
-- 3) 클라이언트 우회 호출(직접 API 호출)도 서버에서 차단

-- role 정규화(레거시/한글 포함)
create or replace function public.ctst_normalize_role(input_role text)
returns text
language sql
stable
as $$
  select
    case coalesce(trim(input_role), '')
      when 'leader' then 'team_leader'
      when 'employee' then 'pro'
      when '관리자' then 'admin'
      when '대표' then 'ceo'
      when '팀장' then 'team_leader'
      when '그룹장' then 'group_leader'
      when '수석' then 'principal'
      when '책임' then 'manager'
      when '선임' then 'senior'
      when '프로' then 'pro'
      when '리더' then 'team_leader'
      when '직원' then 'pro'
      else lower(coalesce(trim(input_role), ''))
    end;
$$;

-- KPI 쓰기 허용 role (정책상: 쓰기는 소속 부서 범위 내에서만)
create or replace function public.ctst_can_write_kpi(role_text text)
returns boolean
language sql
stable
as $$
  select public.ctst_normalize_role(role_text) in (
    'admin', 'group_leader', 'team_leader', 'principal', 'manager', 'senior', 'pro'
  );
$$;

alter table public.kpi_items enable row level security;
alter table public.kpi_targets enable row level security;

-- 기존 정책 정리 (이름 충돌 방지)
drop policy if exists kpi_items_select_all_authed on public.kpi_items;
drop policy if exists kpi_items_write_own_department on public.kpi_items;
drop policy if exists kpi_items_delete_admin_only on public.kpi_items;
drop policy if exists kpi_targets_select_all_authed on public.kpi_targets;
drop policy if exists kpi_targets_write_own_department on public.kpi_targets;
drop policy if exists kpi_targets_delete_admin_only on public.kpi_targets;

-- 조회: 인증 사용자면 전 부서 조회 허용
create policy kpi_items_select_all_authed
on public.kpi_items
for select
to authenticated
using (true);

create policy kpi_targets_select_all_authed
on public.kpi_targets
for select
to authenticated
using (true);

-- kpi_items 쓰기: 본인 소속 부서 + 작성 가능 role
create policy kpi_items_write_own_department
on public.kpi_items
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.dept_id = kpi_items.dept_id
      and public.ctst_can_write_kpi(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.dept_id = kpi_items.dept_id
      and public.ctst_can_write_kpi(p.role::text)
  )
);

-- kpi_targets 쓰기: 연결된 kpi_items.dept_id 가 본인 dept_id 와 같을 때만 허용
create policy kpi_targets_write_own_department
on public.kpi_targets
for all
to authenticated
using (
  exists (
    select 1
    from public.kpi_items ki
    join public.profiles p on p.id = auth.uid()
    where ki.id = kpi_targets.kpi_id
      and p.dept_id = ki.dept_id
      and public.ctst_can_write_kpi(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.kpi_items ki
    join public.profiles p on p.id = auth.uid()
    where ki.id = kpi_targets.kpi_id
      and p.dept_id = ki.dept_id
      and public.ctst_can_write_kpi(p.role::text)
  )
);

-- 관리자 유지보수(초기화 등)용 삭제 권한
create policy kpi_items_delete_admin_only
on public.kpi_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
);

create policy kpi_targets_delete_admin_only
on public.kpi_targets
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_normalize_role(p.role::text) = 'admin'
  )
);
