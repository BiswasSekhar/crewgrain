-- Staff lifecycle, operation codes/groups/materials, and dated assignments.
-- Existing count/pay snapshots and audit rows remain immutable.
alter table public.profiles add column deleted_at timestamptz;
alter table public.profiles add constraint deleted_profile_inactive check(deleted_at is null or not active);
alter table public.styles add column material text not null default '' check(length(material)<=120);
alter table public.operations add column code text;
alter table public.operations add column steps jsonb not null default '[]' check(jsonb_typeof(steps)='array' and jsonb_array_length(steps)<=30);
update public.operations set code='OP'||sequence;
alter table public.operations alter column code set not null;
alter table public.operations add constraint operation_code_length check(length(code) between 1 and 24);
create unique index operation_style_code on public.operations(style_id,upper(code));
-- Legacy catalog insertion also receives an OP code.
create function private.operation_code_default() returns trigger language plpgsql set search_path='' as $$
declare suffix integer:=new.sequence;
begin
 if new.code is null then
  new.code:='OP'||suffix;
  while exists(select 1 from public.operations o where o.style_id=new.style_id and upper(o.code)=upper(new.code)) loop suffix:=suffix+1;new.code:='OP'||suffix;end loop;
 end if;
 return new;
end $$;
create trigger operation_code_default before insert on public.operations for each row execute function private.operation_code_default();
alter table public.assignments add column material text not null default '' check(length(material)<=120);
create table public.operation_defaults(
 employee_id uuid not null references public.profiles,style_id uuid not null references public.styles,
 operation_ids uuid[] not null,updated_by uuid not null references public.profiles,updated_at timestamptz not null default now(),
 primary key(employee_id,style_id)
);
alter table public.operation_defaults enable row level security;
revoke all on public.operation_defaults from public,anon,authenticated;
grant all on public.operation_defaults to service_role;

