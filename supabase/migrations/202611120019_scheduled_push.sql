-- Scheduled and captain-driven push notifications.
--  * morning_plan  (08:30 IST): captains whose line has no day plan yet.
--  * evening_check (18:00 IST): captains with counted but unchecked workers.
--  * admin_day_checked: a captain checked one employee's day -> admins.
--  * line_check_complete: a captain finished the whole line for a day -> admins, once per line per date.
-- Delivery stays in the send-push Edge Function. pg_cron only calls it over
-- pg_net with a shared secret, so no signed-in caller is needed.

-- Settings only the service role can read (function URL and shared secret).
create table public.push_config(
 key text primary key check(key in ('function_url','cron_secret')),
 value text not null check(length(value) between 8 and 500)
);
alter table public.push_config enable row level security;
revoke all on public.push_config from public,anon,authenticated;
grant all on public.push_config to service_role;

-- One row per reminder actually claimed, so cron running twice sends nothing twice.
create table public.push_reminder_log(
 kind text not null check(kind in ('morning_plan','evening_check')),
 work_date date not null,
 profile_id uuid not null references public.profiles on delete cascade,
 created_at timestamptz not null default now(),
 primary key(kind,work_date,profile_id)
);
-- One row per line and date once its completion notice was claimed.
create table public.push_line_complete(
 unit_id uuid not null references public.units on delete cascade,
 work_date date not null,
 created_at timestamptz not null default now(),
 primary key(unit_id,work_date)
);
alter table public.push_reminder_log enable row level security;
alter table public.push_line_complete enable row level security;
revoke all on public.push_reminder_log,public.push_line_complete from public,anon,authenticated;
grant all on public.push_reminder_log,public.push_line_complete to service_role;

-- Claims and returns the tokens for one scheduled kind. Callable without HTTP
-- (tests) and by the Edge Function with the service role. A second call for the
-- same date returns nobody. Also prunes log rows older than 30 days.
create function public.scheduled_push_recipients(p_kind text,p_now timestamptz default now()) returns text[] language plpgsql security definer set search_path='' as $$
declare v_date date:=(p_now at time zone 'Asia/Kolkata')::date;v_tokens text[];
begin
 if p_kind not in ('morning_plan','evening_check') then return '{}'; end if;
 delete from public.push_reminder_log where work_date<v_date-30;
 delete from public.push_line_complete where work_date<v_date-30;
 with eligible as (
  select c.id,m.unit_id from public.profiles c
  join public.unit_memberships m on m.profile_id=c.id and m.status='active' and m.role='captain'
  where c.role='captain' and c.active and c.deleted_at is null
   and exists(select 1 from public.push_tokens t where t.profile_id=c.id)
   and case when p_kind='morning_plan'
    then not exists(select 1 from public.day_plan d where d.unit_id=m.unit_id and d.work_date=v_date)
    else exists(select 1 from public.daily_counts q where q.unit_id=m.unit_id and q.work_date=v_date and q.quantity>0
      and not exists(select 1 from public.day_checks k where k.employee_id=q.employee_id and k.work_date=v_date)) end
 ), claimed as (
  insert into public.push_reminder_log(kind,work_date,profile_id)
  select p_kind,v_date,e.id from eligible e on conflict do nothing returning profile_id
 )
 select coalesce(array_agg(t.token),'{}') into v_tokens from public.push_tokens t join claimed on claimed.profile_id=t.profile_id;
 return v_tokens;
end $$;

-- Called by pg_cron (runs as the owner). Posts to the Edge Function; does nothing
-- until both settings rows exist, which is also how reminders are switched off.
create function private.run_scheduled_push(p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare v_url text;v_secret text;
begin
 if p_kind not in ('morning_plan','evening_check') then return; end if;
 select value into v_url from public.push_config where key='function_url';
 select value into v_secret from public.push_config where key='cron_secret';
 if v_url is null or v_secret is null then return; end if;
 perform net.http_post(url:=v_url,
  headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret),
  body:=jsonb_build_object('operation','scheduled','kind',p_kind),timeout_milliseconds:=10000);
