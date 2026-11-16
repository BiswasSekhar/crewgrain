-- The day plan: which styles a line works on today (or another day), in order,
-- each with an optional count. It replaces hand-made batches: choosing a style
-- for a line quietly creates the hidden batch that assignments still need.
create table public.day_plan (
 unit_id uuid not null references public.units,
 work_date date not null,
 style_id uuid not null references public.styles,
 position integer not null check(position between 0 and 19),
 count integer check(count between 1 and 1000000),
 primary key(unit_id,work_date,style_id)
);
alter table public.day_plan enable row level security;
revoke all on public.day_plan from public,anon,authenticated;
grant all on public.day_plan to service_role;

create function private.ensure_lot(p_unit uuid,p_style uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.lots where unit_id=p_unit and style_id=p_style and status='active') then return;end if;
 insert into public.lots(style_id,unit_id,line_id,code,total_pieces)
 select p_style,p_unit,(select id from public.lines where unit_id=p_unit order by name limit 1),left('AUTO-'||s.code||'-'||u.code,40),1000000
 from public.styles s,public.units u where s.id=p_style and u.id=p_unit
 on conflict(code) do update set status='active';
end $$;
revoke all on function private.ensure_lot(uuid,uuid) from public,anon,authenticated;

create function public.set_day_plan(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_unit uuid:=(p_action->>'unitId')::uuid;v_date date:=(p_action->>'workDate')::date;
 v_today date:=(now() at time zone 'Asia/Kolkata')::date;v_item jsonb;v_pos integer:=0;v_style uuid;v_count integer;v_before jsonb;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_unit(v_unit);
 if v_date is null or v_date<v_today-1 or v_date>v_today+7 then raise exception 'Choose a day from yesterday to next week';end if;
 if jsonb_typeof(p_action->'items')<>'array' or jsonb_array_length(p_action->'items')>20 then raise exception 'Choose up to 20 styles for one day';end if;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.position),'[]'::jsonb) into v_before from public.day_plan d where unit_id=v_unit and work_date=v_date;
 delete from public.day_plan where unit_id=v_unit and work_date=v_date;
 for v_item in select * from jsonb_array_elements(p_action->'items') loop
  v_style:=(v_item->>'styleId')::uuid;v_count:=(v_item->>'count')::integer;
  if not exists(select 1 from public.styles where id=v_style) then raise exception 'Style not found';end if;
  if v_count is not null and v_count not between 1 and 1000000 then raise exception 'Enter a count between 1 and 1,000,000';end if;
  begin
   insert into public.day_plan(unit_id,work_date,style_id,position,count) values(v_unit,v_date,v_style,v_pos,v_count);
  exception when unique_violation then raise exception 'Each style can be added once';end;
  perform private.ensure_lot(v_unit,v_style);
  v_pos:=v_pos+1;
 end loop;
 perform private.audit(actor,'set_day_plan',v_unit,v_before,p_action->'items');
 return jsonb_build_object('id',v_unit);
end $$;
revoke all on function public.set_day_plan(jsonb) from public,anon,authenticated;
grant execute on function public.set_day_plan(jsonb) to authenticated,service_role;

-- Add the plan to the snapshot.
alter function public.get_app_snapshot() rename to get_app_snapshot_pricing;
revoke all on function public.get_app_snapshot_pricing() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select public.get_app_snapshot_pricing()||jsonb_build_object('dayPlan',coalesce((
  select jsonb_agg(jsonb_build_object('unitId',d.unit_id,'workDate',d.work_date,'styleId',d.style_id,'position',d.position,'count',d.count) order by d.work_date,d.position)
  from public.day_plan d
  where d.work_date>=(now() at time zone 'Asia/Kolkata')::date-35 and (private.is_admin() or d.unit_id=private.my_unit())
 ),'[]'::jsonb));
$$;
revoke all on function public.get_app_snapshot() from public,anon,authenticated;
grant execute on function public.get_app_snapshot() to authenticated,service_role;

create or replace function public.phone_request(p_hash text,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
 select p.id into profile from public.linked_phones d join public.profiles p on p.id=d.profile_id and p.active where d.token_hash=p_hash and d.revoked_at is null and d.expires_at>now() and p.role in ('worker','captain') for share of d,p;
 if profile is null then raise exception 'This phone is not linked. Ask the admin to link it again' using errcode='42501';end if;
 perform set_config('crewgrain.device_profile',profile::text,true);
 if p_operation='snapshot' then return public.get_app_snapshot();
 elsif p_operation='count' then return public.change_daily_count(p_payload);
 elsif p_operation='action' and p_payload->>'type'='set_day_plan' then return public.set_day_plan(p_payload);
 elsif p_operation='action' and p_payload->>'type' in ('add_line','rename_line','remove_line','rename_unit') then return public.unit_action(p_payload);
 elsif p_operation='action' and p_payload->>'type' in ('assign_task','approve_day','deactivate_assignment','request_correction','request_employee','review_request','submit_report') then return public.app_action(p_payload);
 else raise exception 'This action is not available on this phone' using errcode='42501';end if;
end $$;
