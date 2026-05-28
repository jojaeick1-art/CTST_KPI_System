-- CAPA 공정 그룹 작성자/수정자 추적 컬럼

alter table public.capa_process_groups
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

comment on column public.capa_process_groups.created_by is
  '공정 그룹 최초 생성 사용자';
comment on column public.capa_process_groups.updated_by is
  '공정 그룹 최종 수정 사용자';
