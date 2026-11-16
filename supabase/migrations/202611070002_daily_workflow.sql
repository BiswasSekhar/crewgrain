-- Daily counters replace entry-by-entry worker UI. Original counts are never
-- overwritten by captain checks. Changed days require a separate admin decision.
alter table public.assignments add column work_date date;
alter table public.assignments add column assigned_by uuid references public.profiles;
drop index public.assignment_no_duplicate;
create unique index assignment_no_duplicate on public.assignments(employee_id,operation_id,lot_id,coalesce(work_date,'0001-01-01'::date)) where active;

create table public.daily_counts(
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.assignments,
 employee_id uuid not null references public.profiles,unit_id uuid not null references public.units,
 work_date date not null,quantity integer not null check(quantity between 0 and 20000),
 rate_paise integer not null check(rate_paise between 0 and 10000000),version integer not null default 1,
 updated_at timestamptz not null default now(),unique(assignment_id,work_date)
);
create table public.count_events(
 id uuid primary key,assignment_id uuid not null references public.assignments,employee_id uuid not null references public.profiles,
 unit_id uuid not null references public.units,work_date date not null,delta integer not null check(delta<>0 and delta between -20000 and 20000),
 before_quantity integer not null,after_quantity integer not null,captured_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table public.day_checks(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.profiles,unit_id uuid not null references public.units,
 work_date date not null,captain_id uuid not null references public.profiles,checked_at timestamptz not null default now(),
 attendance text not null check(attendance in ('present','absent')),
 status text not null check(status in ('approved','needs_admin','admin_approved')),
 tasks jsonb not null check(jsonb_typeof(tasks)='array' and jsonb_array_length(tasks)>0),
 admin_id uuid references public.profiles,admin_decision text check(admin_decision in ('captain','employee')),
 admin_note text,reviewed_at timestamptz,unique(employee_id,work_date)
);
create index day_checks_review on public.day_checks(status,work_date,unit_id);
create table public.phone_setup_links(
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),created_by uuid not null references public.profiles,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',used_at timestamptz
);
create table public.linked_phones(
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '180 days',revoked_at timestamptz
);

-- Only the service-only device gateway can supply a linked-phone actor.
create or replace function private.me() returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.profiles p where p.active and (
  p.auth_user_id=auth.uid() or
  (current_setting('role',true)='service_role' and p.id=nullif(current_setting('crewgrain.device_profile',true),'')::uuid)
 ) limit 1
$$;

alter table public.daily_counts enable row level security;
alter table public.count_events enable row level security;
alter table public.day_checks enable row level security;
alter table public.phone_setup_links enable row level security;
alter table public.linked_phones enable row level security;
create policy daily_count_read on public.daily_counts for select to authenticated using(employee_id=private.me() or private.can_unit(unit_id));
create policy count_event_read on public.count_events for select to authenticated using(employee_id=private.me() or private.can_unit(unit_id));
create policy day_check_read on public.day_checks for select to authenticated using(employee_id=private.me() or private.can_unit(unit_id));
-- No table grants for financial snapshots or phone credentials. Only projections
-- in trusted RPCs are exposed. Setup/token hashes are never returned to clients.
revoke all on public.daily_counts,public.count_events,public.day_checks,public.phone_setup_links,public.linked_phones from anon,authenticated;
grant all on public.daily_counts,public.count_events,public.day_checks,public.phone_setup_links,public.linked_phones to service_role;

create function private.guard_day_check() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Daily checks cannot be deleted';end if;
 if old.status<>'needs_admin' or new.status<>'admin_approved' then raise exception 'This day is locked';end if;
 if row(new.id,new.employee_id,new.unit_id,new.work_date,new.captain_id,new.checked_at,new.attendance)
 is distinct from row(old.id,old.employee_id,old.unit_id,old.work_date,old.captain_id,old.checked_at,old.attendance)
 or (select jsonb_agg(t-'finalQuantity') from jsonb_array_elements(old.tasks)t)
 is distinct from (select jsonb_agg(t-'finalQuantity') from jsonb_array_elements(new.tasks)t) then raise exception 'Original and captain counts cannot be rewritten';end if;
 return new;