end $$;

-- Captain-driven admin events. Same caller-derived recipients as before.
create or replace function public.push_recipients(p_event text,p_caller uuid,p_ref uuid default null) returns text[] language plpgsql security definer set search_path='' as $$
declare v_role public.crewgrain_role;v_tokens text[];v_unit uuid;v_date date;
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
 elsif p_event='admin_day_checked' then
  -- Only a captain who really checked a day in the last 15 minutes.
  if v_role<>'captain' or not exists(select 1 from public.day_checks d where d.captain_id=p_caller and d.checked_at>now()-interval '15 minutes') then return '{}'; end if;
  select coalesce(array_agg(t.token),'{}') into v_tokens from public.push_tokens t join public.profiles a on a.id=t.profile_id
   where a.role='admin' and a.active and a.deleted_at is null;
 elsif p_event='line_check_complete' then
  if v_role<>'captain' then return '{}'; end if;
  select m.unit_id into v_unit from public.unit_memberships m where m.profile_id=p_caller and m.role='captain' and m.status='active';
  select d.work_date into v_date from public.day_checks d where d.captain_id=p_caller and d.unit_id=v_unit and d.checked_at>now()-interval '15 minutes'
   order by d.checked_at desc limit 1;
  if v_unit is null or v_date is null then return '{}'; end if;
  -- Every worker with counts above zero must now have a check.
  if exists(select 1 from public.daily_counts q where q.unit_id=v_unit and q.work_date=v_date and q.quantity>0
     and not exists(select 1 from public.day_checks k where k.employee_id=q.employee_id and k.work_date=v_date)) then return '{}'; end if;
  insert into public.push_line_complete(unit_id,work_date) values(v_unit,v_date) on conflict do nothing;
  if not found then return '{}'; end if;
  select coalesce(array_agg(t.token),'{}') into v_tokens from public.push_tokens t join public.profiles a on a.id=t.profile_id
   where a.role='admin' and a.active and a.deleted_at is null;
 else return '{}'; end if;
 return v_tokens;
end $$;

revoke all on function public.scheduled_push_recipients(text,timestamptz),private.run_scheduled_push(text) from public,anon,authenticated;
grant execute on function public.scheduled_push_recipients(text,timestamptz) to service_role;
revoke all on function public.push_recipients(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_recipients(text,uuid,uuid) to service_role;

-- Extensions and schedules exist only on hosted Supabase; skipped cleanly elsewhere (PGlite tests).
-- A refused extension must not fail the whole migration: the database objects
-- above still work, and the reminders can be enabled later from the dashboard
-- (Database > Extensions) by running this block again.
do $ext$
begin
 begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
   create extension if not exists pg_cron with schema pg_catalog;
  end if;
 exception when others then
  raise notice 'pg_cron could not be enabled: %',sqlerrm;
 end;
 begin
  if exists(select 1 from pg_available_extensions where name='pg_net') then
   create schema if not exists extensions;
   create extension if not exists pg_net with schema extensions;
  end if;
 exception when others then
  raise notice 'pg_net could not be enabled: %',sqlerrm;
 end;
end $ext$;

-- 03:00 UTC = 08:30 IST, 12:30 UTC = 18:00 IST. Re-running replaces the jobs.
do $sched$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  begin
   perform cron.unschedule(jobid) from cron.job where jobname in ('crewgrain-push-morning','crewgrain-push-evening');
   perform cron.schedule('crewgrain-push-morning','0 3 * * *',$job$select private.run_scheduled_push('morning_plan')$job$);
   perform cron.schedule('crewgrain-push-evening','30 12 * * *',$job$select private.run_scheduled_push('evening_check')$job$);
  exception when others then
   raise notice 'Reminder schedule could not be created: %',sqlerrm;
  end;
 end if;
end $sched$;