create function public.operations_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();kind text:=p_action->>'type';employee public.profiles;membership public.unit_memberships;
 target uuid;unit uuid;desired public.crewgrain_role;style uuid;op uuid;batch uuid;work_day date;ids uuid[];previous jsonb;default_row record;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 if pg_column_size(p_action)>30000 then raise exception 'Request too large';end if;
 if kind='apply_line_defaults' then
  unit:=(p_action->>'unitId')::uuid;work_day:=(p_action->>'workDate')::date;perform private.check_unit(unit);
  if work_day is null or work_day not between (now() at time zone 'Asia/Kolkata')::date-2 and (now() at time zone 'Asia/Kolkata')::date then raise exception 'Choose today or either of the previous two days';end if;
  for default_row in select d.* from public.operation_defaults d join public.profiles p on p.id=d.employee_id and p.active and p.deleted_at is null and p.role='worker' join public.unit_memberships m on m.profile_id=p.id and m.status='active' and m.unit_id=unit join public.day_plan plan on plan.unit_id=unit and plan.work_date=work_day and plan.style_id=d.style_id where not exists(select 1 from public.day_checks c where c.employee_id=p.id and c.work_date=work_day) loop
   perform public.operations_action(jsonb_build_object('type','assign_operations','employeeId',default_row.employee_id,'styleId',default_row.style_id,'operationIds',default_row.operation_ids,'workDate',work_day,'saveDefaults',false));
  end loop;
 elsif kind='assign_operations' then
  target:=(p_action->>'employeeId')::uuid;style:=(p_action->>'styleId')::uuid;work_day:=(p_action->>'workDate')::date;
  select * into employee from public.profiles where id=target and active and deleted_at is null and role='worker' for share;
  if employee.id is null then raise exception 'Choose an active employee';end if;
  select * into membership from public.unit_memberships where profile_id=target and status='active' for share;
  unit:=membership.unit_id;perform private.check_unit(unit);
  if work_day is null or work_day not between (now() at time zone 'Asia/Kolkata')::date-2 and (now() at time zone 'Asia/Kolkata')::date then raise exception 'Choose today or either of the previous two days';end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text||work_day::text,1));
  if exists(select 1 from public.day_checks where employee_id=target and work_date=work_day) then raise exception 'This day has already been approved';end if;
  if jsonb_typeof(p_action->'operationIds') is distinct from 'array' or jsonb_array_length(p_action->'operationIds') not between 1 and 60 then raise exception 'Choose between 1 and 60 operations';end if;
  select array_agg(distinct v::uuid) into ids from jsonb_array_elements_text(p_action->'operationIds') v;
  if exists(select 1 from unnest(ids) x where not exists(select 1 from public.operations o where o.id=x and o.style_id=style)) then raise exception 'Choose operations from this style';end if;
  perform pg_advisory_xact_lock(hashtextextended(unit::text||style::text,3));
  perform private.ensure_lot(unit,style);
  select id into batch from public.lots where unit_id=unit and style_id=style and status='active' order by created_at limit 1;
  foreach op in array ids loop
   if not exists(select 1 from public.assignments a where a.employee_id=target and a.operation_id=op and a.lot_id=batch and a.active and (a.work_date is null or a.work_date=work_day)) then
    insert into public.assignments(employee_id,operation_id,lot_id,unit_id,work_date,valid_from,assigned_by,material) values(target,op,batch,unit,work_day,work_day,actor,trim(coalesce(p_action->>'material',(select material from public.styles where id=style),'')));
   end if;
  end loop;
  if coalesce((p_action->>'saveDefaults')::boolean,false) then
   insert into public.operation_defaults(employee_id,style_id,operation_ids,updated_by) values(target,style,ids,actor)
   on conflict(employee_id,style_id) do update set operation_ids=excluded.operation_ids,updated_by=actor,updated_at=now();
  end if;
 else
  perform private.check_admin();
  if kind in ('manage_employee','set_line_captain') then
   target:=case when kind='manage_employee' then (p_action->>'id')::uuid else (p_action->>'employeeId')::uuid end;
   unit:=(p_action->>'unitId')::uuid;desired:=case when kind='set_line_captain' then 'captain'::public.crewgrain_role else (p_action->>'role')::public.crewgrain_role end;
   if desired not in ('worker','captain') then raise exception 'Choose employee or captain';end if;
   if not exists(select 1 from public.units where id=unit and active) then raise exception 'Choose an active line';end if;
   -- Serialize captain replacements and role changes on this line.
   perform pg_advisory_xact_lock(hashtextextended(unit::text,4));
   select * into employee from public.profiles where id=target and role<>'admin' and deleted_at is null and active for update;
   if employee.id is null then raise exception 'Restore the employee before changing role or line';end if;
   select * into membership from public.unit_memberships where profile_id=target and status='active' for update;
   previous:=to_jsonb(employee)||jsonb_build_object('unitId',membership.unit_id);
   if (membership.unit_id is distinct from unit or employee.role is distinct from desired) and exists(select 1 from public.daily_counts c where c.employee_id=target and c.quantity>0 and not exists(select 1 from public.day_checks d where d.employee_id=target and d.work_date=c.work_date and d.status in ('approved','admin_approved'))) then raise exception 'Approve pending counts before changing this employee’s role or line.';end if;
   if desired='captain' and kind='set_line_captain' then
    update public.profiles set role='worker' where id in(select profile_id from public.unit_memberships where unit_id=unit and role='captain' and status='active' and profile_id<>target);
    update public.unit_memberships set role='worker' where unit_id=unit and role='captain' and status='active' and profile_id<>target;
   end if;
   if membership.unit_id is distinct from unit then update public.assignments set active=false where employee_id=target;end if;
   update public.unit_memberships set status='inactive',active_to=now() where profile_id=target and status='active';
   insert into public.unit_memberships(profile_id,unit_id,line_id,role) values(target,unit,(select id from public.lines where unit_id=unit order by name limit 1),desired);
   update public.profiles set role=desired where id=target;
  elsif kind='delete_employee' then
   target:=(p_action->>'id')::uuid;
   select * into employee from public.profiles where id=target and role<>'admin' and deleted_at is null for update;
   if employee.id is null then raise exception 'Employee not found';end if;
   previous:=to_jsonb(employee);
   if exists(select 1 from public.daily_counts c where c.employee_id=target and c.quantity>0 and not exists(select 1 from public.day_checks d where d.employee_id=target and d.work_date=c.work_date and d.status in ('approved','admin_approved'))) then raise exception 'Approve pending counts before deleting this employee.';end if;
   update public.profiles set active=false,deleted_at=now() where id=target;
   update public.unit_memberships set status='inactive',active_to=now() where profile_id=target and status='active';
   update public.linked_phones set revoked_at=now() where profile_id=target and revoked_at is null;
  elsif kind='save_operation_details' then
   target:=(p_action->>'id')::uuid;
   if jsonb_typeof(p_action->'steps') is distinct from 'array' or jsonb_array_length(p_action->'steps')>30 then raise exception 'Enter up to 30 actions';end if;
   if exists(select 1 from jsonb_array_elements(p_action->'steps') v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>500) then raise exception 'Each action must be text up to 500 characters';end if;
   select to_jsonb(o) into previous from public.operations o where id=target for update;
   if previous is null then raise exception 'Operation not found';end if;
   update public.operations set code=upper(trim(p_action->>'code')),steps=p_action->'steps' where id=target;
  elsif kind='save_material' then
   target:=(p_action->>'styleId')::uuid;
   update public.styles set material=trim(coalesce(p_action->>'material','')) where id=target;
   if not found then raise exception 'Style not found';end if;
  else raise exception 'Unknown operation action';end if;
 end if;
 perform private.audit(actor,kind,coalesce(target,actor),previous,p_action);
 return jsonb_build_object('id',coalesce(target,actor));
