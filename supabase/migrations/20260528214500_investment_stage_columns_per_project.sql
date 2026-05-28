-- 투자 단계 컬럼을 건별(project별)로 관리

alter table public.investment_stage_columns
  add column if not exists project_id uuid references public.investment_projects(id) on delete cascade;

do $$
declare
  first_project_id uuid;
begin
  select id into first_project_id
  from public.investment_projects
  order by sort_order asc
  limit 1;

  if first_project_id is not null then
    update public.investment_stage_columns
    set project_id = first_project_id
    where project_id is null;
  end if;
end $$;

create index if not exists investment_stage_columns_project_sort_idx
  on public.investment_stage_columns(project_id, sort_order);

drop index if exists investment_stage_columns_sort_idx;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'investment_stage_columns_name_key'
      and conrelid = 'public.investment_stage_columns'::regclass
  ) then
    alter table public.investment_stage_columns
      drop constraint investment_stage_columns_name_key;
  end if;
end $$;

alter table public.investment_stage_columns
  add constraint investment_stage_columns_project_name_key unique (project_id, name);
