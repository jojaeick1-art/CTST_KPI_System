-- Set-up 메뉴도 공사와 동일한 다중 항목 구조로 확장
-- - construction_projects 를 category 로 구분해서 공사/Set-up 양쪽에서 사용
-- - smt_setup_schedule_tasks 에 project_id·진행률·상태·증빙 추가 (공사비용 컬럼은 없음)

alter table public.construction_projects
  add column if not exists category text not null default 'construction';

do $$
begin
  alter table public.construction_projects
    add constraint construction_projects_category_chk
    check (category in ('construction', 'setup'));
exception
  when duplicate_object then null;
end $$;

create index if not exists construction_projects_category_sort_idx
  on public.construction_projects(category, sort_order, created_at);

alter table public.smt_setup_schedule_tasks
  add column if not exists project_id uuid null
    references public.construction_projects(id) on delete cascade,
  add column if not exists progress_rate numeric not null default 0
    check (progress_rate >= 0 and progress_rate <= 100),
  add column if not exists status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'hold', 'drop')),
  add column if not exists evidence_urls text[] null,
  add column if not exists evidence_original_filenames text[] null;

create index if not exists smt_setup_schedule_tasks_project_idx
  on public.smt_setup_schedule_tasks(project_id, sort_order);

-- 기존 단일 Set-up 현황을 프로젝트 1건으로 승격하고 기존 일정을 연결
insert into public.construction_projects (title, description, manager_name, sort_order, category)
select 'SMT Line Set-up 현황', null, null, 1, 'setup'
where not exists (
  select 1 from public.construction_projects where category = 'setup'
);

update public.smt_setup_schedule_tasks t
set project_id = (
  select p.id
  from public.construction_projects p
  where p.category = 'setup'
  order by p.sort_order, p.created_at
  limit 1
)
where t.project_id is null;

-- 기존 종합 달성률(수동 입력값)을 각 일정 진행률 초기값으로 이관.
-- 최초 1회만 동작하도록 "아직 아무 일정도 진행률을 갖고 있지 않은 상태"에서만 적용한다.
update public.smt_setup_schedule_tasks t
set progress_rate = coalesce(
  (
    select s.overall_achievement_rate
    from public.smt_setup_schedule_summary s
    order by s.year desc
    limit 1
  ),
  0
)
where t.progress_rate = 0
  and not exists (
    select 1
    from public.smt_setup_schedule_tasks x
    where x.progress_rate > 0
  );
