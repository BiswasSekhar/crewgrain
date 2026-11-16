-- Worker-entered quantities cannot be overridden by captains or admins.
-- Existing records remain unchanged; old disputed days can only retain the worker count.
create or replace function public.daily_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();kind text:=p_action->>'type';v_id uuid;v_date date;v_employee uuid;v_unit uuid;v_lot public.lots;v_a public.assignments;
 v_count public.daily_counts;v_day public.day_checks;task jsonb;proposed jsonb;checked jsonb:='[]'::jsonb;qty integer;changed boolean:=false;n integer:=0;v_rate integer;v_new jsonb;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 if pg_column_size(p_action)>100000 then raise exception 'Request too large';end if;
 if kind in ('assign_task','approve_day') then
  v_date:=(p_action->>'workDate')::date;v_employee:=(p_action->>'employeeId')::uuid;
  if v_date is null or v_date not between (now() at time zone 'Asia/Kolkata')::date-2 and (now() at time zone 'Asia/Kolkata')::date then raise exception 'Choose today or the previous two days';end if;
  select m.unit_id into v_unit from public.profiles p join public.unit_memberships m on m.profile_id=p.id and m.status='active' where p.id=v_employee and p.active and p.role='worker';
  if v_unit is null then raise exception 'Active employee not found';end if;perform private.check_unit(v_unit);
  perform pg_advisory_xact_lock(hashtextextended(v_employee::text||v_date::text,1));
  if exists(select 1 from public.day_checks where employee_id=v_employee and work_date=v_date) then raise exception 'This day has already been approved';end if;
 end if;
 if kind='assign_task' then
  select * into v_lot from public.lots where id=(p_action->>'lotId')::uuid and status='active' and unit_id=v_unit;
  if v_lot.id is null or not exists(select 1 from public.operations where id=(p_action->>'operationId')::uuid and style_id=v_lot.style_id) then raise exception 'Task must belong to the employee unit and selected style';end if;
  if exists(select 1 from public.assignments where employee_id=v_employee and operation_id=(p_action->>'operationId')::uuid and lot_id=v_lot.id and active and (work_date is null or work_date=v_date) and valid_from<=v_date and (valid_to is null or valid_to>=v_date)) then raise exception 'This task is already assigned';end if;
  insert into public.assignments(employee_id,operation_id,lot_id,unit_id,work_date,assigned_by,valid_from,valid_to) values(v_employee,(p_action->>'operationId')::uuid,v_lot.id,v_unit,v_date,actor,v_date,v_date) returning id,to_jsonb(assignments.*) into v_id,v_new;
 elsif kind='approve_day' then
  if private.my_role()<>'captain' then raise exception 'Only the unit captain approves the day' using errcode='42501';end if;
  if p_action->>'attendance' not in ('present','absent') or p_action->>'attendance' is null then raise exception 'Choose attendance';end if;
  if jsonb_typeof(p_action->'tasks') is distinct from 'array' then raise exception 'Include every assigned task';end if;
  for v_a in select a.* from public.assignments a join public.lots l on l.id=a.lot_id and l.status='active' where a.employee_id=v_employee and a.unit_id=v_unit and a.active and (a.work_date is null or a.work_date=v_date) and a.valid_from<=v_date and (a.valid_to is null or a.valid_to>=v_date) order by a.id loop
   n:=n+1;
   if (select count(*) from jsonb_array_elements(p_action->'tasks')t where t->>'assignmentId'=v_a.id::text)<>1 then raise exception 'Tasks changed. Refresh before approving';end if;
   select t into proposed from jsonb_array_elements(p_action->'tasks')t where t->>'assignmentId'=v_a.id::text;
   select * into v_count from public.daily_counts where assignment_id=v_a.id and work_date=v_date for update;
   if (proposed->>'expectedVersion')::integer is distinct from coalesce(v_count.version,0) then raise exception 'Employee count changed. Refresh before approving';end if;
   qty:=(proposed->>'quantity')::integer;if qty is null or qty not between 0 and 20000 then raise exception 'Count must be between 0 and 20000';end if;
   if qty<>coalesce(v_count.quantity,0) then raise exception 'Only the employee can change their recorded count';end if;
   if p_action->>'attendance'='absent' and qty>0 then raise exception 'This employee recorded work. Check attendance before approving';end if;
   select rate_paise into v_rate from public.operations where id=v_a.operation_id;
   checked:=checked||jsonb_build_array(jsonb_build_object('assignmentId',v_a.id,'enteredQuantity',coalesce(v_count.quantity,0),'captainQuantity',qty,'finalQuantity',qty,'ratePaise',coalesce(v_count.rate_paise,v_rate),'reason',trim(coalesce(proposed->>'reason',''))));
  end loop;
  if n=0 or n<>jsonb_array_length(p_action->'tasks') then raise exception 'Tasks changed. Include every assigned task';end if;
  insert into public.day_checks(employee_id,unit_id,work_date,captain_id,attendance,status,tasks) values(v_employee,v_unit,v_date,actor,p_action->>'attendance',case when changed then 'needs_admin' else 'approved' end,checked) returning id,to_jsonb(day_checks.*) into v_id,v_new;
 elsif kind='admin_decide_day' then
  perform private.check_admin();select * into strict v_day from public.day_checks where id=(p_action->>'id')::uuid for update;
  if v_day.status<>'needs_admin' then raise exception 'This day has already been reviewed';end if;
  if p_action->>'decision' is distinct from 'employee' then raise exception 'The employee recorded count must be kept';end if;
  select jsonb_agg(t||jsonb_build_object('finalQuantity',case when p_action->>'decision'='captain' then t->'captainQuantity' else t->'enteredQuantity' end)) into checked from jsonb_array_elements(v_day.tasks)t;
  update public.day_checks set tasks=checked,status='admin_approved',admin_id=actor,admin_decision=p_action->>'decision',admin_note=left(coalesce(p_action->>'note',''),2000),reviewed_at=now() where id=v_day.id returning id,to_jsonb(day_checks.*) into v_id,v_new;
  perform private.audit(actor,kind,v_id,to_jsonb(v_day),v_new);return jsonb_build_object('id',v_id);
 elsif kind='revoke_device' then
  perform private.check_admin();update public.linked_phones set revoked_at=now() where id=(p_action->>'id')::uuid and revoked_at is null returning id,jsonb_build_object('profileId',profile_id,'revoked',true) into v_id,v_new;
  if v_id is null then raise exception 'This phone is already unlinked';end if;
 else raise exception 'Unknown daily action';end if;
 perform private.audit(actor,kind,v_id,null,v_new);return jsonb_build_object('id',v_id);
end $$;

-- The older entry endpoint also allowed admin quantity edits. Keep its other
-- actions, but move the implementation behind a non-callable private function.
alter function public.perform_action(jsonb) set schema private;
alter function private.perform_action(jsonb) rename to perform_action_before_worker_ownership;
revoke all on function private.perform_action_before_worker_ownership(jsonb) from public,anon,authenticated,service_role;
create function public.perform_action(p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_action->>'type' in ('edit_entry','void_entry') and private.my_role() is distinct from 'worker' then
  raise exception 'Only the employee can change their recorded count' using errcode='42501';
 end if;
 return private.perform_action_before_worker_ownership(p_action);
end $$;
revoke all on function public.perform_action(jsonb) from public,anon;
grant execute on function public.perform_action(jsonb) to authenticated,service_role;
