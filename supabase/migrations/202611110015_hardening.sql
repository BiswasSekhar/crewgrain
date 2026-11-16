-- Hardening: safe casts, timestamp/rate guards on counts, admin count correction,
-- staff sign-in abuse limits and bounded history growth.
-- count_events (the permanent record), day_checks and wage_adjustments stay immutable.

-- 1. Safe parsing helpers: bad optional input becomes null instead of an error
--    that would stall a worker's whole batch.
create function private.try_uuid(p_value text) returns uuid language sql immutable set search_path='' as $$
 select case when p_value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then p_value::uuid end
$$;
create function private.try_timestamptz(p_value text) returns timestamptz language plpgsql stable set search_path='' as $$
begin
 if p_value is null or length(p_value)>64 then return null;end if;
 return p_value::timestamptz;
exception when others then return null;
end $$;
revoke all on function private.try_uuid(text),private.try_timestamptz(text) from public,anon,authenticated;

-- 2. Count capture. Replaces the wrapper from 202611100012 with the same
--    signature and behaviour, plus: capturedAt is clamped to the server clock
--    when it is missing, unparseable, >10 minutes in the future or >3 days old
--    (clamping, not rejecting, so a wrong phone clock never loses a tap), a
--    rate guard (max 300 taps per employee per rolling minute of capture time),
--    and a UUID check that cannot raise.
create or replace function public.change_daily_count(p_change jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;event public.count_events;capture jsonb:=p_change->'capture';context jsonb;source text;timing text;session text;previous_id uuid;gap integer;
 asked timestamptz;captured timestamptz;clamped boolean:=false;recent integer;change jsonb:=p_change;
begin
 -- Serialize capture against staff role/line/account transitions.
 perform 1 from public.profiles where id=private.me() for share;
 asked:=private.try_timestamptz(p_change->>'capturedAt');
 if asked is null or asked>now()+interval '10 minutes' or asked<now()-interval '3 days' then captured:=now();clamped:=true;else captured:=asked;end if;
 if jsonb_typeof(change)='object' then change:=change||jsonb_build_object('capturedAt',captured);end if;
 result:=private.change_daily_count_before_capture(change);
 -- Retrying an ID can never rewrite its original capture metadata.
 if coalesce((result->>'duplicate')::boolean,false) then return result;end if;
 select * into strict event from public.count_events where id=(change->>'id')::uuid;
 -- Plausibility guard. Raising here rolls back this change entirely.
 select count(*) into recent from public.count_events e where e.employee_id=event.employee_id and e.captured_at>event.captured_at-interval '1 minute' and e.captured_at<=event.captured_at;
 if recent>300 then raise exception 'Too many counts too quickly. Check the phone clock and try again.' using errcode='54000';end if;
 source:=case when capture->>'source' in ('add','subtract','correction') then capture->>'source' else 'legacy' end;
 timing:=case when capture->>'timing' in ('first','between_additions','interrupted','correction') then capture->>'timing' else 'unknown' end;
 session:=left(capture->>'sessionId',100);
 -- Client intervals are approximate. Only keep a chain linked to an earlier
 -- positive addition for this employee, assignment, day and foreground session.
 previous_id:=private.try_uuid(capture->>'previousEventId');
 if source='add' and event.delta=1 and timing='between_additions' and previous_id is not null and capture->>'intervalMs' ~ '^[0-9]{1,7}$' then
  gap:=(capture->>'intervalMs')::integer;
  if gap>1800000 or not exists(select 1 from public.count_events e join public.count_event_context c on c.event_id=e.id where e.id=previous_id and e.employee_id=event.employee_id and e.assignment_id=event.assignment_id and e.work_date=event.work_date and e.delta=1 and c.source='add' and c.session_id=session and e.captured_at<=event.captured_at) then previous_id:=null;gap:=null;timing:='interrupted';end if;
 else previous_id:=null;gap:=null;if source in ('subtract','correction') or event.delta<>1 then timing:='correction';end if;end if;
 select jsonb_build_object('lineId',a.unit_id,'styleId',s.id,'styleCode',s.code,'material',coalesce(nullif(a.material,''),s.material),'operationId',o.id,'operationCode',o.code,'operationName',o.name,'actions',o.steps,'standardSeconds',pricing.seconds,'ratePaise',d.rate_paise,'assignmentId',a.id,'batchId',a.lot_id)
 into context from public.assignments a join public.operations o on o.id=a.operation_id join public.styles s on s.id=o.style_id left join public.operation_pricing pricing on pricing.operation_id=o.id join public.daily_counts d on d.assignment_id=a.id and d.work_date=event.work_date where a.id=event.assignment_id;
 if clamped then context:=coalesce(context,'{}'::jsonb)||jsonb_build_object('capturedAtClamped',true,'capturedAtClaimed',left(p_change->>'capturedAt',64));end if;
 insert into public.count_event_context(event_id,source,session_id,previous_event_id,interval_ms,timing,client_context,server_context)
 values(event.id,source,session,previous_id,gap,timing,case when jsonb_typeof(capture->'context')='object' and pg_column_size(capture->'context')<8000 then capture->'context' else '{}'::jsonb end,context);
 return result;
end $$;

-- 3. Admin correction of an approved day. The worker's count and the approved
--    day stay untouched; the correction is an accepted correction_request plus
--    an immutable wage_adjustments row (the same model as an employee-requested
--    correction), so the snapshot 'adjustments' and wage totals already show it.
alter table public.correction_requests add column source text not null default 'employee' check(source in ('employee','admin'));
create function public.admin_adjust_count(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_assignment public.assignments;v_employee uuid;v_date date;v_qty integer;v_reason text;v_day public.day_checks;v_task jsonb;
 v_current integer;v_delta integer;v_rate integer;v_request uuid;v_adjustment public.wage_adjustments;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_admin();
 if jsonb_typeof(p_action) is distinct from 'object' or pg_column_size(p_action)>20000 then raise exception 'Invalid correction';end if;
 v_employee:=private.try_uuid(p_action->>'employeeId');
 v_reason:=trim(coalesce(p_action->>'reason',''));
 if v_employee is null or private.try_uuid(p_action->>'assignmentId') is null or p_action->>'workDate' !~ '^\d{4}-\d{2}-\d{2}$' or p_action->>'quantity' !~ '^[0-9]{1,5}$' then raise exception 'Choose the employee, task, date and a whole-number count';end if;
 begin v_date:=(p_action->>'workDate')::date;exception when others then raise exception 'Choose a valid date';end;
 v_qty:=(p_action->>'quantity')::integer;
 if v_qty not between 0 and 20000 then raise exception 'Count must be between 0 and 20000';end if;
 if length(v_reason) not between 1 and 2000 then raise exception 'Enter a reason for the correction';end if;
 -- Same lock key as request_correction so two corrections never race.
 perform pg_advisory_xact_lock(hashtextextended(private.try_uuid(p_action->>'assignmentId')::text||v_date::text,2));
 select * into v_assignment from public.assignments where id=private.try_uuid(p_action->>'assignmentId') for share;
 if v_assignment.id is null or v_assignment.employee_id<>v_employee then raise exception 'Assigned work not found for this employee';end if;
 select * into v_day from public.day_checks where employee_id=v_employee and work_date=v_date and status in ('approved','admin_approved');
 if v_day.id is null then raise exception 'Approve the day first, then correct the count';end if;
 if v_day.unit_id<>v_assignment.unit_id then raise exception 'This task belongs to a different line than the approved day';end if;
 select t into v_task from jsonb_array_elements(v_day.tasks)t where t->>'assignmentId'=v_assignment.id::text;
 if v_task is null then raise exception 'Approved task not found';end if;
 if exists(select 1 from public.correction_requests where assignment_id=v_assignment.id and work_date=v_date and status='pending') then raise exception 'Decide the pending correction request first';end if;
 v_current:=(v_task->>'finalQuantity')::integer+coalesce((select sum(quantity_delta)::integer from public.wage_adjustments where assignment_id=v_assignment.id and work_date=v_date),0);
 v_delta:=v_qty-v_current;
 if v_delta=0 then raise exception 'The count already matches';end if;
 v_rate:=(v_task->>'ratePaise')::integer;
 insert into public.correction_requests(employee_id,unit_id,assignment_id,work_date,original_quantity,requested_quantity,reason,status,reviewed_by,reviewed_at,review_note,source)
 values(v_employee,v_day.unit_id,v_assignment.id,v_date,v_current,v_qty,v_reason,'accepted',actor,now(),'Admin correction','admin') returning id into v_request;
 insert into public.wage_adjustments(request_id,employee_id,unit_id,assignment_id,work_date,quantity_delta,rate_paise,amount_paise,created_by)
 values(v_request,v_employee,v_day.unit_id,v_assignment.id,v_date,v_delta,v_rate,v_delta::bigint*v_rate,actor) returning * into v_adjustment;
 perform private.audit(actor,'admin_adjust_count',v_adjustment.id,jsonb_build_object('quantity',v_current),jsonb_build_object('quantity',v_qty,'delta',v_delta,'ratePaise',v_rate,'amountPaise',v_adjustment.amount_paise,'assignmentId',v_assignment.id,'employeeId',v_employee,'workDate',v_date,'reason',v_reason,'requestId',v_request));
 return jsonb_build_object('id',v_adjustment.id,'requestId',v_request,'quantityDelta',v_delta,'finalQuantity',v_qty,'amountPaise',v_adjustment.amount_paise);
end $$;
revoke all on function public.admin_adjust_count(jsonb) from public,anon;
grant execute on function public.admin_adjust_count(jsonb) to authenticated,service_role;

-- 4. Staff sign-in abuse limits. Opportunistically purge old throttle rows,
--    keep only the newest 5 active phones per profile, and write at most one
--    sign-in audit row per profile per hour.
create or replace function public.reserve_staff_login(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.login_attempts;
begin
 if p_key !~ '^STAFF-[0-9a-f]{64}$' then return false; end if;
 delete from public.login_attempts where employee_id like 'STAFF-%' and window_start<now()-interval '1 day' and employee_id<>p_key;
 insert into public.login_attempts(employee_id) values(p_key) on conflict do nothing;
 select * into r from public.login_attempts where employee_id=p_key for update;
 if r.window_start < now()-interval '15 minutes' then
  r.attempts:=0; r.window_start:=now();
 end if;
 if r.attempts >= 60 then return false; end if;
 update public.login_attempts set attempts=r.attempts+1,window_start=r.window_start where employee_id=p_key;
 return true;
end $$;

create or replace function public.staff_sign_in(p_identifier text,p_device_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare identifier text:=upper(trim(p_identifier)); digits text;
 matches uuid[]; profile uuid; device uuid;
begin
 if identifier is null or length(identifier) not between 1 and 40 or p_device_hash is null or p_device_hash !~ '^[a-f0-9]{64}$' then return null; end if;
 digits:=regexp_replace(identifier,'[^0-9]','','g');
 if length(digits)=12 and left(digits,2)='91' then digits:=right(digits,10); end if;
 select array_agg(p.id) into matches from public.profiles p
 where p.active and p.role in ('worker','captain')
 and exists(select 1 from public.unit_memberships m join public.units u on u.id=m.unit_id and u.active where m.profile_id=p.id and m.status='active')
 and (upper(p.employee_id)=identifier or (
  identifier ~ '^[+0-9 ().-]+$' and length(digits)>=7 and p.phone is not null and
  case when length(regexp_replace(p.phone,'[^0-9]','','g'))=12 and left(regexp_replace(p.phone,'[^0-9]','','g'),2)='91'
   then right(regexp_replace(p.phone,'[^0-9]','','g'),10)
   else regexp_replace(p.phone,'[^0-9]','','g') end = digits
 ));
 -- Duplicate/shared numbers are ambiguous: use the unique employee ID instead.
 if coalesce(array_length(matches,1),0)<>1 then return null; end if;
 profile:=matches[1];
 perform pg_advisory_xact_lock(hashtextextended(profile::text,3));
 insert into public.linked_phones(profile_id,token_hash) values(profile,p_device_hash) returning id into device;
 update public.linked_phones set revoked_at=now() where profile_id=profile and revoked_at is null
  and id not in (select id from public.linked_phones where profile_id=profile and revoked_at is null order by created_at desc,id desc limit 5);
 if not exists(select 1 from public.audit_log where actor_id=profile and action='staff_signed_in' and created_at>now()-interval '1 hour') then
  perform private.audit(profile,'staff_signed_in',device,null,jsonb_build_object('profileId',profile));
 end if;
 return device;
end $$;

-- 5. Retention. Never touches count_events (the permanent record) or audit_log.
--    Only count_event_context (analytics context, large) and throttle rows go.
--    Schedule on Supabase with pg_cron (enable the extension in the dashboard):
--      select cron.schedule('crewgrain-prune-history','30 21 * * *',$$select private.prune_history(90)$$);
--    (21:30 UTC is 03:00 India time.) Re-run is safe and idempotent.
create function private.immutable_count_context() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and current_setting('crewgrain.pruning',true)='1' then return old;end if;
 raise exception 'Count events are immutable';
end $$;
revoke all on function private.immutable_count_context() from public,anon,authenticated;
drop trigger count_context_immutable on public.count_event_context;
create trigger count_context_immutable before update or delete on public.count_event_context for each row execute function private.immutable_count_context();
create index count_context_received on public.count_event_context(received_at);

create function private.prune_history(p_days integer default 90) returns jsonb language plpgsql security definer set search_path='' as $$
declare contexts integer;attempts integer;
begin
 if p_days is null or p_days<30 then raise exception 'Keep at least 30 days of history';end if;
 perform set_config('crewgrain.pruning','1',true);
 delete from public.count_event_context where received_at<now()-make_interval(days=>p_days);
 get diagnostics contexts=row_count;
 perform set_config('crewgrain.pruning','0',true);
 delete from public.login_attempts where window_start<now()-interval '1 day' and (employee_id like 'STAFF-%' or locked_until is null or locked_until<now());
 get diagnostics attempts=row_count;
 return jsonb_build_object('countContextDeleted',contexts,'loginAttemptsDeleted',attempts);
end $$;
revoke all on function private.prune_history(integer) from public,anon,authenticated;
grant execute on function private.prune_history(integer) to service_role;
