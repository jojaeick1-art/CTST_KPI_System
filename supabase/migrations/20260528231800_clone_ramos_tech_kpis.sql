-- 기술팀(RAmos) KPI 항목 2건 복제
-- 요구사항: 첨부파일/실적 포함해서 기존 항목을 동일 경로에 신규 항목으로 복사

do $$
declare
  src record;
  new_kpi_id uuid;
  item_cols text;
  target_cols text;
  milestone_cols text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into item_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'kpi_items'
    and c.column_name <> 'id';

  if item_cols is null then
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

  -- 대상 2개 항목만 선택 (기술팀(RAmos) 우선, 제목 완전일치)
  for src in
    select ki.id
    from public.kpi_items ki
    left join public.departments d on d.id = ki.dept_id
    where ki.sub_topic in (
      'Risk 사전 예방, PKG AVI 제작, MVI율 50% → 직행율 95%↑',
      'Process 혁신 및 자동화, 고도화, AI 활용 Die Test 설비 모니터링, 1PC에서 14대 설비 컨디션 동시 확인'
    )
      and (d.name = '기술팀 (RAmos)' or d.name is null)
  loop
    -- 1) kpi_items 원본 행 복제
    execute format(
      'insert into public.kpi_items (%1$s)
       select %1$s
       from public.kpi_items
       where id = $1
       returning id',
      item_cols
    )
    using src.id
    into new_kpi_id;

    -- 2) kpi_targets(실적/첨부 포함) 복제 + 신규 kpi_id로 연결
    execute format(
      'insert into public.kpi_targets (kpi_id, %1$s)
       select $2, %1$s
       from public.kpi_targets
       where kpi_id = $1',
      target_cols
    )
    using src.id, new_kpi_id;

    -- 3) kpi_milestones 존재 시 함께 복제
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
end
$$;

