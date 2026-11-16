-- Admin "active users": a cheap last-seen time per person, with no always-on connection.
-- Staff phones are recorded server-side whenever they call phone_request; signed-in
-- users (admin, captains by email, web) call public.touch_presence() from the app.
-- A person's row is written at most once a minute, so a fresh row costs one index probe.
create table public.staff_presence(
 profile_id uuid primary key references public.profiles on delete cascade,
 last_seen_at timestamptz not null default now()
);
alter table public.staff_presence enable row level security;
revoke all on public.staff_presence from public,anon,authenticated;
grant all on public.staff_presence to service_role;

create function private.touch_presence(p_profile uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_profile is null then return;end if;
 insert into public.staff_presence(profile_id,last_seen_at) values(p_profile,now())
 on conflict (profile_id) do update set last_seen_at=now() where public.staff_presence.last_seen_at<now()-interval '1 minute';
end $$;
revoke all on function private.touch_presence(uuid) from public,anon,authenticated;

create function public.touch_presence() returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.me();
begin
 if me is null then return;end if;
 perform private.touch_presence(me);
end $$;
revoke all on function public.touch_presence() from public,anon;
grant execute on function public.touch_presence() to authenticated,service_role;

-- Staff phones: record presence for the device's profile, then run the request unchanged.
alter function public.phone_request(text,text,jsonb) set schema private;
alter function private.phone_request(text,text,jsonb) rename to phone_request_before_presence;
revoke all on function private.phone_request_before_presence(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.phone_request(p_hash text,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
 begin
  profile:=public.push_device_profile(p_hash);
  if profile is not null then perform private.touch_presence(profile);end if;
 exception when others then null;
 end;
 return private.phone_request_before_presence(p_hash,p_operation,p_payload);
end $$;
revoke all on function public.phone_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.phone_request(text,text,jsonb) to service_role;

-- Snapshot: admins also get who was seen in the last 7 days. Everyone else is unchanged.
alter function public.get_app_snapshot() rename to get_app_snapshot_before_presence;
revoke all on function public.get_app_snapshot_before_presence() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=public.get_app_snapshot_before_presence();
begin
 if not coalesce(private.is_admin(),false) then return base;end if;
 return base||jsonb_build_object('presence',coalesce((
  select jsonb_agg(jsonb_build_object('profileId',s.profile_id,'lastSeenAt',s.last_seen_at) order by s.last_seen_at desc)
  from public.staff_presence s join public.profiles p on p.id=s.profile_id and p.active and p.deleted_at is null
  where s.last_seen_at>now()-interval '7 days'),'[]'::jsonb));
end $$;
revoke all on function public.get_app_snapshot() from public,anon;
grant execute on function public.get_app_snapshot() to authenticated,service_role;

-- Retention: the existing nightly prune also drops presence rows older than 30 days.
create or replace function private.prune_history(p_days integer default 90) returns jsonb language plpgsql security definer set search_path='' as $$
declare contexts integer;attempts integer;seen integer;
begin
 if p_days is null or p_days<30 then raise exception 'Keep at least 30 days of history';end if;
 perform set_config('crewgrain.pruning','1',true);
 delete from public.count_event_context where received_at<now()-make_interval(days=>p_days);
 get diagnostics contexts=row_count;
 perform set_config('crewgrain.pruning','0',true);
 delete from public.login_attempts where window_start<now()-interval '1 day' and (employee_id like 'STAFF-%' or locked_until is null or locked_until<now());
 get diagnostics attempts=row_count;
 delete from public.staff_presence where last_seen_at<now()-interval '30 days';
 get diagnostics seen=row_count;
 return jsonb_build_object('countContextDeleted',contexts,'loginAttemptsDeleted',attempts,'presenceDeleted',seen);
end $$;
revoke all on function private.prune_history(integer) from public,anon,authenticated;
grant execute on function private.prune_history(integer) to service_role;
