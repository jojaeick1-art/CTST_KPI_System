-- 기술팀(RAmos) KPI 2건을 "기술 1팀"으로 복제
-- 부서명/문구 오차를 고려해 유연 매칭하며, 대상에 동일 sub_topic이 있으면 중복 생성하지 않는다.

do $$
declare
  src record;
  src_dept_id uuid;
  target_dept_ids uuid[];
  target_dept_id uuid;
  new_kpi_id uuid;
  item_copy_cols text;
  target_cols text;
  milestone_cols text;
begin
  -- 1) 원본 부서: "기술팀 (RAmos)" 계열
  select d.id
    into src_dept_id
  from public.departments d
  where replace(lower(d.name), ' ', '') like '%기술팀%(ramos)%'
     or (lower(d.name) like '%기술%' and lower(d.name) like '%ramos%')
  order by d.name
  limit 1;

  if src_dept_id is null then
    raise exception '원본 부서(기술팀 RAmos)를 찾지 못했습니다. departments.name 값을 확인해 주세요.';
  end if;

  -- 2) 대상 부서: 기술 1팀 / 기술팀 계열(원본 RAmos 제외)
  select array_agg(d.id order by case
      when replace(d.name, ' ', '') = '기술1팀' then 1
      when d.name = '기술팀' then 2
      else 99
    end, d.name)
    into target_dept_ids
  from public.departments d
  where d.id <> src_dept_id
    and (
      replace(d.name, ' ', '') = '기술1팀'
      or d.name = '기술팀'
    );

  -- 없으면 기술 1팀 생성 후 대상에 포함
  if coalesce(array_length(target_dept_ids, 1), 0) = 0 then
    insert into public.departments(name)
    values ('기술 1팀')
    returning id into target_dept_id;
    target_dept_ids := array[target_dept_id];
  end if;

  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into item_copy_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'kpi_items'
    and c.column_name not in ('id', 'dept_id');

  if item_copy_cols is null then
    raise exception 'kpi_items 컬럼 정보를 찾지 못했습니다.';
  end if;

  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into target_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'kpi_targets'
    and c.column_name not in ('id', 'kpi_id');

  if target_cols is null then
    raise exception 'kpi_targets 컬럼 정보를 찾지 못했습니다.';
  end if;

  for src in
    select ki.*
    from public.kpi_items ki
    where ki.dept_id = src_dept_id
      and (
        ki.sub_topic = 'Risk 사전 예방, PKG AVI 제작, MVI율 50% → 직행율 95%↑'
        or ki.main_topic = 'Risk 사전 예방, PKG AVI 제작, MVI율 50% → 직행율 95%↑'
        or ki.sub_topic = 'Process 혁신 및 자동화, 고도화, AI 활용 Die Test 설비 모니터링, 1PC에서 14대 설비 컨디션 동시 확인'
        or ki.main_topic = 'Process 혁신 및 자동화, 고도화, AI 활용 Die Test 설비 모니터링, 1PC에서 14대 설비 컨디션 동시 확인'
        or (
          (coalesce(ki.sub_topic,'') || ' ' || coalesce(ki.main_topic,'')) ilike '%Risk 사전 예방%'
          and (coalesce(ki.sub_topic,'') || ' ' || coalesce(ki.main_topic,'')) ilike '%PKG AVI%'
          and (
            (coalesce(ki.sub_topic,'') || ' ' || coalesce(ki.main_topic,'')) ilike '%직행율 95%'
            or (coalesce(ki.sub_topic,'') || ' ' || coalesce(ki.main_topic,'')) ilike '%직행률 95%'
          )
        )
        or (
          (coalesce(ki.sub_topic,'') || ' ' || coalesce(ki.main_topic,'')) ilike '%Process 혁신 및 자동화%'
          and (coalesce(ki.sub_topic,'') || ' ' || coalesce(ki.main_topic,'')) ilike '%Die Test 설비 모니터링%'
          and (coalesce(ki.sub_topic,'') || ' ' || coalesce(ki.main_topic,'')) ilike '%1PC%14대%'
        )
      )
    order by ki.created_at desc nulls last, ki.id desc
  loop
    foreach target_dept_id in array target_dept_ids
    loop
      -- 대상 부서에 같은 KPI(제목)가 이미 있으면 스킵
      if exists (
        select 1
        from public.kpi_items t
        where t.dept_id = target_dept_id
          and coalesce(t.sub_topic,'') = coalesce(src.sub_topic,'')
          and coalesce(t.main_topic,'') = coalesce(src.main_topic,'')
      ) then
        continue;
      end if;

      execute format(
        'insert into public.kpi_items (dept_id, %1$s)
         select $2, %1$s
         from public.kpi_items
         where id = $1
         returning id',
        item_copy_cols
      )
      using src.id, target_dept_id
      into new_kpi_id;

      execute format(
        'insert into public.kpi_targets (kpi_id, %1$s)
         select $2, %1$s
         from public.kpi_targets
         where kpi_id = $1',
        target_cols
      )
      using src.id, new_kpi_id;

      if to_regclass('public.kpi_milestones') is not null then
        select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
          into milestone_cols
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'kpi_milestones'
          and c.column_name not in ('id', 'kpi_id');

        if milestone_cols is not null then
          execute format(
            'insert into public.kpi_milestones (kpi_id, %1$s)
             select $2, %1$s
             from public.kpi_milestones
             where kpi_id = $1',
            milestone_cols
          )
          using src.id, new_kpi_id;
        end if;
      end if;
    end loop;
  end loop;
end
$$;

