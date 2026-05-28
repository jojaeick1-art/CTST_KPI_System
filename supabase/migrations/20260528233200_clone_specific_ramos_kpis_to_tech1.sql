-- 기술팀(RAmos) 특정 KPI 2건을 기술 1팀으로 강제 복제 (ID 고정, 스키마 자동 대응)
-- 확인된 원본:
-- 1) c50707fc-cb87-43b0-baed-233a18bc6ca2
-- 2) 3f722415-8bee-4004-80d0-80f25907c2f7

do $$
declare
  src_ids uuid[] := array[
    'c50707fc-cb87-43b0-baed-233a18bc6ca2'::uuid,
    '3f722415-8bee-4004-80d0-80f25907c2f7'::uuid
  ];
  src_id uuid;
  target_dept_id uuid;
  new_kpi_id uuid;
  src_rec public.kpi_items%rowtype;
begin
  -- 대상 부서: 기술 1팀 ID 고정 우선 사용 (사용자 확인값)
  target_dept_id := '49562c52-b07f-438f-820e-6d1864ac8f1b'::uuid;

  if not exists (select 1 from public.departments d where d.id = target_dept_id) then
    select d.id
      into target_dept_id
    from public.departments d
    where replace(d.name, ' ', '') = '기술1팀'
    limit 1;
  end if;

  if target_dept_id is null then
    insert into public.departments(name)
    values ('기술 1팀')
    returning id into target_dept_id;
  end if;

  foreach src_id in array src_ids
  loop
    select *
      into src_rec
    from public.kpi_items
    where id = src_id;

    if src_rec.id is null then
      raise notice '원본 KPI가 없습니다: %', src_id;
      continue;
    end if;

    -- 동일 제목(main/sub) 이미 존재하면 스킵
    if exists (
      select 1
      from public.kpi_items t
      where t.dept_id = target_dept_id
        and coalesce(t.main_topic, '') = coalesce(src_rec.main_topic, '')
        and coalesce(t.sub_topic, '') = coalesce(src_rec.sub_topic, '')
    ) then
      continue;
    end if;

    -- kpi_items 복제 (모든 컬럼 자동 매핑, id/dept_id만 교체)
    insert into public.kpi_items
    select (jsonb_populate_record(
      null::public.kpi_items,
      (to_jsonb(s) - 'id' - 'dept_id')
      || jsonb_build_object('dept_id', target_dept_id)
    )).*
    from public.kpi_items s
    where s.id = src_id
    returning id into new_kpi_id;

    -- kpi_targets 복제 (id/kpi_id 교체)
    insert into public.kpi_targets
    select (jsonb_populate_record(
      null::public.kpi_targets,
      (to_jsonb(t) - 'id' - 'kpi_id')
      || jsonb_build_object('kpi_id', new_kpi_id)
    )).*
    from public.kpi_targets t
    where t.kpi_id = src_id;

    -- kpi_milestones 복제 (테이블이 있는 경우)
    if to_regclass('public.kpi_milestones') is not null then
      insert into public.kpi_milestones
      select (jsonb_populate_record(
        null::public.kpi_milestones,
        (to_jsonb(m) - 'id' - 'kpi_id')
        || jsonb_build_object('kpi_id', new_kpi_id)
      )).*
      from public.kpi_milestones m
      where m.kpi_id = src_id;
    end if;
  end loop;
end
$$;

