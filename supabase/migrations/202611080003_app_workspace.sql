-- Full role workspace. Original counts and approved day checks remain immutable.
create table public.factory_settings (
 id boolean primary key default true check(id), name text not null check(length(name) between 1 and 120),
 phone text not null default '' check(length(phone)<=40),pay_period text not null default 'weekly' check(pay_period in ('weekly','fortnightly','monthly'))
);
insert into public.factory_settings(name) values('Crewgrain');
create table public.correction_requests (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.profiles,unit_id uuid not null references public.units,
 assignment_id uuid not null references public.assignments,work_date date not null,original_quantity integer not null,requested_quantity integer not null check(requested_quantity between 0 and 20000),
 reason text not null check(length(trim(reason)) between 1 and 2000),status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(),reviewed_by uuid references public.profiles,reviewed_at timestamptz,review_note text
);
create unique index one_pending_correction on public.correction_requests(assignment_id,work_date) where status='pending';
create table public.wage_adjustments (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references public.correction_requests,
 employee_id uuid not null references public.profiles,unit_id uuid not null references public.units,assignment_id uuid not null references public.assignments,
 work_date date not null,quantity_delta integer not null,rate_paise integer not null check(rate_paise>=0),amount_paise bigint not null,
 created_by uuid not null references public.profiles,created_at timestamptz not null default now(),check(amount_paise=quantity_delta::bigint*rate_paise)
);
create trigger adjustments_immutable before update or delete on public.wage_adjustments for each row execute function private.immutable_count_event();
alter table public.factory_settings enable row level security;
alter table public.correction_requests enable row level security;
alter table public.wage_adjustments enable row level security;
revoke all on public.factory_settings,public.correction_requests,public.wage_adjustments from public,anon,authenticated;
grant all on public.factory_settings,public.correction_requests,public.wage_adjustments to service_role;

