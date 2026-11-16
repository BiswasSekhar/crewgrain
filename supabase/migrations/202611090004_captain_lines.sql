-- Captains manage the lines of their own unit and can rename it. Admins can do
-- the same for every unit. Anyone else is denied by private.check_unit.
create function public.unit_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();kind text:=p_action->>'type';v_id uuid;v_unit uuid;v_before jsonb;v_after jsonb;
 v_name text:=trim(coalesce(p_action->>'name',''));
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 if kind not in ('add_line','rename_line','remove_line','rename_unit') then raise exception 'Unknown unit action';end if;
 if kind in ('add_line','rename_line','rename_unit') and (v_name='' or length(v_name)>120) then raise exception 'Enter a name up to 120 characters';end if;
 if kind='add_line' then
  v_unit:=(p_action->>'unitId')::uuid;perform private.check_unit(v_unit);
  if not exists(select 1 from public.units where id=v_unit and active) then raise exception 'Unit not found';end if;
  begin
   insert into public.lines(unit_id,name) values(v_unit,v_name) returning id,to_jsonb(lines.*) into v_id,v_after;
  exception when unique_violation then raise exception 'A line with this name already exists';end;
 elsif kind='rename_unit' then
  v_id:=(p_action->>'id')::uuid;perform private.check_unit(v_id);
  select to_jsonb(u) into strict v_before from public.units u where id=v_id for update;
  update public.units set name=v_name where id=v_id returning to_jsonb(units.*) into v_after;
 else
  v_id:=(p_action->>'id')::uuid;
  select unit_id into strict v_unit from public.lines where id=v_id;
  perform private.check_unit(v_unit);
  select to_jsonb(l) into strict v_before from public.lines l where id=v_id for update;
  if kind='rename_line' then
   begin
    update public.lines set name=v_name where id=v_id returning to_jsonb(lines.*) into v_after;
   exception when unique_violation then raise exception 'A line with this name already exists';end;
  else
   if exists(select 1 from public.lots where line_id=v_id) then raise exception 'This line has production lots. Close or move them first';end if;
   if exists(select 1 from public.unit_memberships m join public.profiles p on p.id=m.profile_id and p.active where m.line_id=v_id and m.status='active') then raise exception 'Move employees off this line first';end if;
   delete from public.lines where id=v_id;
  end if;
 end if;
 perform private.audit(actor,kind,v_id,v_before,v_after);
 return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.unit_action(jsonb) from public,anon,authenticated;
grant execute on function public.unit_action(jsonb) to authenticated,service_role;

create or replace function public.phone_request(p_hash text,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
 select p.id into profile from public.linked_phones d join public.profiles p on p.id=d.profile_id and p.active where d.token_hash=p_hash and d.revoked_at is null and d.expires_at>now() and p.role in ('worker','captain') for share of d,p;
 if profile is null then raise exception 'This phone is not linked. Ask the admin to link it again' using errcode='42501';end if;
 perform set_config('crewgrain.device_profile',profile::text,true);
 if p_operation='snapshot' then return public.get_app_snapshot();
 elsif p_operation='count' then return public.change_daily_count(p_payload);
 elsif p_operation='action' and p_payload->>'type' in ('add_line','rename_line','remove_line','rename_unit') then return public.unit_action(p_payload);
 elsif p_operation='action' and p_payload->>'type' in ('assign_task','approve_day','deactivate_assignment','request_correction','request_employee','review_request','submit_report') then return public.app_action(p_payload);
 else raise exception 'This action is not available on this phone' using errcode='42501';end if;
end $$;
