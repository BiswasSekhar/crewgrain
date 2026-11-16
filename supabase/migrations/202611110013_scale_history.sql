-- Keep the database and the app fast as history grows.
-- 1. Every tap is already stored in count_events, so it is no longer copied into
--    the audit log (about 10,000 duplicate rows a day for 50 employees).
-- 2. The snapshot sent to phones only carries the last 62 days of dated rows.
--    Anything still waiting for review is always included, however old.
create or replace function private.audit(p_actor uuid,p_action text,p_entity uuid,p_old jsonb,p_new jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_action='count_change' then return;end if;
 insert into public.audit_log(actor_id,action,entity_id,old_record,new_record) values(p_actor,p_action,p_entity,p_old,p_new);
end $$;

create function private.window_rows(p_rows jsonb,p_from date) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(r.value order by r.ord),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality r(value,ord)
 where r.value->>'workDate' is null
  or (r.value->>'workDate')::date>=p_from
  or r.value->>'status' in ('pending','needs_admin','submitted','changes_requested')
$$;
revoke all on function private.window_rows(jsonb,date) from public,anon,authenticated;

alter function public.get_app_snapshot() rename to get_app_snapshot_all_history;
revoke all on function public.get_app_snapshot_all_history() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=public.get_app_snapshot_all_history();result jsonb:=base;k text;
 v_from date:=(now() at time zone 'Asia/Kolkata')::date-62;
begin
 foreach k in array array['counts','days','entries','adjustments','corrections','reports','employeeMoney','teamMoney'] loop
  if jsonb_typeof(base->k)='array' then result:=result||jsonb_build_object(k,private.window_rows(base->k,v_from));end if;
 end loop;
 return result;
end $$;
revoke all on function public.get_app_snapshot() from public,anon;
grant execute on function public.get_app_snapshot() to authenticated,service_role;
