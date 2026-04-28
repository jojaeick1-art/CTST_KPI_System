-- VOC: 작성자 본인은 유형·우선순위·제목·상세만 수정 가능.
-- 상태·관리자 답변·처리자 등은 비관리자가 변경하지 못하도록 트리거에서 OLD 값 유지.
-- 삭제는 기존 정책대로 관리자만.

create or replace function public.kpi_voc_requests_before_update_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  role_norm text;
begin
  select public.ctst_normalize_role(p.role::text) into role_norm
  from public.profiles p
  where p.id = auth.uid();

  if role_norm = 'admin' then
    return new;
  end if;

  if old.created_by is distinct from auth.uid() then
    raise exception 'VOC를 수정할 권한이 없습니다.';
  end if;

  new.status := old.status;
  new.admin_note := old.admin_note;
  new.handled_by := old.handled_by;
  new.handled_at := old.handled_at;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.created_by_name := old.created_by_name;
  new.dept_id := old.dept_id;
  return new;
end;
$$;

drop trigger if exists kpi_voc_requests_before_update_guard_trg on public.kpi_voc_requests;

create trigger kpi_voc_requests_before_update_guard_trg
before update on public.kpi_voc_requests
for each row execute function public.kpi_voc_requests_before_update_guard();

drop policy if exists kpi_voc_requests_update_own on public.kpi_voc_requests;

create policy kpi_voc_requests_update_own
on public.kpi_voc_requests for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
