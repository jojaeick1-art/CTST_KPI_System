-- 엑셀 상·하반기 "목표 %"를 h1_rate/h2_rate와 분리 (2Q·4Q 실적 컬럼과 충돌 방지)
-- 적용 후 Supabase → Settings → API → Reload schema
alter table public.kpi_targets
  add column if not exists h1_target_pct double precision,
  add column if not exists h2_target_pct double precision;

comment on column public.kpi_targets.h1_target_pct is
  '상반기 목표 달성률(%) — 엑셀 firstHalfRate. 실적(2Q)은 h1_rate';
comment on column public.kpi_targets.h2_target_pct is
  '하반기 목표 달성률(%) — 엑셀 secondHalfRate. 실적(4Q)은 h2_rate';

-- 제출 전(draft) + 1Q 실적 없음: 예전에 목표%만 h1_rate에 들어간 행 → 목표 컬럼으로 이동
UPDATE public.kpi_targets
SET h1_target_pct = h1_rate,
    h1_rate = NULL
WHERE h1_target_pct IS NULL
  AND h1_result IS NULL
  AND h1_rate IS NOT NULL
  AND COALESCE(NULLIF(btrim(approval_step::text), ''), 'draft') = 'draft';

UPDATE public.kpi_targets
SET h2_target_pct = h2_rate,
    h2_rate = NULL
WHERE h2_target_pct IS NULL
  AND h2_result IS NULL
  AND h2_rate IS NOT NULL
  AND COALESCE(NULLIF(btrim(approval_step::text), ''), 'draft') = 'draft';
