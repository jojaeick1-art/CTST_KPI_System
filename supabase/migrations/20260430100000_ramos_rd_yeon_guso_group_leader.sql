-- RAmosR&D · 연구소: DB profiles.role 은 `그룹장`(enum) 유지, 앱에서만 group_team_leader 로 병합 인식.
-- (PostgreSQL: enum 값 추가와 동일 트랜잭션 내 UPDATE 는 55P04 — 커밋 전에는 새 라벨 사용 불가)

-- `그룹장/팀장` 라벨을 별도 세션에서 추가한 뒤 쓰는 경우를 대비한 정규화(선택)
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
      when '그룹장/팀장' then 'group_team_leader'
      when '수석' then 'principal'
      when '책임' then 'manager'
      when '선임' then 'senior'
      when '프로' then 'pro'
      when '리더' then 'team_leader'
      when '직원' then 'pro'
      else lower(coalesce(trim(input_role), ''))
    end;
$$;

create or replace function public.ctst_can_write_kpi(role_text text)
returns boolean
language sql
stable
as $$
  select public.ctst_normalize_role(role_text) in (
    'admin',
    'group_leader',
    'group_team_leader',
    'team_leader',
    'principal',
    'manager',
    'senior',
    'pro'
  );
$$;

-- 연구소 소속만 보장 (role 은 이미 그룹장이라면 그대로 둠)
update public.profiles as p
set
  dept_id = d.id
from public.departments as d
where trim(d.name) = '연구소'
  and (
    lower(trim(p.username)) = lower(trim('RAmosR&D'))
    or lower(trim(coalesce(p.full_name, ''))) = lower(trim('RAmosR&D'))
  );
