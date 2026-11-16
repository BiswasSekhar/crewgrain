-- Follow-up to 202611110013: the snapshot scans daily_counts and assignments by
-- unit, employee and date for every refresh. Add the indexes it needs, and trim
-- dated assignments to the same 62 day window as the other history lists.
create index if not exists daily_counts_unit_date on public.daily_counts(unit_id,work_date);
create index if not exists daily_counts_employee_date on public.daily_counts(employee_id,work_date);
create index if not exists assignments_unit_date on public.assignments(unit_id,work_date);
create index if not exists assignments_employee_date on public.assignments(employee_id,work_date);

create or replace function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=public.get_app_snapshot_all_history();result jsonb:=base;k text;
 v_from date:=(now() at time zone 'Asia/Kolkata')::date-62;
begin
 foreach k in array array['counts','days','entries','adjustments','corrections','reports','employeeMoney','teamMoney','assignments'] loop
  if jsonb_typeof(base->k)='array' then result:=result||jsonb_build_object(k,private.window_rows(base->k,v_from));end if;
 end loop;
 return result;
end $$;
revoke all on function public.get_app_snapshot() from public,anon;
grant execute on function public.get_app_snapshot() to authenticated,service_role;