end $$;
revoke all on function public.operations_action(jsonb) from public,anon,authenticated;
grant execute on function public.operations_action(jsonb) to authenticated,service_role;

alter function public.app_action(jsonb) set schema private;
alter function private.app_action(jsonb) rename to app_action_before_operations;
revoke all on function private.app_action_before_operations(jsonb) from public,anon,authenticated,service_role;
create function public.app_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action->>'type' in ('apply_line_defaults','manage_employee','delete_employee','set_line_captain','assign_operations','save_operation_details','save_material') then return public.operations_action(p_action);end if;
 return private.app_action_before_operations(p_action);
end $$;
revoke all on function public.app_action(jsonb) from public,anon;
grant execute on function public.app_action(jsonb) to authenticated,service_role;

alter function public.get_app_snapshot() rename to get_app_snapshot_before_operations;
revoke all on function public.get_app_snapshot_before_operations() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=public.get_app_snapshot_before_operations();
begin
 return base||jsonb_build_object(
  'employees',coalesce((select jsonb_agg(v||jsonb_build_object('deletedAt',p.deleted_at)) from jsonb_array_elements(base->'employees') v join public.profiles p on p.id=(v->>'id')::uuid),'[]'::jsonb),
  'styles',coalesce((select jsonb_agg(v||jsonb_build_object('material',s.material)) from jsonb_array_elements(base->'styles') v join public.styles s on s.id=(v->>'id')::uuid),'[]'::jsonb),
  'operations',coalesce((select jsonb_agg(v||jsonb_build_object('code',o.code,'steps',o.steps)) from jsonb_array_elements(base->'operations') v join public.operations o on o.id=(v->>'id')::uuid),'[]'::jsonb),
  'assignments',coalesce((select jsonb_agg(v||jsonb_build_object('material',a.material)) from jsonb_array_elements(base->'assignments') v join public.assignments a on a.id=(v->>'id')::uuid),'[]'::jsonb),
  'operationDefaults',coalesce((select jsonb_agg(jsonb_build_object('employeeId',d.employee_id,'styleId',d.style_id,'operationIds',d.operation_ids)) from public.operation_defaults d where d.employee_id=private.me() or private.is_admin() or exists(select 1 from public.unit_memberships m where m.profile_id=d.employee_id and m.status='active' and m.unit_id=private.my_unit() and private.my_role()='captain')),'[]'::jsonb)
 );
end $$;
revoke all on function public.get_app_snapshot() from public,anon;
grant execute on function public.get_app_snapshot() to authenticated,service_role;

-- Preserve the same line-transition rule through the legacy admin endpoint.
alter function public.perform_action(jsonb) set schema private;
alter function private.perform_action(jsonb) rename to perform_action_before_staff_guard;
revoke all on function private.perform_action_before_staff_guard(jsonb) from public,anon,authenticated,service_role;
create function public.perform_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;unit uuid;
begin
 if p_action->>'type'='update_employee' then
  perform private.check_admin();target:=(p_action->>'id')::uuid;unit:=(p_action->>'unitId')::uuid;
  perform 1 from public.profiles where id=target for update;
  if not exists(select 1 from public.unit_memberships m where m.profile_id=target and m.unit_id=unit and m.status='active') and exists(select 1 from public.daily_counts c where c.employee_id=target and c.quantity>0 and not exists(select 1 from public.day_checks d where d.employee_id=target and d.work_date=c.work_date and d.status in ('approved','admin_approved'))) then raise exception 'Approve pending counts before changing this employee’s role or line.';end if;
 end if;
 return private.perform_action_before_staff_guard(p_action);
end $$;
revoke all on function public.perform_action(jsonb) from public,anon;
grant execute on function public.perform_action(jsonb) to authenticated,service_role;