create function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.me();viewer public.crewgrain_role:=private.my_role();unit uuid:=private.my_unit();result jsonb;
begin
 result:=public.get_daily_snapshot();
 -- Retain historical lot context after an employee changes units.
 if viewer='worker' then
  result:=result||jsonb_build_object(
   'lots',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'styleId',l.style_id,'unitId',l.unit_id,'lineId',l.line_id,'code',l.code,'totalPieces',l.total_pieces,'status',l.status)) from public.lots l where l.unit_id=unit or exists(select 1 from public.assignments a where a.employee_id=actor and a.lot_id=l.id) or exists(select 1 from public.production_entries e where e.employee_id=actor and e.lot_id=l.id)),'[]'::jsonb),
   'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'code',u.code,'active',u.active)) from public.units u where u.id=unit or exists(select 1 from public.assignments a where a.employee_id=actor and a.unit_id=u.id) or exists(select 1 from public.production_entries e where e.employee_id=actor and e.unit_id=u.id)),'[]'::jsonb),
   'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'unitId',l.unit_id)) from public.lines l where l.unit_id=unit or exists(select 1 from public.assignments a join public.lots b on b.id=a.lot_id where a.employee_id=actor and b.line_id=l.id) or exists(select 1 from public.production_entries e join public.lots b on b.id=e.lot_id where e.employee_id=actor and b.line_id=l.id)),'[]'::jsonb));
 end if;
 if viewer='captain' then
  result:=result||jsonb_build_object('teamMoney',coalesce((
   select jsonb_agg(jsonb_build_object('workDate',by_day.work_date,'amountPaise',by_day.amount_paise) order by by_day.work_date)
   from (
    select amount_rows.work_date,sum(amount_rows.amount_paise)::bigint amount_paise
    from (
     select c.work_date,
      (case when d.status in ('approved','admin_approved')
       then coalesce(nullif(checked_task.task->>'finalQuantity','')::integer,c.quantity)+coalesce((select sum(w.quantity_delta)::integer from public.wage_adjustments w where w.assignment_id=c.assignment_id and w.work_date=c.work_date),0)
       else c.quantity end)::bigint * coalesce(nullif(checked_task.task->>'ratePaise','')::integer,c.rate_paise)::bigint amount_paise
     from public.daily_counts c
     left join public.day_checks d on d.employee_id=c.employee_id and d.work_date=c.work_date
     left join lateral (
      select task from jsonb_array_elements(coalesce(d.tasks,'[]'::jsonb)) as item(task)
      where task->>'assignmentId'=c.assignment_id::text limit 1
     ) checked_task on true
     where c.unit_id=unit
     union all
     select e.work_date,e.quantity::bigint*e.rate_paise::bigint amount_paise
     from public.production_entries e
     where e.unit_id=unit and e.status in ('approved','pending')
      and not exists(
       select 1 from public.daily_counts c join public.assignments a on a.id=c.assignment_id
       where c.employee_id=e.employee_id and c.unit_id=e.unit_id and c.work_date=e.work_date
        and a.operation_id=e.operation_id and a.lot_id=e.lot_id
      )
    ) amount_rows
    group by amount_rows.work_date
   ) by_day
  ),'[]'::jsonb));
 else
  result:=result||jsonb_build_object('teamMoney','[]'::jsonb);
 end if;
 return result||jsonb_build_object(
 'settings',(select jsonb_build_object('name',name,'phone',phone,'payPeriod',pay_period) from public.factory_settings),
 'corrections',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'employeeName',p.name,'unitId',r.unit_id,'assignmentId',r.assignment_id,'workDate',r.work_date,'originalQuantity',r.original_quantity,'requestedQuantity',r.requested_quantity,'reason',r.reason,'status',r.status,'createdAt',r.created_at,'reviewedBy',r.reviewed_by,'reviewedAt',r.reviewed_at,'reviewNote',r.review_note) order by r.created_at desc) from public.correction_requests r join public.profiles p on p.id=r.employee_id where viewer='admin' or (viewer='worker' and r.employee_id=actor) or (viewer='captain' and r.unit_id=unit)),'[]'::jsonb),
 'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'requestId',r.request_id,'employeeId',r.employee_id,'unitId',r.unit_id,'assignmentId',r.assignment_id,'workDate',r.work_date,'quantityDelta',r.quantity_delta,'ratePaise',case when viewer='captain' then 0 else r.rate_paise end,'amountPaise',case when viewer='captain' then 0 else r.amount_paise end,'createdBy',r.created_by,'createdAt',r.created_at) order by r.created_at desc) from public.wage_adjustments r where viewer='admin' or (viewer='worker' and r.employee_id=actor) or (viewer='captain' and r.unit_id=unit)),'[]'::jsonb));
end $$;

