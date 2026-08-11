-- profiles 테이블 RLS 적용
--
-- 문제: profiles 에 RLS 가 꺼져 있어, 로그인한 사용자가 API 를 직접 호출하면
-- 본인의 role 을 '관리자'로 바꾸는 등 권한 상승이 가능했다.
--
-- 조회는 기존과 동일하게 열어둔다(담당자 목록·결재선 후보·로그 필터 등에서
-- 다른 사용자 프로필을 읽어야 함). 쓰기만 관리자로 제한한다.
--
-- 주의: profiles 정책 안에서 profiles 를 다시 조회하면
-- "infinite recursion detected in policy" 오류가 발생한다.
-- 그래서 RLS 를 우회하는 security definer 함수로 관리자 여부를 판정한다.

create or replace function public.ctst_is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and public.ctst_normalize_role(p.role::text) = 'admin'
  );
$$;

revoke all on function public.ctst_is_admin(uuid) from public;
grant execute on function public.ctst_is_admin(uuid) to authenticated;

alter table public.profiles enable row level security;

-- 조회: 인증 사용자면 전체 허용 (기존 동작 유지)
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

-- 쓰기: 관리자만 (계정 관리 화면에서 직급·소속 부서 변경)
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert
on public.profiles
for insert
to authenticated
with check (public.ctst_is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.ctst_is_admin())
with check (public.ctst_is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete
on public.profiles
for delete
to authenticated
using (public.ctst_is_admin());
