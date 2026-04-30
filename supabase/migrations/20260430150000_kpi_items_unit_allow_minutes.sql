-- KPI unit: 데이터 정규화 후 CHECK (앱 kpi-create-modal baseline 과 동일하게 수율(%) 포함)
--
-- ⚠ 순서가 중요합니다. 기존 kpi_items_unit_chk 는 '시간'만 허용하고 '시간(hr)' 은 비허용입니다.
--    UPDATE 로 값을 바꾸기 전에 반드시 DROP CONSTRAINT 를 먼저 실행하세요.
--    (그렇지 않으면 23514: new row violates check constraint — 갱신 후 행이 옛 제약에 걸림)

alter table public.kpi_items
  drop constraint if exists kpi_items_unit_chk;

-- 공백-only 는 NULL 로
update public.kpi_items
set unit = null
where unit is not null and trim(unit) = '';

-- 앞뒤 공백 제거
update public.kpi_items
set unit = trim(unit)
where unit is not null and unit <> trim(unit);

-- 레거시 단축 표기 → canonical
update public.kpi_items
set unit = '분(min)'
where unit is not null
  and regexp_replace(unit, '^[[:space:]]+|[[:space:]]+$', '', 'g') = '분';

update public.kpi_items
set unit = '시간(hr)'
where unit is not null
  and regexp_replace(unit, '^[[:space:]]+|[[:space:]]+$', '', 'g') = '시간';

update public.kpi_items
set unit = '시간(hr)'
where unit is not null
  and regexp_replace(unit, '^[[:space:]]+|[[:space:]]+$', '', 'g') = '시간(hr)';

update public.kpi_items
set unit = '분(min)'
where unit is not null
  and regexp_replace(unit, '^[[:space:]]+|[[:space:]]+$', '', 'g') = '분(min)';

alter table public.kpi_items
  add constraint kpi_items_unit_chk
  check (
    unit is null
    or unit in (
      '%',
      '수율(%)',
      'PPM',
      'ea',
      '건',
      '명',
      'k',
      '억',
      '시간(hr)',
      'UPH',
      '분(min)'
    )
  );

comment on column public.kpi_items.unit is
  'Display/input unit: %, 수율(%), PPM, ea, 건, 명, k, 억, 시간(hr), UPH, 분(min).';
