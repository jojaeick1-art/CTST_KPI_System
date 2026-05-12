-- 2Campus 주간 실적 증빙 + 공사 일정 갱신

alter table public.campus2_schedule_weekly
  add column if not exists evidence_url text null,
  add column if not exists evidence_urls text[] null,
  add column if not exists evidence_original_filenames text[] null;

update public.campus2_schedule_tasks as t
set
  title = v.title,
  plan_start = v.plan_start::date,
  plan_end = v.plan_end::date
from (
  values
    (1, '구매 및 제작 자재 준비', '2026-04-18', '2026-05-09'),
    (2, 'SMT Line 공사 우선 진행', '2026-04-18', '2026-05-26'),
    (3, '신형 SMT Line Set-up', '2026-05-27', '2026-06-05'),
    (4, '2층 SMT Line 이전 및 Set-up', '2026-06-08', '2026-06-13'),
    (5, '1층 잔여 구역 공사', '2026-05-27', '2026-06-07'),
    (6, '2층 Advan T5588 이전 및 Set-up', '2026-06-08', '2026-06-14'),
    (7, '2층 Auto P-RDT, LPDDR, Laser M/K 설비 이전 및 Set-up', '2026-06-06', '2026-06-12'),
    (8, '2층 Layout, 전기, 공조, 공압 공사', '2026-06-09', '2026-06-12'),
    (9, '1Camps Die Tester 36Para 이전 및 Set-up', '2026-06-13', '2026-06-20')
) as v(sort_order, title, plan_start, plan_end)
where t.sort_order = v.sort_order;
