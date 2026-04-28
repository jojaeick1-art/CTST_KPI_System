-- VOC 목록: 로그인 사용자 전원이 다른 사람(PRO 등)의 접수 건도 조회 가능해야 함.
-- 조직에서 이전 마이그레이션만 적용되지 않았을 때를 대비해 멱등으로 다시 적용합니다.

drop policy if exists kpi_voc_requests_select_own_or_admin on public.kpi_voc_requests;

drop policy if exists kpi_voc_requests_select_authenticated on public.kpi_voc_requests;

create policy kpi_voc_requests_select_authenticated
on public.kpi_voc_requests for select
to authenticated
using (true);
