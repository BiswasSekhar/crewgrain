-- Vendor kill switch. The whole service can be paused (or put into a warning
-- state) by the database owner only. No RPC callable by anon, authenticated or
-- service_role can change it, so the client's admins cannot un-pause the app.
-- Nothing is deleted while suspended: writes are refused, rows are untouched,
-- and resuming restores everything. pg_dump, migrations and the vendor's own
-- owner-level scripts keep working because they never go through private.me().
--
-- Vendor use (as the database owner):
--   select private.set_service_state('suspended','Payment pending. Contact the vendor.');
--   select private.set_service_state('warning','Renewal due on 30 Nov.');
--   select private.set_service_state('active');

create table public.service_status(
 id boolean primary key default true check(id),
 state text not null default 'active' check(state in ('active','warning','suspended')),
 message text not null default '' check(length(message)<=300),
 changed_at timestamptz not null default now()
);
insert into public.service_status(id) values(true);
create table public.service_status_log(
 id uuid primary key default gen_random_uuid(),
 state text not null,
 message text not null default '',
 changed_at timestamptz not null default now(),
 changed_by text default current_user
);
alter table public.service_status enable row level security;
alter table public.service_status_log enable row level security;
revoke all on public.service_status,public.service_status_log from public,anon,authenticated,service_role;
grant select on public.service_status,public.service_status_log to service_role;
insert into public.service_status_log(state,message,changed_by) values('active','','migration');

create function private.set_service_state(p_state text,p_message text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare v_message text:=trim(coalesce(p_message,''));
begin
 if p_state is null or p_state not in ('active','warning','suspended') then
  raise exception 'State must be active, warning or suspended' using errcode='22023';end if;
 if length(v_message)>300 then raise exception 'Message is limited to 300 characters' using errcode='22023';end if;
 update public.service_status set state=p_state,message=v_message,changed_at=now() where id;
 insert into public.service_status_log(state,message,changed_by) values(p_state,v_message,session_user);
 return jsonb_build_object('state',p_state,'message',v_message);
end $$;
revoke all on function private.set_service_state(text,text) from public,anon,authenticated,service_role;

create function public.service_gate() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',s.state,'message',s.message) from public.service_status s where s.id
$$;
revoke all on function public.service_gate() from public;
grant execute on function public.service_gate() to anon,authenticated,service_role;

-- Shared check for entry points that do not go through private.me().
create function private.assert_service_running() returns void language plpgsql stable security definer set search_path='' as $$
declare s public.service_status;
begin
 select * into s from public.service_status where id;
 if s.state='suspended' then raise exception 'SERVICE_PAUSED|%',s.message using errcode='P0001';end if;
end $$;
revoke all on function private.assert_service_running() from public,anon,authenticated,service_role;

-- The choke point: every role/unit/admin helper and every RLS policy resolves the
-- caller through private.me(), so a suspended service refuses all of them here.
-- Otherwise identical to the 202611070002 definition.
create or replace function private.me() returns uuid language plpgsql stable security definer set search_path='' as $$
declare s public.service_status;
begin
 select * into s from public.service_status where id;
 if s.state='suspended' then raise exception 'SERVICE_PAUSED|%',s.message using errcode='P0001';end if;
 return (select p.id from public.profiles p where p.active and (
  p.auth_user_id=auth.uid() or
  (current_setting('role',true)='service_role' and p.id=nullif(current_setting('crewgrain.device_profile',true),'')::uuid)
 ) limit 1);
end $$;

-- Staff ID / phone sign-in.
alter function public.staff_sign_in(text,text) set schema private;
alter function private.staff_sign_in(text,text) rename to staff_sign_in_before_service;
revoke all on function private.staff_sign_in_before_service(text,text) from public,anon,authenticated,service_role;
create function public.staff_sign_in(p_identifier text,p_device_hash text) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_service_running();
 return private.staff_sign_in_before_service(p_identifier,p_device_hash);
end $$;
revoke all on function public.staff_sign_in(text,text) from public,anon,authenticated;
grant execute on function public.staff_sign_in(text,text) to service_role;

-- Staff phones: refuse before anything else (some operations never reach private.me()).
alter function public.phone_request(text,text,jsonb) set schema private;
alter function private.phone_request(text,text,jsonb) rename to phone_request_before_service;
revoke all on function private.phone_request_before_service(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.phone_request(p_hash text,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_service_running();
 return private.phone_request_before_service(p_hash,p_operation,p_payload);
end $$;
revoke all on function public.phone_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.phone_request(text,text,jsonb) to service_role;

-- Snapshot: in 'warning' everyone also gets {service:{state,message}}.
alter function public.get_app_snapshot() rename to get_app_snapshot_before_service;
revoke all on function public.get_app_snapshot_before_service() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.service_status;base jsonb;
begin
 select * into s from public.service_status where id;
 if s.state='suspended' then raise exception 'SERVICE_PAUSED|%',s.message using errcode='P0001';end if;
 base:=public.get_app_snapshot_before_service();
 if s.state='warning' then base:=base||jsonb_build_object('service',jsonb_build_object('state',s.state,'message',s.message));end if;
 return base;
end $$;
revoke all on function public.get_app_snapshot() from public,anon;
grant execute on function public.get_app_snapshot() to authenticated,service_role;

-- Push: no recipients while suspended; scheduled reminders only when running.
alter function public.push_recipients(text,uuid,uuid) set schema private;
alter function private.push_recipients(text,uuid,uuid) rename to push_recipients_before_service;
revoke all on function private.push_recipients_before_service(text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.push_recipients(p_event text,p_caller uuid,p_ref uuid default null) returns text[] language plpgsql security definer set search_path='' as $$
begin
 if (select state from public.service_status where id)='suspended' then return '{}';end if;
 return private.push_recipients_before_service(p_event,p_caller,p_ref);
end $$;
revoke all on function public.push_recipients(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_recipients(text,uuid,uuid) to service_role;

alter function public.scheduled_push_recipients(text,timestamptz) set schema private;
alter function private.scheduled_push_recipients(text,timestamptz) rename to scheduled_push_recipients_before_service;
revoke all on function private.scheduled_push_recipients_before_service(text,timestamptz) from public,anon,authenticated,service_role;
create function public.scheduled_push_recipients(p_kind text,p_now timestamptz default now()) returns text[] language plpgsql security definer set search_path='' as $$
begin
 if (select state from public.service_status where id)='suspended' then return '{}';end if;
 return private.scheduled_push_recipients_before_service(p_kind,p_now);
end $$;
revoke all on function public.scheduled_push_recipients(text,timestamptz) from public,anon,authenticated;
grant execute on function public.scheduled_push_recipients(text,timestamptz) to service_role;

alter function private.run_scheduled_push(text) rename to run_scheduled_push_before_service;
revoke all on function private.run_scheduled_push_before_service(text) from public,anon,authenticated,service_role;
create function private.run_scheduled_push(p_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select state from public.service_status where id) not in ('active','warning') then return;end if;
 perform private.run_scheduled_push_before_service(p_kind);
end $$;
revoke all on function private.run_scheduled_push(text) from public,anon,authenticated;
