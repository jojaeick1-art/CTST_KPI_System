-- 품질팀 (QE) 김민규(kmg): profiles.role 을 그룹장으로 승격 (RLS·승인 권한용).
-- 앱 UI 는 fetchDashboardProfile 에서 동일 계정을 group_leader 로 인식.

update public.profiles as p
set role = '그룹장'
where p.id = '6e8a4792-6cf5-4120-b439-35a37be23e7f'::uuid
   or (
     lower(trim(coalesce(p.username, ''))) = 'kmg'
     and trim(coalesce(p.full_name, '')) = '김민규'
   );

-- 소속이 품질팀 (QE) 가 아니면 맞춤 (이미 동일하면 no-op)
update public.profiles as p
set dept_id = d.id
from public.departments as d
where p.id = '6e8a4792-6cf5-4120-b439-35a37be23e7f'::uuid
  and regexp_replace(lower(trim(d.name)), '\s+', '', 'g') = '품질팀(qe)';
