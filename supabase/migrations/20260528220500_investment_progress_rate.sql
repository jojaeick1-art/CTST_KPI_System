-- 투자 심의 건별 달성률(%) 수기 입력

alter table public.investment_projects
  add column if not exists progress_rate numeric(5,2) null
  check (progress_rate is null or (progress_rate >= 0 and progress_rate <= 100));
