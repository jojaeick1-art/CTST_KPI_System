-- CAPA 레시피 Storage 버킷 분리: kpi-evidence -> capa-recipes

insert into storage.buckets (id, name, public)
values ('capa-recipes', 'capa-recipes', false)
on conflict (id) do nothing;

-- 구 정책 정리 (kpi-evidence/capa-bridge/*)
drop policy if exists storage_capa_bridge_select on storage.objects;
drop policy if exists storage_capa_bridge_insert_manage on storage.objects;
drop policy if exists storage_capa_bridge_update_manage on storage.objects;
drop policy if exists storage_capa_bridge_delete_manage on storage.objects;

-- 신 정책: capa-recipes 버킷의 capa-bridge/* 만 CAPA 권한으로 제어
create policy storage_capa_bridge_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'capa-recipes'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_run_capa_simulator(p.role::text)
    )
  );

create policy storage_capa_bridge_insert_manage
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'capa-recipes'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );

create policy storage_capa_bridge_update_manage
  on storage.objects for update to authenticated
  using (
    bucket_id = 'capa-recipes'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  )
  with check (
    bucket_id = 'capa-recipes'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );

create policy storage_capa_bridge_delete_manage
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'capa-recipes'
    and (storage.foldername(name))[1] = 'capa-bridge'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.ctst_can_manage_capa_recipe(p.role::text)
    )
  );