create function public.app_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();kind text:=p_action->>'type';v_id uuid;v_before jsonb;v_after jsonb;v_request public.correction_requests;
 v_assignment public.assignments;v_day public.day_checks;v_task jsonb;v_qty integer;v_current integer;v_rate integer;v_unit uuid;v_prereq uuid;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 if pg_column_size(p_action)>100000 then raise exception 'Request too large';end if;
 if kind='review_request' then perform private.check_admin();return public.perform_action(p_action);end if;
 if kind in ('assign_task','approve_day','admin_decide_day','revoke_device') then return public.daily_action(p_action);end if;
 if kind='request_correction' then
  if private.my_role()<>'worker' then raise exception 'Only an employee can request a correction' using errcode='42501';end if;
  select * into v_assignment from public.assignments where id=(p_action->>'assignmentId')::uuid and employee_id=actor;
  if v_assignment.id is null then raise exception 'Assigned work not found';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_assignment.id::text||(p_action->>'workDate'),2));
  select * into v_day from public.day_checks where employee_id=actor and work_date=(p_action->>'workDate')::date and status in ('approved','admin_approved');
  select t into v_task from jsonb_array_elements(v_day.tasks)t where t->>'assignmentId'=v_assignment.id::text;
  if v_task is null then raise exception 'Wait until the day is approved before requesting a correction';end if;
  v_current:=(v_task->>'finalQuantity')::integer+coalesce((select sum(quantity_delta)::integer from public.wage_adjustments where assignment_id=v_assignment.id and work_date=v_day.work_date),0);
  v_qty:=(p_action->>'quantity')::integer;
  if v_qty is null or v_qty not between 0 and 20000 or v_qty=v_current or length(trim(coalesce(p_action->>'reason',''))) not between 1 and 2000 then raise exception 'Enter a different valid count and a reason';end if;
  insert into public.correction_requests(employee_id,unit_id,assignment_id,work_date,original_quantity,requested_quantity,reason) values(actor,v_day.unit_id,v_assignment.id,v_day.work_date,v_current,v_qty,trim(p_action->>'reason')) returning id,to_jsonb(correction_requests.*) into v_id,v_after;
 elsif kind='deactivate_assignment' then
  select * into strict v_assignment from public.assignments where id=(p_action->>'id')::uuid for update;
  perform private.check_unit(v_assignment.unit_id);
  perform pg_advisory_xact_lock(hashtextextended(v_assignment.employee_id::text||coalesce(v_assignment.work_date,(now() at time zone 'Asia/Kolkata')::date)::text,1));
  if exists(select 1 from public.day_checks where employee_id=v_assignment.employee_id and work_date=coalesce(v_assignment.work_date,(now() at time zone 'Asia/Kolkata')::date)) or exists(select 1 from public.daily_counts where assignment_id=v_assignment.id and work_date=coalesce(v_assignment.work_date,(now() at time zone 'Asia/Kolkata')::date) and quantity>0) then raise exception 'Recorded or checked work cannot be removed';end if;
  if trim(coalesce(p_action->>'reason',''))='' then raise exception 'Enter a reason';end if;
  v_before:=to_jsonb(v_assignment);update public.assignments set active=false where id=v_assignment.id returning id,to_jsonb(assignments.*)||jsonb_build_object('reason',p_action->>'reason') into v_id,v_after;
 elsif kind in ('review_correction','save_settings','update_unit','update_line','update_style','update_operation','update_lot') then
  perform private.check_admin();
  if kind='review_correction' then
   select * into strict v_request from public.correction_requests where id=(p_action->>'id')::uuid for update;
   if v_request.status<>'pending' then raise exception 'This correction has already been reviewed';end if;
   if p_action->>'decision' is null or p_action->>'decision' not in ('accepted','rejected') then raise exception 'Choose a valid decision';end if;
   if p_action->>'decision'='rejected' and trim(coalesce(p_action->>'note',''))='' then raise exception 'Explain why the correction is rejected';end if;
   v_before:=to_jsonb(v_request);
   if p_action->>'decision'='accepted' then
    select * into strict v_day from public.day_checks where employee_id=v_request.employee_id and work_date=v_request.work_date and status in ('approved','admin_approved');
    select t into v_task from jsonb_array_elements(v_day.tasks)t where t->>'assignmentId'=v_request.assignment_id::text;
    if v_task is null then raise exception 'Approved task not found';end if;
    v_current:=(v_task->>'finalQuantity')::integer+coalesce((select sum(quantity_delta)::integer from public.wage_adjustments where assignment_id=v_request.assignment_id and work_date=v_request.work_date),0);
    v_qty:=v_request.requested_quantity-v_current;v_rate:=(v_task->>'ratePaise')::integer;
    insert into public.wage_adjustments(request_id,employee_id,unit_id,assignment_id,work_date,quantity_delta,rate_paise,amount_paise,created_by) values(v_request.id,v_request.employee_id,v_request.unit_id,v_request.assignment_id,v_request.work_date,v_qty,v_rate,v_qty::bigint*v_rate,actor);
   end if;
   update public.correction_requests set status=p_action->>'decision',reviewed_by=actor,reviewed_at=now(),review_note=left(coalesce(p_action->>'note',''),2000) where id=v_request.id returning id,to_jsonb(correction_requests.*) into v_id,v_after;
  elsif kind='save_settings' then
   select to_jsonb(s) into v_before from public.factory_settings s;
   update public.factory_settings set name=trim(p_action->>'name'),phone=trim(coalesce(p_action->>'phone','')),pay_period=p_action->>'payPeriod' returning to_jsonb(factory_settings.*) into v_after;v_id:=actor;
  else
   v_id:=(p_action->>'id')::uuid;
   if kind='update_unit' then
    select to_jsonb(u) into strict v_before from public.units u where id=v_id for update;
    if not (p_action->>'active')::boolean and exists(select 1 from public.unit_memberships m join public.profiles p on p.id=m.profile_id and p.active and p.role<>'admin' where m.unit_id=v_id and m.status='active') then raise exception 'Move or deactivate the unit employees first';end if;
    update public.units set name=trim(p_action->>'name'),code=trim(p_action->>'code'),active=(p_action->>'active')::boolean where id=v_id returning to_jsonb(units.*) into v_after;
   elsif kind='update_line' then
    select to_jsonb(l) into strict v_before from public.lines l where id=v_id for update;
    update public.lines set name=trim(p_action->>'name') where id=v_id returning to_jsonb(lines.*) into v_after;
   elsif kind='update_style' then
    select to_jsonb(s) into strict v_before from public.styles s where id=v_id for update;
    update public.styles set name=trim(p_action->>'name'),code=trim(p_action->>'code'),notes=left(coalesce(p_action->>'notes',''),2000) where id=v_id returning to_jsonb(styles.*) into v_after;
   elsif kind='update_operation' then
    select to_jsonb(o) into strict v_before from public.operations o where id=v_id for update;
    if jsonb_typeof(p_action->'prerequisiteIds') is distinct from 'array' then raise exception 'Choose earlier tasks';end if;
    for v_prereq in select value::uuid from jsonb_array_elements_text(p_action->'prerequisiteIds') loop
     if not exists(select 1 from public.operations where id=v_prereq and style_id=(v_before->>'style_id')::uuid and sequence<(v_before->>'sequence')::integer) then raise exception 'Choose earlier tasks from this style';end if;
    end loop;
    update public.operations set name=trim(p_action->>'name') where id=v_id;
    delete from public.operation_prereqs where operation_id=v_id;
    insert into public.operation_prereqs(operation_id,prerequisite_id) select v_id,value::uuid from jsonb_array_elements_text(p_action->'prerequisiteIds');
    select to_jsonb(o)||jsonb_build_object('prerequisiteIds',p_action->'prerequisiteIds') into v_after from public.operations o where id=v_id;
   elsif kind='update_lot' then
    select to_jsonb(l) into strict v_before from public.lots l where id=v_id for update;
    update public.lots set code=trim(p_action->>'code'),total_pieces=(p_action->>'totalPieces')::integer,status=p_action->>'status' where id=v_id returning to_jsonb(lots.*) into v_after;
   end if;
  end if;
 else return public.perform_action(p_action);
 end if;
 perform private.audit(actor,kind,v_id,v_before,v_after);return jsonb_build_object('id',v_id);
