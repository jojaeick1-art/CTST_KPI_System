-- CAPA 레시피 전달 큐: 위젯 Realtime 구독 (recipe_save / recipe_load)

alter table public.capa_recipe_transfers replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.capa_recipe_transfers;
exception
  when duplicate_object then null;
end $$;

comment on table public.capa_recipe_transfers is
  'CAPA 레시피 위젯 브리지 — recipe_save: Storage→서버PC backup, recipe_load: backup→Storage';
