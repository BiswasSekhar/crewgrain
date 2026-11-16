-- Push notification tokens. Direct table access is closed; only the functions
-- below (and the send-push Edge Function using the service role) touch them.
create table public.push_tokens(
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.profiles on delete cascade,
 token text not null check(token ~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' and length(token)<=200),
 platform text not null default 'android' check(platform in ('android','ios','web')),
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 unique(profile_id,token)
);
create index push_tokens_profile on public.push_tokens(profile_id,last_seen_at desc);
create table public.push_rate(
 caller uuid not null references public.profiles on delete cascade,
 window_start timestamptz not null,
 hits int not null default 0,
 primary key(caller,window_start)
);
alter table public.push_tokens enable row level security;
alter table public.push_rate enable row level security;
revoke all on public.push_tokens,public.push_rate from anon,authenticated;
grant all on public.push_tokens,public.push_rate to service_role;

-- Stores a token for one profile and keeps only the newest 3 per profile.
create function private.store_push_token(p_profile uuid,p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_profile is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' or length(p_token)>200 then
  raise exception 'Invalid push token' using errcode='22023'; end if;
 if coalesce(p_platform,'') not in ('android','ios','web') then raise exception 'Invalid platform' using errcode='22023'; end if;
 -- A phone token belongs to one profile at a time (shared or handed-over phones).
 delete from public.push_tokens where token=p_token and profile_id<>p_profile;
 insert into public.push_tokens(profile_id,token,platform) values(p_profile,p_token,p_platform)
  on conflict(profile_id,token) do update set last_seen_at=now(),platform=excluded.platform;
 delete from public.push_tokens where profile_id=p_profile and id not in
  (select id from public.push_tokens where profile_id=p_profile order by last_seen_at desc,created_at desc limit 3);
end $$;

-- For signed-in admins (and anything resolved by private.me()). No profile
-- argument exists, so a caller can only register for themselves.
create function public.register_push_token(p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.store_push_token(private.me(),p_token,p_platform);
end $$;

-- Service-role helpers used by the send-push Edge Function.
create function public.push_device_profile(p_hash text) returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.linked_phones d join public.profiles p on p.id=d.profile_id and p.active and p.deleted_at is null
 where d.token_hash=p_hash and d.revoked_at is null and d.expires_at>now() and p.role in ('worker','captain') limit 1
$$;
create function public.service_register_push_token(p_profile uuid,p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.store_push_token(p_profile,p_token,p_platform);
end $$;
create function public.remove_push_tokens(p_tokens text[]) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from public.push_tokens where token=any(p_tokens);get diagnostics n=row_count;return n;
end $$;
create function public.push_rate_ok(p_caller uuid,p_limit integer default 30) returns boolean language plpgsql security definer set search_path='' as $$
declare w timestamptz:=date_trunc('minute',now())-(extract(minute from now())::int%10)*interval '1 minute';n int;
begin
 delete from public.push_rate where window_start<now()-interval '1 day';
 insert into public.push_rate(caller,window_start,hits) values(p_caller,w,1)
  on conflict(caller,window_start) do update set hits=public.push_rate.hits+1 returning hits into n;
 return n<=p_limit;
end $$;

-- Recipients are always derived here from stored data, never from the client.
-- Returns only tokens; no names or amounts leave the database.
create function public.push_recipients(p_event text,p_caller uuid,p_ref uuid default null) returns text[] language plpgsql security definer set search_path='' as $$
declare v_role public.crewgrain_role;v_tokens text[];
begin
 select role into v_role from public.profiles where id=p_caller and active and deleted_at is null;
 if v_role is null then return '{}'; end if;
 if p_event in ('request_submitted','report_submitted','count_change_pending') then
  if v_role not in ('captain','admin') and not (p_event='count_change_pending' and v_role='worker') then return '{}'; end if;
  select coalesce(array_agg(t.token),'{}') into v_tokens from public.push_tokens t join public.profiles a on a.id=t.profile_id
   where a.role='admin' and a.active and a.deleted_at is null and a.id<>p_caller;
 elsif p_event='day_approved' then
  if p_ref is null or v_role not in ('captain','admin') then return '{}'; end if;
  if v_role='captain' and not exists(select 1 from public.day_checks d where d.employee_id=p_ref and d.captain_id=p_caller
     and d.status in ('approved','admin_approved') and d.work_date>=current_date-3) then return '{}'; end if;
  select coalesce(array_agg(t.token),'{}') into v_tokens from public.push_tokens t join public.profiles e on e.id=t.profile_id
   where e.id=p_ref and e.active and e.deleted_at is null;
 else return '{}'; end if;
 return v_tokens;
end $$;

revoke all on function public.register_push_token(text,text),public.push_device_profile(text),public.service_register_push_token(uuid,text,text),
 public.remove_push_tokens(text[]),public.push_rate_ok(uuid,integer),public.push_recipients(text,uuid,uuid),private.store_push_token(uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_push_token(text,text) to authenticated;
grant execute on function public.push_device_profile(text),public.service_register_push_token(uuid,text,text),public.remove_push_tokens(text[]),
 public.push_rate_ok(uuid,integer),public.push_recipients(text,uuid,uuid) to service_role;