end $$;
create trigger daily_check_immutable before update or delete on public.day_checks for each row execute function private.guard_day_check();
create function private.immutable_count_event() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Count events are immutable';end $$;
create trigger count_events_immutable before update or delete on public.count_events for each row execute function private.immutable_count_event();
create function private.daily_count_json(c public.daily_counts) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',c.id,'assignmentId',c.assignment_id,'employeeId',c.employee_id,'unitId',c.unit_id,'workDate',c.work_date,'quantity',c.quantity,'ratePaise',c.rate_paise,'version',c.version,'updatedAt',c.updated_at)
$$;

create function public.get_daily_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.me();v_role public.crewgrain_role:=private.my_role();v_unit uuid:=private.my_unit();base jsonb;
begin
 base:=public.get_snapshot();
 return base||jsonb_build_object(
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employeeId',a.employee_id,'operationId',a.operation_id,'lotId',a.lot_id,'active',a.active,'workDate',a.work_date,'assignedBy',a.assigned_by)) from public.assignments a where a.employee_id=actor or v_role='admin' or (v_role='captain' and a.unit_id=v_unit)),'[]'::jsonb),
  'counts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'assignmentId',c.assignment_id,'employeeId',c.employee_id,'unitId',c.unit_id,'workDate',c.work_date,'quantity',c.quantity,'version',c.version,'updatedAt',c.updated_at,'ratePaise',case when v_role='captain' then 0 else c.rate_paise end)) from public.daily_counts c where c.employee_id=actor or v_role='admin' or (v_role='captain' and c.unit_id=v_unit)),'[]'::jsonb),
  'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'employeeId',d.employee_id,'unitId',d.unit_id,'workDate',d.work_date,'captainId',d.captain_id,'checkedAt',d.checked_at,'attendance',d.attendance,'status',d.status,'tasks',case when v_role='captain' then (select jsonb_agg(t||jsonb_build_object('ratePaise',0)) from jsonb_array_elements(d.tasks)t) else d.tasks end,'adminId',d.admin_id,'adminDecision',d.admin_decision,'adminNote',d.admin_note,'reviewedAt',d.reviewed_at) order by d.checked_at desc) from public.day_checks d where d.employee_id=actor or v_role='admin' or (v_role='captain' and d.unit_id=v_unit)),'[]'::jsonb),
  'devices',case when v_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'profileId',p.profile_id,'createdAt',p.created_at,'expiresAt',p.expires_at,'revokedAt',p.revoked_at)) from public.linked_phones p),'[]'::jsonb) else '[]'::jsonb end
 );
end $$;

