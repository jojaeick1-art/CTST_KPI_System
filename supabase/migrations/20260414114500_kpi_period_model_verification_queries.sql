-- Post-migration verification queries (manual run)

-- 1) new columns existence quick check
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'kpi_items'
  and column_name in (
    'period_start_month',
    'period_end_month',
    'target_direction',
    'target_final_value',
    'status',
    'extended_from_month',
    'extended_reason'
  )
order by column_name;

-- 2) constraints check
select conname
from pg_constraint
where conname in (
  'kpi_items_period_start_month_chk',
  'kpi_items_period_end_month_chk',
  'kpi_items_period_range_chk',
  'kpi_items_target_direction_chk',
  'kpi_items_status_chk'
)
order by conname;

-- 3) milestone table/index check
select tablename
from pg_tables
where schemaname = 'public'
  and tablename = 'kpi_milestones';

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'kpi_milestones'
order by indexname;
