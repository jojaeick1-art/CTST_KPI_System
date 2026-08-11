-- KPI 항목 부서 이동 전용 함수
--
-- 배경: kpi_items 쓰기 정책(kpi_items_write_own_department)의 WITH CHECK 는
-- "관리자이거나, 변경된 행의 dept_id 가 본인 소속" 일 때만 통과한다.
-- 그래서 그룹장·팀장이 본인 부서 KPI 를 '다른 부서'로 옮기면 변경 후 행이
-- 본인 소속이 아니게 되어 항상 RLS 위반이 발생한다.
--
-- 정책을 느슨하게 푸는 대신, 출발 부서 권한을 검증한 뒤 이동만 수행하는
-- security definer 함수를 두어 안전하게 허용한다.

create or replace function public.ctst_move_kpi_items_to_department(
  p_item_ids uuid[],
  p_target_dept_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_normalized text;
  v_is_admin boolean;
  v_moved integer;
begin
  if p_target_dept_id is null then
    raise exception '이동할 부서를 선택해 주세요.';
  end if;
  if p_item_ids is null or coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception '이동할 KPI 항목을 선택해 주세요.';
  end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is null then
    raise exception '로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.';
  end if;

  v_normalized := public.ctst_normalize_role(v_role);
  if v_normalized not in ('admin', 'group_leader', 'team_leader', 'group_team_leader') then
    raise exception 'KPI 항목 이동은 관리자·그룹장·팀장만 가능합니다.';
  end if;
  v_is_admin := v_normalized = 'admin';

  if not exists (select 1 from public.departments d where d.id = p_target_dept_id) then
    raise exception '이동할 부서를 찾을 수 없습니다.';
  end if;

  -- 관리자가 아니면 선택한 모든 항목이 본인 담당 부서 소속이어야 한다.
  if not v_is_admin and exists (
    select 1
    from public.kpi_items ki
    where ki.id = any(p_item_ids)
      and not public.ctst_profile_has_department(auth.uid(), ki.dept_id)
  ) then
    raise exception '본인 담당 부서의 KPI 항목만 이동할 수 있습니다.';
  end if;

  update public.kpi_items
  set dept_id = p_target_dept_id
  where id = any(p_item_ids);

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

revoke all on function public.ctst_move_kpi_items_to_department(uuid[], uuid) from public;
grant execute on function public.ctst_move_kpi_items_to_department(uuid[], uuid) to authenticated;