create function public.change_daily_count(p_change jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();event_id uuid:=(p_change->>'id')::uuid;v_assignment public.assignments;
 v_date date:=(p_change->>'workDate')::date;v_delta integer:=(p_change->>'delta')::integer;
 old_event public.count_events;v_count public.daily_counts;before_qty integer;next_qty integer;v_rate integer;
begin
 if actor is null or private.my_role()<>'worker' or (p_change->>'employeeId')::uuid is distinct from actor then raise exception 'Employee access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(event_id::text,0));
 select * into old_event from public.count_events where id=event_id;
 if found then
  if row(old_event.employee_id,old_event.assignment_id,old_event.work_date,old_event.delta) is distinct from row(actor,(p_change->>'assignmentId')::uuid,v_date,v_delta) then raise exception 'Change ID already used' using errcode='23505';end if;
  select * into v_count from public.daily_counts where assignment_id=old_event.assignment_id and work_date=old_event.work_date;
  return jsonb_build_object('id',event_id,'duplicate',true,'count',private.daily_count_json(v_count));
 end if;
 if v_date is null or v_date not between (now() at time zone 'Asia/Kolkata')::date-2 and (now() at time zone 'Asia/Kolkata')::date or v_delta is null or v_delta=0 or v_delta not between -20000 and 20000 then raise exception 'Invalid date or count change' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||v_date::text,1));
 if exists(select 1 from public.day_checks where employee_id=actor and work_date=v_date) then raise exception 'This day has already been approved' using errcode='P0001';end if;
 select * into v_assignment from public.assignments a where a.id=(p_change->>'assignmentId')::uuid and a.employee_id=actor and a.unit_id=private.my_unit() and a.active and (a.work_date is null or a.work_date=v_date) and a.valid_from<=v_date and (a.valid_to is null or a.valid_to>=v_date) for share;
 if v_assignment.id is null or v_assignment.operation_id is distinct from (p_change->>'operationId')::uuid or v_assignment.lot_id is distinct from (p_change->>'lotId')::uuid or not exists(select 1 from public.lots where id=v_assignment.lot_id and status='active') then raise exception 'Task is not assigned to this employee' using errcode='42501';end if;
 select * into v_count from public.daily_counts where assignment_id=v_assignment.id and work_date=v_date for update;
 before_qty:=coalesce(v_count.quantity,0);next_qty:=before_qty+v_delta;
 if next_qty not between 0 and 20000 then raise exception 'The count must stay between 0 and 20000' using errcode='22023';end if;
 select rate_paise into v_rate from public.operations where id=v_assignment.operation_id for share;
 insert into public.daily_counts(assignment_id,employee_id,unit_id,work_date,quantity,rate_paise)
 values(v_assignment.id,actor,v_assignment.unit_id,v_date,next_qty,v_rate)
 on conflict(assignment_id,work_date) do update set quantity=next_qty,version=daily_counts.version+1,updated_at=now();
 insert into public.count_events(id,assignment_id,employee_id,unit_id,work_date,delta,before_quantity,after_quantity,captured_at)
 values(event_id,v_assignment.id,actor,v_assignment.unit_id,v_date,v_delta,before_qty,next_qty,coalesce((p_change->>'capturedAt')::timestamptz,now()));
 perform private.audit(actor,'count_change',event_id,null,jsonb_build_object('assignmentId',v_assignment.id,'before',before_qty,'after',next_qty,'delta',v_delta,'workDate',v_date));
 select * into v_count from public.daily_counts where assignment_id=v_assignment.id and work_date=v_date;
 return jsonb_build_object('id',event_id,'quantity',next_qty,'duplicate',false,'count',private.daily_count_json(v_count));
end $$;

create function public.daily_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   if qty<>coalesce(v_count.quantity,0) then changed:=true;if trim(coalesce(proposed->>'reason',''))='' then raise exception 'Give a reason for each changed count';end if;end if;
   select rate_paise into v_rate from public.operations where id=v_a.operation_id;
   checked:=checked||jsonb_build_array(jsonb_build_object('assignmentId',v_a.id,'enteredQuantity',coalesce(v_count.quantity,0),'captainQuantity',qty,'finalQuantity',qty,'ratePaise',coalesce(v_count.rate_paise,v_rate),'reason',trim(coalesce(proposed->>'reason',''))));
  end loop;
  if n=0 or n<>jsonb_array_length(p_action->'tasks') then raise exception 'Tasks changed. Include every assigned task';end if;
  insert into public.day_checks(employee_id,unit_id,work_date,captain_id,attendance,status,tasks) values(v_employee,v_unit,v_date,actor,p_action->>'attendance',case when changed then 'needs_admin' else 'approved' end,checked) returning id,to_jsonb(day_checks.*) into v_id,v_new;
 elsif kind='admin_decide_day' then
  perform private.check_admin();select * into strict v_day from public.day_checks where id=(p_action->>'id')::uuid for update;
  if v_day.status<>'needs_admin' then raise exception 'This day has already been reviewed';end if;
  if p_action->>'decision' is null or p_action->>'decision' not in ('captain','employee') then raise exception 'Choose which count to use';end if;
  select jsonb_agg(t||jsonb_build_object('finalQuantity',case when p_action->>'decision'='captain' then t->'captainQuantity' else t->'enteredQuantity' end)) into checked from jsonb_array_elements(v_day.tasks)t;
  update public.day_checks set tasks=checked,status='admin_approved',admin_id=actor,admin_decision=p_action->>'decision',admin_note=left(coalesce(p_action->>'note',''),2000),reviewed_at=now() where id=v_day.id returning id,to_jsonb(day_checks.*) into v_id,v_new;
  perform private.audit(actor,kind,v_id,to_jsonb(v_day),v_new);return jsonb_build_object('id',v_id);
 elsif kind='revoke_device' then
  perform private.check_admin();update public.linked_phones set revoked_at=now() where id=(p_action->>'id')::uuid and revoked_at is null returning id,jsonb_build_object('profileId',profile_id,'revoked',true) into v_id,v_new;
  if v_id is null then raise exception 'This phone is already unlinked';end if;
 else raise exception 'Unknown daily action';end if;
 perform private.audit(actor,kind,v_id,null,v_new);return jsonb_build_object('id',v_id);