end $$;

-- Employee onboarding decisions are admin-only, including direct legacy RPC calls.
create function private.guard_employee_request_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and not coalesce(private.is_admin(),false) then
  raise exception 'Admin approval required' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.guard_employee_request_review() from public,anon,authenticated;
create trigger employee_request_admin_review_only
before update of status on public.employee_onboarding_requests
for each row execute function private.guard_employee_request_review();

create or replace function public.phone_request(p_hash text,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
 select p.id into profile from public.linked_phones d join public.profiles p on p.id=d.profile_id and p.active where d.token_hash=p_hash and d.revoked_at is null and d.expires_at>now() and p.role in ('worker','captain') for share of d,p;
 if profile is null then raise exception 'This phone is not linked. Ask the admin to link it again' using errcode='42501';end if;
 perform set_config('crewgrain.device_profile',profile::text,true);
 if p_operation='snapshot' then return public.get_app_snapshot();
 elsif p_operation='count' then return public.change_daily_count(p_payload);
 elsif p_operation='action' and p_payload->>'type' in ('assign_task','approve_day','deactivate_assignment','request_correction','request_employee','review_request','submit_report') then return public.app_action(p_payload);
 else raise exception 'This action is not available on this phone' using errcode='42501';end if;
end $$;
revoke all on function public.get_app_snapshot(),public.app_action(jsonb) from public,anon,authenticated;
grant execute on function public.get_app_snapshot(),public.app_action(jsonb) to authenticated,service_role;
