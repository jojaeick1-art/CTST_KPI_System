-- CTST KPI: 앱이 기대하는 최소 스키마 (Supabase SQL Editor에서 실행 후 RLS 조정)
-- 실제 컬럼명이 다르면 kpi-queries.ts / types 를 맞춰 주세요.

-- create table public.departments (
--   id uuid primary key default gen_random_uuid(),
--   name text not null
-- );

-- create table public.kpi_items (
--   id uuid primary key default gen_random_uuid(),
--   dept_id uuid not null references public.departments (id) on delete cascade,
--   main_topic text,
--   sub_topic text  -- KPI 항목명 등
-- );

-- 실적(달성률·증빙·설명)·승인은 모두 kpi_targets 한 행에 저장합니다. kpi_performances 테이블은 사용하지 않습니다.

-- profiles.role 예시: admin, ceo, team_leader, group_leader, principal, manager, senior, pro
-- 레거시: leader → 앱에서 team_leader 로 정규화, employee → pro
-- alter table public.profiles add column if not exists dept_id uuid references public.departments (id);

-- create table public.kpi_targets (
--   id uuid primary key default gen_random_uuid(),
--   kpi_id uuid not null references public.kpi_items (id) on delete cascade,
--   year int,  -- 선택: 연도별 (앱은 CURRENT_KPI_YEAR 로 필터)
--   half_type text,  -- H1/H2 (없으면 연도당 1행으로 간주, UI는 상·하반기 동일 행 매핑)
--   h1_result numeric, h1_rate numeric,  -- 상반기 실적(달성률) — 동일 값으로 저장
--   h2_result numeric, h2_rate numeric,  -- 하반기 실적(달성률)
--   evidence_url text,
--   remarks text,  -- 특이사항
--   h1_target text,
--   h1_rate numeric,
--   h1_effect text,
--   h2_target text,
--   h2_rate numeric,
--   h2_effect text,
--   challenge_goal text,
--   remarks text,
--   approval_step text default 'draft',  -- draft | pending_primary | pending_final | approved
--   rejection_reason text
-- );
-- approval_step 값: draft, pending_primary, pending_final, approved (레거시 pending 은 1차 대기로 취급)
-- 이미 생성된 DB라면 FK를 cascade로 교체:
-- alter table public.kpi_targets
--   drop constraint if exists kpi_targets_kpi_id_fkey;
-- alter table public.kpi_targets
--   add constraint kpi_targets_kpi_id_fkey
--   foreign key (kpi_id) references public.kpi_items(id) on delete cascade;

-- create table public.system_settings (
--   id uuid primary key default gen_random_uuid(),
--   quarter text not null unique, -- 예: 25Y 1Q
--   input_deadline date,
--   created_at timestamptz default now(),
--   updated_at timestamptz default now()
-- );

-- RLS 예시: 로그인 사용자만 읽기
-- alter table public.departments enable row level security;
-- create policy "departments_read_authed" on public.departments for select to authenticated using (true);