end $$;

-- Setup and gateway functions are callable only by the trusted Edge Function.
create function public.create_phone_setup(p_actor uuid,p_profile uuid,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and active and role='admin') then raise exception 'Admin required';end if;
 if not exists(select 1 from public.profiles p join public.unit_memberships m on m.profile_id=p.id and m.status='active' join public.units u on u.id=m.unit_id and u.active where p.id=p_profile and p.active and p.role in ('worker','captain')) then raise exception 'Choose an active employee or captain';end if;
 update public.phone_setup_links set expires_at=now() where profile_id=p_profile and used_at is null;
 insert into public.phone_setup_links(profile_id,token_hash,created_by) values(p_profile,p_hash,p_actor) returning id into result;
 perform private.audit(p_actor,'phone_setup_issued',result,null,jsonb_build_object('profileId',p_profile));return result;
end $$;
create function public.redeem_phone_setup(p_hash text,p_device_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare link public.phone_setup_links;device_id uuid;
begin
 select * into link from public.phone_setup_links where token_hash=p_hash and expires_at>now() and used_at is null for update;
 if link.id is null or not exists(select 1 from public.profiles where id=link.profile_id and active and role in ('worker','captain')) then raise exception 'This setup link has expired or was already used';end if;
 update public.phone_setup_links set used_at=now() where id=link.id;
 update public.linked_phones set revoked_at=now() where profile_id=link.profile_id and revoked_at is null;
 insert into public.linked_phones(profile_id,token_hash) values(link.profile_id,p_device_hash) returning id into device_id;
 perform private.audit(link.created_by,'phone_linked',device_id,null,jsonb_build_object('profileId',link.profile_id));return device_id;
end $$;
create function public.phone_request(p_hash text,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
 select p.id into profile from public.linked_phones d join public.profiles p on p.id=d.profile_id and p.active where d.token_hash=p_hash and d.revoked_at is null and d.expires_at>now() and p.role in ('worker','captain') for share of d,p;
 if profile is null then raise exception 'This phone is not linked. Ask the admin to link it again' using errcode='42501';end if;
 perform set_config('crewgrain.device_profile',profile::text,true);
 if p_operation='snapshot' then return public.get_daily_snapshot();
 elsif p_operation='count' then return public.change_daily_count(p_payload);
 elsif p_operation='action' and p_payload->>'type' in ('assign_task','approve_day') then return public.daily_action(p_payload);
 else raise exception 'This action is not available on this phone' using errcode='42501';end if;
end $$;

revoke all on function private.guard_day_check(),private.immutable_count_event(),private.daily_count_json(public.daily_counts) from public,anon,authenticated;
revoke all on function public.get_daily_snapshot(),public.change_daily_count(jsonb),public.daily_action(jsonb),public.create_phone_setup(uuid,uuid,text),public.redeem_phone_setup(text,text),public.phone_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_daily_snapshot(),public.change_daily_count(jsonb),public.daily_action(jsonb) to authenticated,service_role;
grant execute on function public.create_phone_setup(uuid,uuid,text),public.redeem_phone_setup(text,text),public.phone_request(text,text,jsonb) to service_role;
