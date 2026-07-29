-- 정영석: 기술 1팀(기존 소속 유지) + R&D 겸임 그룹장 권한 부여
-- 김현빈, 배준혁: 기술 1팀 → R&D 부서 이동 (역할은 유지)

insert into public.profile_department_roles (profile_id, dept_id, role)
values (
  '31a7b770-8dcf-427d-b073-2f516301d7ab', -- 정영석 (nanfast)
  'a3583b71-52bc-4a49-8b82-1fee50f9d8d1', -- R&D
  '그룹장'
)
on conflict (profile_id, dept_id, role) do nothing;

update public.profiles
set dept_id = 'a3583b71-52bc-4a49-8b82-1fee50f9d8d1' -- R&D
where id in (
  'f37335f1-c227-4359-ad69-1ff3bcc17e31', -- 김현빈 (khb)
  '93477e1a-6df7-41f3-8401-71665e5d730b'  -- 배준혁 (bjh)
);
