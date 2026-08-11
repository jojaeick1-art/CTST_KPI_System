-- 공사 메뉴: 여러 공사 프로젝트 관리
-- - construction_projects: 공사 항목(제목/세부내용/담당자/상태)
-- - campus2_schedule_tasks: 프로젝트 연결 + 주요공사별 공사비용·진행률·상태·증빙
-- 총 공사비용과 진행률은 주요공사 값에서 자동 계산하므로 프로젝트에 별도 컬럼을 두지 않는다.

create table if not exists public.construction_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  manager_name text null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'hold', 'drop')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists construction_projects_sort_idx
  on public.construction_projects(sort_order, created_at);

alter table public.campus2_schedule_tasks
  add column if not exists project_id uuid null
    references public.construction_projects(id) on delete cascade,
  add column if not exists cost numeric not null default 0 check (cost >= 0),
  add column if not exists progress_rate numeric not null default 0
    check (progress_rate >= 0 and progress_rate <= 100),
  add column if not exists status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'hold', 'drop')),
  add column if not exists evidence_urls text[] null,
  add column if not exists evidence_original_filenames text[] null;

create index if not exists campus2_schedule_tasks_project_idx
  on public.campus2_schedule_tasks(project_id, sort_order);

alter table public.construction_projects enable row level security;

drop policy if exists construction_projects_select_authenticated on public.construction_projects;
create policy construction_projects_select_authenticated
on public.construction_projects
for select
to authenticated
using (true);

drop policy if exists construction_projects_write_privileged on public.construction_projects;
create policy construction_projects_write_privileged
on public.construction_projects
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_campus2_schedule(p.role::text)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.ctst_can_edit_campus2_schedule(p.role::text)
  )
);

-- 기존 단일 공사(CTST 2Campus)를 프로젝트 1건으로 승격하고 기존 주요공사를 연결
insert into public.construction_projects (title, description, manager_name, sort_order)
select 'CTST 2Campus 공사 일정', null, null, 1
where not exists (select 1 from public.construction_projects);

update public.campus2_schedule_tasks t
set project_id = (
  select p.id
  from public.construction_projects p
  order by p.sort_order, p.created_at
  limit 1
)
where t.project_id is null;

-- 기존 종합 달성률(수동 입력값)을 주요공사 진행률 초기값으로 이관.
-- 최초 1회만 동작해야 한다. 재실행 시 진행률 0%인 신규 주요공사를 덮어쓰지 않도록
-- "아직 아무 주요공사도 진행률을 갖고 있지 않은 상태"에서만 적용한다.
update public.campus2_schedule_tasks t
set progress_rate = coalesce(
  (
    select s.overall_achievement_rate
    from public.campus2_schedule_summary s
    order by s.year desc
    limit 1
  ),
  0
)
where t.progress_rate = 0
  and not exists (
    select 1
    from public.campus2_schedule_tasks x
    where x.progress_rate > 0
  );
