-- KPI VOC: 모든 로그인 사용자가 전체 접수 건을 조회할 수 있음(목록은 클라이언트에서 '내 것만' 필터 가능).
-- 기존: 본인 건 또는 관리자만 SELECT.

drop policy if exists kpi_voc_requests_select_own_or_admin on public.kpi_voc_requests;
drop policy if exists kpi_voc_requests_select_authenticated on public.kpi_voc_requests;

create policy kpi_voc_requests_select_authenticated
on public.kpi_voc_requests for select
to authenticated
using (true);
