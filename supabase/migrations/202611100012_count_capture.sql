-- Append-only capture context. Never include this growing event stream in app snapshots.
create table public.count_event_context(
 event_id uuid primary key references public.count_events,
 source text not null check(source in ('add','subtract','correction','legacy')),
 session_id text,previous_event_id uuid references public.count_events,interval_ms integer check(interval_ms between 0 and 1800000),
 timing text not null,client_context jsonb not null default '{}',server_context jsonb not null,
 received_at timestamptz not null default now()
);
alter table public.count_event_context enable row level security;
revoke all on public.count_event_context from public,anon,authenticated;
grant all on public.count_event_context to service_role;
create trigger count_context_immutable before update or delete on public.count_event_context for each row execute function private.immutable_count_event();
create index count_employee_operation_time on public.count_events(employee_id,assignment_id,captured_at);
create index count_line_date_time on public.count_events(unit_id,work_date,captured_at);

alter function public.change_daily_count(jsonb) set schema private;
alter function private.change_daily_count(jsonb) rename to change_daily_count_before_capture;
revoke all on function private.change_daily_count_before_capture(jsonb) from public,anon,authenticated,service_role;
create function public.change_daily_count(p_change jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;event public.count_events;capture jsonb:=p_change->'capture';context jsonb;source text;timing text;session text;previous_id uuid;gap integer;
begin
 -- Serialize capture against staff role/line/account transitions.
 perform 1 from public.profiles where id=private.me() for share;
 result:=private.change_daily_count_before_capture(p_change);
 -- Retrying an ID can never rewrite its original capture metadata.
 if coalesce((result->>'duplicate')::boolean,false) then return result;end if;
 select * into strict event from public.count_events where id=(p_change->>'id')::uuid;
 source:=case when capture->>'source' in ('add','subtract','correction') then capture->>'source' else 'legacy' end;
 timing:=case when capture->>'timing' in ('first','between_additions','interrupted','correction') then capture->>'timing' else 'unknown' end;
 session:=left(capture->>'sessionId',100);
 -- Client intervals are approximate. Only keep a chain linked to an earlier
 -- positive addition for this employee, assignment, day and foreground session.
 if source='add' and event.delta=1 and timing='between_additions' and capture->>'previousEventId' ~ '^[0-9a-fA-F-]{36}$' and capture->>'intervalMs' ~ '^[0-9]{1,7}$' then
  previous_id:=(capture->>'previousEventId')::uuid;gap:=(capture->>'intervalMs')::integer;
  if gap>1800000 or not exists(select 1 from public.count_events e join public.count_event_context c on c.event_id=e.id where e.id=previous_id and e.employee_id=event.employee_id and e.assignment_id=event.assignment_id and e.work_date=event.work_date and e.delta=1 and c.source='add' and c.session_id=session and e.captured_at<=event.captured_at) then previous_id:=null;gap:=null;timing:='interrupted';end if;
 else previous_id:=null;gap:=null;if source in ('subtract','correction') or event.delta<>1 then timing:='correction';end if;end if;
 select jsonb_build_object('lineId',a.unit_id,'styleId',s.id,'styleCode',s.code,'material',coalesce(nullif(a.material,''),s.material),'operationId',o.id,'operationCode',o.code,'operationName',o.name,'actions',o.steps,'standardSeconds',pricing.seconds,'ratePaise',d.rate_paise,'assignmentId',a.id,'batchId',a.lot_id)
 into context from public.assignments a join public.operations o on o.id=a.operation_id join public.styles s on s.id=o.style_id left join public.operation_pricing pricing on pricing.operation_id=o.id join public.daily_counts d on d.assignment_id=a.id and d.work_date=event.work_date where a.id=event.assignment_id;
 insert into public.count_event_context(event_id,source,session_id,previous_event_id,interval_ms,timing,client_context,server_context)
 values(event.id,source,session,previous_id,gap,timing,case when jsonb_typeof(capture->'context')='object' and pg_column_size(capture->'context')<8000 then capture->'context' else '{}'::jsonb end,context);
 return result;
end $$;
revoke all on function public.change_daily_count(jsonb) from public,anon;
grant execute on function public.change_daily_count(jsonb) to authenticated,service_role;

-- One network request preserves every tap and its ordering. Individual failures
-- remain in the device outbox rather than dropping the whole batch.
create function public.change_daily_counts(p_changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;results jsonb:='[]';result jsonb;
begin
 if private.me() is null or private.my_role()<>'worker' then raise exception 'Employee access required' using errcode='42501';end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>40 or pg_column_size(p_changes)>400000 then raise exception 'Invalid count batch';end if;
 for item in select * from jsonb_array_elements(p_changes) loop
  begin result:=public.change_daily_count(item);results:=results||jsonb_build_array(result);
  exception when others then
   results:=results||jsonb_build_array(jsonb_build_object('id',item->>'id','error',sqlerrm,'code',sqlstate));
   -- Later changes may depend on this quantity or predecessor. Retry them only
   -- after the failed change has been resolved.
   exit;
  end;
 end loop;
 return results;
end $$;
revoke all on function public.change_daily_counts(jsonb) from public,anon;
grant execute on function public.change_daily_counts(jsonb) to authenticated,service_role;

alter function public.phone_request(text,text,jsonb) set schema private;
alter function private.phone_request(text,text,jsonb) rename to phone_request_before_operations;
revoke all on function private.phone_request_before_operations(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.phone_request(p_hash text,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
 if p_operation='count_batch' or (p_operation='action' and p_payload->>'type' in ('assign_operations','apply_line_defaults')) then
  select p.id into profile from public.linked_phones d join public.profiles p on p.id=d.profile_id and p.active and p.deleted_at is null where d.token_hash=p_hash and d.revoked_at is null and d.expires_at>now() and p.role in ('worker','captain') for share of d,p;
  if profile is null then raise exception 'This phone is not linked' using errcode='42501';end if;
  perform set_config('crewgrain.device_profile',profile::text,true);
  if p_operation='count_batch' then return public.change_daily_counts(p_payload);else return public.operations_action(p_payload);end if;
 end if;
 return private.phone_request_before_operations(p_hash,p_operation,p_payload);
end $$;
revoke all on function public.phone_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.phone_request(text,text,jsonb) to service_role;
