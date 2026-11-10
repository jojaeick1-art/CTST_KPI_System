-- 기술 1팀 KPI 가중치 재조정 (합계 132 → 100)
-- 근거: "KPI기술팀 비중 수정.xlsx" (변경할 가중치 컬럼)
-- 대상 행이 기술 1팀 소속인지 확인하고, 적용 후 부서 가중치 합계가 100이 아니면 롤백한다.

do $$
declare
  tech1_id uuid := '49562c52-b07f-438f-820e-6d1864ac8f1b';
  updated_count int;
  total numeric;
begin
  with v(id, w) as (
    values
      ('179852fa-be2b-4ced-8216-c6bb983dadd3'::uuid, 4), -- MEMS Pin Repair 절감 (8→4)
      ('21228ad8-9553-4850-a9cf-a00987d72ad7'::uuid, 5), -- 2Campus Layout 변경 (10→5)
      ('6064aaa6-e881-48d0-9e26-749961ff0bf2'::uuid, 4), -- T5503HS2용 Utility 구축 (8→4)
      ('ee4eeef5-c5a8-4dd4-8173-43a2f5c485f4'::uuid, 5), -- AI활용 Home page 구축 (5)
      ('b4254afb-5549-448a-9457-e4ea605ab076'::uuid, 3), -- Packaging 기술 내재화 (3)
      ('5cbeb375-8246-4f77-bf8f-464f29dc5d94'::uuid, 5), -- Smart Workflow - 문서 디지털화 (5)
      ('63880fcb-0cc0-42b0-bffc-753330609a4a'::uuid, 3), -- Smart Workflow - Traceability 기존 Line (3)
      ('cc759430-077e-4790-92af-6e17be3f11dc'::uuid, 5), -- P-Card 경비 절감 (5)
      ('cea35ba7-c712-4a9e-a09e-da764d79efd6'::uuid, 4), -- SO-DIMM 연배열 개선 (3→4)
      ('d89835c0-6c00-4f97-87a5-a812f9fecfa5'::uuid, 4), -- A100 대응 (3→4)
      ('f098464e-a346-4f38-b132-6b273029929f'::uuid, 5), -- eMMC SLT/QC Test 설비 제작 (10→5)
      ('5533deee-9d90-4639-89ef-3cb41bba0e0a'::uuid, 5), -- eMMC Test CAPA 확보 (10→5)
      ('f3722415-8bee-4004-80d0-80f25907c277'::uuid, 4), -- AI 활용 Die Test 설비 모니터링 (6→4)
      ('fcf67ce1-77b6-4ed9-89a6-8fc2240dc3a8'::uuid, 4), -- SIP/UDP 공정 AMR 도입 (8→4)
      ('a7d49595-d9a7-4fb8-b83b-0b81722a20bf'::uuid, 5), -- Auto 설비 고도화 (3→5)
      ('57fc2b2e-f4f0-4560-87d0-50533ae4237d'::uuid, 5), -- Manual 설비 Auto화 (5)
      ('4c923889-0e20-41f8-b16e-80165816e253'::uuid, 5), -- AVDT 선행 기술 개발 (10→5)
      ('c50707f4-cb87-43b0-baed-233a18bcbca2'::uuid, 5), -- PKG AVI 제작 (10→5)
      ('251d847e-4a9b-45e7-8172-0459228600a3'::uuid, 5), -- Module & SSD AVI 설비 제작 (5)
      ('f413500d-b0c2-4afa-8e33-520064e84bc3'::uuid, 4), -- SMT Module+SSD 3D AOI도입 (3→4)
      ('492fb601-e01c-4851-981d-2eb4db847649'::uuid, 4), -- SMT Traceability 신규 Line (3→4)
      ('e0eb2f9b-41c8-4729-8579-5d25ddf8c602'::uuid, 4), -- ESD 전문가 육성 (3→4)
      ('1264bc9d-a2be-4289-bd4c-c1ee3c9c5b8c'::uuid, 3)  -- COPQ 절감 Reuse Item확대 (3)
  )
  update public.kpi_items k
     set weight = v.w
    from v
   where k.id = v.id
     and k.dept_id = tech1_id;

  get diagnostics updated_count = row_count;
  if updated_count <> 23 then
    raise exception '기술 1팀 가중치 갱신 대상 불일치: % 건 (예상 23건)', updated_count;
  end if;

  select coalesce(sum(weight), 0) into total
    from public.kpi_items
   where dept_id = tech1_id;

  if total <> 100 then
    raise exception '기술 1팀 가중치 합계가 100이 아닙니다: %', total;
  end if;
end $$;
