-- Crewgrain, single factory. All money is integer paise. No production seed records.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create type public.crewgrain_role as enum ('worker','captain','admin');
create type public.entry_status as enum ('pending','approved','rejected','void');

create table public.units (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 code text not null unique check(length(code) between 1 and 24), active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.lines (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units,
 name text not null check(length(name) between 1 and 120), unique(unit_id,name)
);
create table public.profiles (
 id uuid primary key default gen_random_uuid(), auth_user_id uuid unique references auth.users,
 employee_id text not null unique check(employee_id ~ '^[A-Z0-9-]{2,24}$'),
 name text not null check(length(name) between 1 and 120), role public.crewgrain_role not null default 'worker',
 operation text not null default '', phone text, active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.unit_memberships (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles,
 unit_id uuid not null references public.units, line_id uuid references public.lines, role public.crewgrain_role not null,
 active_from timestamptz not null default now(), active_to timestamptz,
 status text not null default 'active' check(status in ('active','inactive')),
 check((status='active' and active_to is null) or (status='inactive' and active_to is not null))
);
create unique index membership_one_current on public.unit_memberships(profile_id) where status='active';
create unique index unit_one_captain on public.unit_memberships(unit_id) where role='captain' and status='active';
create table public.styles (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 code text not null unique check(length(code) between 1 and 24), color text not null default '#DBC4AA', notes text not null default ''
);
create table public.operations (
 id uuid primary key default gen_random_uuid(), style_id uuid not null references public.styles,
 name text not null check(length(name) between 1 and 120), sequence integer not null check(sequence between 1 and 1000),
 rate_paise integer not null check(rate_paise between 0 and 10000000), updated_at timestamptz not null default now(),
 unique(style_id,sequence),unique(style_id,name)
);
create table public.operation_prereqs (
 operation_id uuid not null references public.operations, prerequisite_id uuid not null references public.operations,
 primary key(operation_id,prerequisite_id), check(operation_id<>prerequisite_id)
);
create table public.lots (
 id uuid primary key default gen_random_uuid(), style_id uuid not null references public.styles,
 unit_id uuid not null references public.units, line_id uuid not null references public.lines,
 code text not null unique check(length(code) between 1 and 40), total_pieces integer not null check(total_pieces between 1 and 1000000),
 status text not null default 'active' check(status in ('active','closed')),created_at timestamptz not null default now()
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles,
 operation_id uuid not null references public.operations, lot_id uuid not null references public.lots,
 unit_id uuid not null references public.units, active boolean not null default true,
 valid_from date not null default (now() at time zone 'Asia/Kolkata')::date, valid_to date,
 check(valid_to is null or valid_to>=valid_from)
);
create unique index assignment_no_duplicate on public.assignments(employee_id,operation_id,lot_id) where active;
create table public.production_entries (
 id uuid primary key, employee_id uuid not null references public.profiles, unit_id uuid not null references public.units,
 operation_id uuid not null references public.operations, lot_id uuid not null references public.lots,
 quantity integer not null check(quantity between 1 and 2000), work_date date not null,
 rate_paise integer not null check(rate_paise between 0 and 10000000), status public.entry_status not null default 'pending',
 captured_at timestamptz not null, created_at timestamptz not null default now(), edited_at timestamptz,
 reviewed_by uuid references public.profiles, reviewed_at timestamptz, reason text
);
create index entry_unit_date on public.production_entries(unit_id,work_date);
create index entry_employee_date on public.production_entries(employee_id,work_date);
create index entry_flow on public.production_entries(lot_id,operation_id,status);
create table public.employee_onboarding_requests (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units,
 requested_by uuid not null references public.profiles, proposed_employee_id text not null check(proposed_employee_id ~ '^[A-Z0-9-]{2,24}$'),
 name text not null check(length(name) between 1 and 120), operation text not null default '',phone text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 activated_profile_id uuid references public.profiles,reviewed_by uuid references public.profiles,
 reviewed_at timestamptz, rejection_reason text, created_at timestamptz not null default now()
);
create unique index request_one_open_id on public.employee_onboarding_requests(proposed_employee_id) where status in ('pending','approved');
create table public.captain_reports (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units,
 captain_id uuid not null references public.profiles,work_date date not null,
 completed integer not null check(completed between 0 and 1000000),packed integer not null check(packed between 0 and 1000000),
 scheduled integer not null check(scheduled between 0 and 1000), present integer not null check(present between 0 and scheduled),
 blockers text not null default '' check(length(blockers)<=2000),notes text not null default '' check(length(notes)<=2000),
 status text not null default 'submitted' check(status in ('submitted','reviewed','changes_requested')),
 submitted_at timestamptz not null default now(),reviewed_by uuid references public.profiles,reviewed_at timestamptz,
 reviewer_note text,revision integer not null default 1,unique(unit_id,work_date)
);
create index report_date_unit on public.captain_reports(work_date,unit_id);
create table public.captain_report_events (
 id uuid primary key default gen_random_uuid(),report_id uuid not null references public.captain_reports,
 actor_id uuid not null references public.profiles,action text not null,old_record jsonb,new_record jsonb,
 created_at timestamptz not null default now()
);
create table public.review_flags (
 id uuid primary key default gen_random_uuid(),unit_id uuid not null references public.units,
 lot_id uuid not null references public.lots,operation_id uuid not null references public.operations,
 message text not null,status text not null default 'open' check(status in ('open','resolved')),
 resolution text,reviewed_by uuid references public.profiles,resolved_at timestamptz,created_at timestamptz not null default now()
);
create unique index flag_one_open on public.review_flags(lot_id,operation_id) where status='open';
create table public.audit_log (
 id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles,
 action text not null,entity_id uuid not null,old_record jsonb,new_record jsonb,
 created_at timestamptz not null default now()
);
create index audit_created on public.audit_log(created_at desc);
create table public.login_attempts (
 employee_id text primary key,attempts integer not null default 0,locked_until timestamptz,
 window_start timestamptz not null default now()
);

create function private.me() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.profiles where auth_user_id=auth.uid() and active
$$;
create function private.my_role() returns public.crewgrain_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=private.me()
$$;
create function private.my_unit() returns uuid language sql stable security definer set search_path='' as $$
 select m.unit_id from public.unit_memberships m join public.units u on u.id=m.unit_id
 where m.profile_id=private.me() and m.status='active' and u.active
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.my_role()='admin',false)
$$;
create function private.can_unit(p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or (private.my_role()='captain' and private.my_unit()=p_unit)
$$;
create function private.check_unit(p_unit uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not coalesce(private.can_unit(p_unit),false) then raise exception 'Unit access denied' using errcode='42501';end if;end
$$;
create function private.check_admin() returns void language plpgsql security definer set search_path='' as $$
begin if not private.is_admin() then raise exception 'Admin access required' using errcode='42501';end if;end
$$;
create function private.audit(p_actor uuid,p_action text,p_entity uuid,p_old jsonb,p_new jsonb) returns void language sql security definer set search_path='' as $$
 insert into public.audit_log(actor_id,action,entity_id,old_record,new_record) values(p_actor,p_action,p_entity,p_old,p_new)
$$;

-- Immutable wage snapshot and original ownership, even on privileged updates.
create function private.guard_entry() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Hard deletion is not allowed';end if;
 if old.status<>'pending' then raise exception 'Reviewed production entries are immutable';end if;
 if row(new.id,new.employee_id,new.unit_id,new.operation_id,new.lot_id,new.work_date,new.rate_paise,new.created_at,new.captured_at)
 is distinct from row(old.id,old.employee_id,old.unit_id,old.operation_id,old.lot_id,old.work_date,old.rate_paise,old.created_at,old.captured_at) then
 raise exception 'Historical rate and ownership cannot change';end if;
 return new;
end $$;
create trigger entry_immutable before update or delete on public.production_entries for each row execute function private.guard_entry();

-- Re-evaluate every stage after a count/status change. Flags are review signals.
create function private.check_flow() returns trigger language plpgsql security definer set search_path='' as $$
declare o record;v_total bigint;v_available bigint;v_lot public.lots;
begin
 select * into v_lot from public.lots where id=new.lot_id;
 for o in select * from public.operations where style_id=v_lot.style_id loop
  select coalesce(sum(quantity),0) into v_total from public.production_entries where lot_id=new.lot_id and operation_id=o.id and status in ('pending','approved');
  select min(coalesce((select sum(e.quantity) from public.production_entries e where e.lot_id=new.lot_id and e.operation_id=p.prerequisite_id and e.status in ('pending','approved')),0)) into v_available
  from public.operation_prereqs p where p.operation_id=o.id;
  v_available:=coalesce(v_available,v_lot.total_pieces);
  if v_total>v_available then
   insert into public.review_flags(unit_id,lot_id,operation_id,message)
   values(new.unit_id,new.lot_id,o.id,o.name||' exceeds available upstream pieces. Inspect source entries.')
   on conflict (lot_id,operation_id) where status='open' do nothing;
  end if;
 end loop;
 return new;
end $$;
create trigger entry_flow after insert or update on public.production_entries for each row execute function private.check_flow();

-- RLS remains enabled even though sensitive tables are accessible only via scoped RPCs.
alter table public.units enable row level security;
alter table public.lines enable row level security;
alter table public.profiles enable row level security;
alter table public.unit_memberships enable row level security;
alter table public.styles enable row level security;
alter table public.operations enable row level security;
alter table public.operation_prereqs enable row level security;
alter table public.lots enable row level security;
alter table public.assignments enable row level security;
alter table public.production_entries enable row level security;
alter table public.employee_onboarding_requests enable row level security;
alter table public.captain_reports enable row level security;
alter table public.captain_report_events enable row level security;
alter table public.review_flags enable row level security;
alter table public.audit_log enable row level security;
alter table public.login_attempts enable row level security;

create policy units_read on public.units for select to authenticated using(private.is_admin() or id=private.my_unit());
create policy lines_read on public.lines for select to authenticated using(private.is_admin() or unit_id=private.my_unit());
create policy profiles_read on public.profiles for select to authenticated using(id=private.me() or private.is_admin() or (private.my_role()='captain' and exists(select 1 from public.unit_memberships m where m.profile_id=profiles.id and m.unit_id=private.my_unit() and m.status='active')));
create policy memberships_read on public.unit_memberships for select to authenticated using(profile_id=private.me() or private.can_unit(unit_id));
create policy styles_read on public.styles for select to authenticated using(private.me() is not null);
create policy operations_read on public.operations for select to authenticated using(private.me() is not null);
create policy prereqs_read on public.operation_prereqs for select to authenticated using(private.me() is not null);
create policy lots_read on public.lots for select to authenticated using(private.is_admin() or unit_id=private.my_unit());
create policy assignments_read on public.assignments for select to authenticated using(employee_id=private.me() or private.can_unit(unit_id));
create policy entries_read on public.production_entries for select to authenticated using(employee_id=private.me() or private.can_unit(unit_id));
create policy requests_read on public.employee_onboarding_requests for select to authenticated using(private.can_unit(unit_id));
create policy reports_read on public.captain_reports for select to authenticated using(private.can_unit(unit_id));
create policy report_events_read on public.captain_report_events for select to authenticated using(exists(select 1 from public.captain_reports r where r.id=report_id and private.can_unit(r.unit_id)));
create policy flags_read on public.review_flags for select to authenticated using(private.can_unit(unit_id));
create policy audit_read on public.audit_log for select to authenticated using(private.is_admin());
-- No client write policy. login_attempts has no client read policy either.
revoke all on public.units,public.lines,public.profiles,public.unit_memberships,public.styles,public.operations,public.operation_prereqs,public.lots,public.assignments,public.production_entries,public.employee_onboarding_requests,public.captain_reports,public.captain_report_events,public.review_flags,public.audit_log,public.login_attempts from anon,authenticated;
grant select on public.units,public.lines,public.profiles,public.unit_memberships,public.styles,public.lots,public.assignments,public.employee_onboarding_requests,public.captain_reports,public.captain_report_events,public.review_flags,public.audit_log to authenticated;
-- Captains must not read rate snapshots to infer another worker's wages.
-- operations/entries/prereqs are returned by get_snapshot with role-aware projection.
grant all on public.units,public.lines,public.profiles,public.unit_memberships,public.styles,public.operations,public.operation_prereqs,public.lots,public.assignments,public.production_entries,public.employee_onboarding_requests,public.captain_reports,public.captain_report_events,public.review_flags,public.audit_log,public.login_attempts to service_role;

create function public.get_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.me(); viewer_role public.crewgrain_role:=private.my_role(); unit uuid:=private.my_unit(); result jsonb;
begin
 if actor is null or (viewer_role<>'admin' and unit is null) then raise exception 'Active employee membership required' using errcode='42501';end if;
 select jsonb_build_object(
 'actorId',actor,
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'code',u.code,'active',u.active) order by u.code) from public.units u where viewer_role='admin' or u.id=unit or (viewer_role='worker' and exists(select 1 from public.production_entries e where e.employee_id=actor and e.unit_id=u.id))),'[]'::jsonb),
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'unitId',l.unit_id)) from public.lines l where viewer_role='admin' or l.unit_id=unit),'[]'::jsonb),
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'employeeId',p.employee_id,'name',p.name,'role',p.role,'unitId',m.unit_id,'lineId',m.line_id,'operation',p.operation,'phone',p.phone,'active',p.active,'authReady',p.auth_user_id is not null) order by p.name)
 from public.profiles p left join lateral(select * from public.unit_memberships mm where mm.profile_id=p.id order by mm.active_from desc limit 1)m on true
 where p.id=actor or viewer_role='admin' or (viewer_role='captain' and m.unit_id=unit and m.status='active')),'[]'::jsonb),
 'styles',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'code',s.code,'color',s.color,'notes',s.notes)) from public.styles s),'[]'::jsonb),
 'operations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'styleId',o.style_id,'name',o.name,'sequence',o.sequence,'ratePaise',case when viewer_role='captain' then 0 else o.rate_paise end,'prerequisiteIds',coalesce((select jsonb_agg(pr.prerequisite_id) from public.operation_prereqs pr where pr.operation_id=o.id),'[]'::jsonb))) from public.operations o),'[]'::jsonb),
 'lots',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'styleId',l.style_id,'unitId',l.unit_id,'lineId',l.line_id,'code',l.code,'totalPieces',l.total_pieces,'status',l.status)) from public.lots l where viewer_role='admin' or l.unit_id=unit or (viewer_role='worker' and exists(select 1 from public.production_entries e where e.employee_id=actor and e.lot_id=l.id))),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employeeId',a.employee_id,'operationId',a.operation_id,'lotId',a.lot_id,'active',a.active and a.valid_from<=(now() at time zone 'Asia/Kolkata')::date and (a.valid_to is null or a.valid_to>=(now() at time zone 'Asia/Kolkata')::date))) from public.assignments a where a.employee_id=actor or viewer_role='admin' or (viewer_role='captain' and a.unit_id=unit)),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'employeeId',e.employee_id,'unitId',e.unit_id,'operationId',e.operation_id,'lotId',e.lot_id,'quantity',e.quantity,'workDate',e.work_date,'ratePaise',case when viewer_role='captain' then 0 else e.rate_paise end,'status',e.status,'createdAt',e.created_at,'reason',e.reason) order by e.created_at desc) from public.production_entries e where e.employee_id=actor or viewer_role='admin' or (viewer_role='captain' and e.unit_id=unit)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.proposed_employee_id,'name',r.name,'unitId',r.unit_id,'operation',r.operation,'phone',r.phone,'status',r.status,'requestedBy',r.requested_by,'reviewedBy',r.reviewed_by,'reviewedAt',r.reviewed_at,'reason',r.rejection_reason) order by r.created_at desc) from public.employee_onboarding_requests r where viewer_role='admin' or (viewer_role='captain' and r.unit_id=unit)),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'unitId',r.unit_id,'captainId',r.captain_id,'workDate',r.work_date,'completed',r.completed,'packed',r.packed,'scheduled',r.scheduled,'present',r.present,'blockers',r.blockers,'notes',r.notes,'status',r.status,'submittedAt',r.submitted_at,'reviewerNote',r.reviewer_note,'reviewedBy',r.reviewed_by,'reviewedAt',r.reviewed_at,'revision',r.revision) order by r.work_date desc) from public.captain_reports r where viewer_role='admin' or (viewer_role='captain' and r.unit_id=unit)),'[]'::jsonb),
 'audit',case when viewer_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'actorId',a.actor_id,'action',a.action,'entityId',a.entity_id,'at',a.created_at,'detail',jsonb_build_object('before',a.old_record,'after',a.new_record)::text) order by a.created_at desc) from (select * from public.audit_log order by created_at desc limit 200)a),'[]'::jsonb) else '[]'::jsonb end,
 'flags',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'unitId',f.unit_id,'lotId',f.lot_id,'operationId',f.operation_id,'message',f.message,'status',f.status,'resolution',f.resolution)) from public.review_flags f where viewer_role='admin' or (viewer_role='captain' and f.unit_id=unit)),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.record_production(p_entry jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me(); v_id uuid:=(p_entry->>'id')::uuid;v_qty integer:=(p_entry->>'quantity')::integer;v_date date:=(p_entry->>'workDate')::date;
 v_operation public.operations;v_lot public.lots;v_existing public.production_entries;v_result public.production_entries;
begin
 if actor is null or private.my_role()<>'worker' or (p_entry->>'employeeId')::uuid<>actor then raise exception 'Assigned worker access required' using errcode='42501';end if;
 -- Serialize identical retry keys, including simultaneous HTTP retries.
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into v_existing from public.production_entries where id=v_id;
 if found then
  if row(v_existing.employee_id,v_existing.operation_id,v_existing.lot_id,v_existing.quantity,v_existing.work_date) is distinct from row(actor,(p_entry->>'operationId')::uuid,(p_entry->>'lotId')::uuid,v_qty,v_date) then raise exception 'Submission ID already used for different work' using errcode='23505';end if;
  return jsonb_build_object('id',v_id,'duplicate',true);
 end if;
 if v_qty is null or v_qty not between 1 and 2000 or v_date is null or v_date not between (now() at time zone 'Asia/Kolkata')::date-2 and (now() at time zone 'Asia/Kolkata')::date then raise exception 'Quantity or work date is outside the allowed range' using errcode='22023';end if;
 select * into v_lot from public.lots where id=(p_entry->>'lotId')::uuid and status='active' and unit_id=private.my_unit() for update;
 select * into v_operation from public.operations where id=(p_entry->>'operationId')::uuid and style_id=v_lot.style_id for share;
 if v_lot.id is null or v_operation.id is null or not exists(select 1 from public.assignments a where a.employee_id=actor and a.operation_id=v_operation.id and a.lot_id=v_lot.id and a.active and v_date>=a.valid_from and (a.valid_to is null or v_date<=a.valid_to)) then raise exception 'Work is not assigned or lot is inactive' using errcode='42501';end if;
 insert into public.production_entries(id,employee_id,unit_id,operation_id,lot_id,quantity,work_date,rate_paise,captured_at)
 values(v_id,actor,v_lot.unit_id,v_operation.id,v_lot.id,v_qty,v_date,v_operation.rate_paise,coalesce((p_entry->>'capturedAt')::timestamptz,now())) returning * into v_result;
 perform private.audit(actor,'record_production',v_id,null,to_jsonb(v_result));
 return jsonb_build_object('id',v_id,'duplicate',false,'ratePaise',v_result.rate_paise);
end $$;

create function public.perform_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me(); action text:=p_action->>'type';v_id uuid;v_unit uuid;v_profile public.profiles;v_request public.employee_onboarding_requests;
 v_report public.captain_reports;v_entry public.production_entries;v_lot public.lots;v_op public.operations;v_old jsonb;v_new jsonb;v_decision text;v_reason text:=trim(coalesce(p_action->>'reason',''));
 v_name text:=trim(p_action->>'name');v_employee text:=upper(trim(p_action->>'employeeId'));v_role public.crewgrain_role;v_prereq uuid;
begin
 if actor is null then raise exception 'Active employee access required' using errcode='42501';end if;
 if pg_column_size(p_action)>20000 then raise exception 'Request is too large' using errcode='22023';end if;
 if action in ('add_employee','request_employee') then
  v_unit:=(p_action->>'unitId')::uuid;perform private.check_unit(v_unit);
  if not exists(select 1 from public.units where id=v_unit and active) then raise exception 'Unit is inactive';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_employee,0));
  if exists(select 1 from public.profiles where employee_id=v_employee) or exists(select 1 from public.employee_onboarding_requests where proposed_employee_id=v_employee and status in ('pending','approved')) then raise exception 'Employee ID already exists' using errcode='23505';end if;
  if action='add_employee' then
   perform private.check_admin();v_role:=coalesce((p_action->>'role')::public.crewgrain_role,'worker');
   if v_role='admin' then raise exception 'Additional admin creation requires the controlled owner setup';end if;
   if nullif(p_action->>'lineId','') is not null and not exists(select 1 from public.lines where id=(p_action->>'lineId')::uuid and unit_id=v_unit) then raise exception 'Line belongs to another unit';end if;
   insert into public.profiles(employee_id,name,role,operation,phone) values(v_employee,v_name,v_role,coalesce(p_action->>'operation',''),nullif(p_action->>'phone','')) returning id into v_id;
   insert into public.unit_memberships(profile_id,unit_id,line_id,role) values(v_id,v_unit,nullif(p_action->>'lineId','')::uuid,v_role);
   select to_jsonb(p) into v_new from public.profiles p where id=v_id;
  else
   insert into public.employee_onboarding_requests(unit_id,requested_by,proposed_employee_id,name,operation,phone) values(v_unit,actor,v_employee,v_name,coalesce(p_action->>'operation',''),nullif(p_action->>'phone','')) returning id,to_jsonb(employee_onboarding_requests.*) into v_id,v_new;
  end if;
 elsif action='review_request' then
  select * into strict v_request from public.employee_onboarding_requests where id=(p_action->>'id')::uuid for update;perform private.check_unit(v_request.unit_id);
  if v_request.status<>'pending' and not private.is_admin() then raise exception 'Request already reviewed';end if;
  if v_request.status<>'pending' and v_reason='' then raise exception 'Admin override requires a reason';end if;
  v_decision:=p_action->>'decision';if v_decision not in ('approved','rejected') or v_decision is null then raise exception 'Invalid decision';end if;
  if v_decision='rejected' and v_reason='' then raise exception 'Rejection reason is required';end if;
  v_id:=v_request.id;v_old:=to_jsonb(v_request);perform pg_advisory_xact_lock(hashtextextended(v_request.proposed_employee_id,0));
  if v_decision='approved' then
   if v_request.activated_profile_id is null then
    insert into public.profiles(employee_id,name,operation,phone) values(v_request.proposed_employee_id,v_request.name,v_request.operation,v_request.phone) returning * into v_profile;
    insert into public.unit_memberships(profile_id,unit_id,role) values(v_profile.id,v_request.unit_id,'worker');
   else
    update public.profiles set active=true where id=v_request.activated_profile_id returning * into v_profile;
    if not exists(select 1 from public.unit_memberships where profile_id=v_profile.id and unit_id=v_request.unit_id and status='active') then
     update public.unit_memberships set status='inactive',active_to=now() where profile_id=v_profile.id and status='active';
     update public.assignments set active=false where employee_id=v_profile.id;
     insert into public.unit_memberships(profile_id,unit_id,role) values(v_profile.id,v_request.unit_id,'worker');
    end if;
   end if;
  elsif v_request.activated_profile_id is not null then
   update public.profiles set active=false where id=v_request.activated_profile_id;
   update public.unit_memberships set status='inactive',active_to=now() where profile_id=v_request.activated_profile_id and status='active';
  end if;
  update public.employee_onboarding_requests set status=v_decision,reviewed_by=actor,reviewed_at=now(),rejection_reason=nullif(v_reason,''),activated_profile_id=coalesce(v_profile.id,activated_profile_id) where id=v_id returning to_jsonb(employee_onboarding_requests.*) into v_new;
 elsif action='update_employee' then
  perform private.check_admin();select * into strict v_profile from public.profiles where id=(p_action->>'id')::uuid for update;
  if v_reason='' then raise exception 'Change reason required';end if;
  v_id:=v_profile.id;v_old:=to_jsonb(v_profile)||jsonb_build_object('membership',(select to_jsonb(m) from public.unit_memberships m where m.profile_id=v_id and m.status='active'));v_unit:=(p_action->>'unitId')::uuid;
  if not exists(select 1 from public.units where id=v_unit and active) then raise exception 'Choose an active unit';end if;
  if nullif(p_action->>'lineId','') is not null and not exists(select 1 from public.lines where id=(p_action->>'lineId')::uuid and unit_id=v_unit) then raise exception 'Choose a line in this unit';end if;
  if v_profile.active and not exists(select 1 from public.unit_memberships where profile_id=v_id and unit_id=v_unit and line_id is not distinct from nullif(p_action->>'lineId','')::uuid and status='active') then
   if not exists(select 1 from public.unit_memberships where profile_id=v_id and unit_id=v_unit and status='active') then update public.assignments set active=false where employee_id=v_id;end if;
   update public.unit_memberships set status='inactive',active_to=now() where profile_id=v_id and status='active';
   insert into public.unit_memberships(profile_id,unit_id,line_id,role) values(v_id,v_unit,nullif(p_action->>'lineId','')::uuid,v_profile.role);
  elsif not v_profile.active then
   raise exception 'Reactivate the employee before changing unit or profile';
  end if;
  update public.profiles set name=v_name,operation=coalesce(p_action->>'operation',''),phone=nullif(p_action->>'phone','') where id=v_id returning to_jsonb(profiles.*)||jsonb_build_object('unitId',v_unit,'lineId',p_action->>'lineId') into v_new;
 elsif action='set_employee_active' then
  perform private.check_admin();select * into strict v_profile from public.profiles where id=(p_action->>'id')::uuid for update;
  if v_profile.id=actor then raise exception 'Cannot change your own active status';end if;if v_reason='' then raise exception 'Reason required';end if;
  v_id:=v_profile.id;v_old:=to_jsonb(v_profile);
  update public.profiles set active=(p_action->>'active')::boolean where id=v_id returning to_jsonb(profiles.*) into v_new;
  if (p_action->>'active')::boolean then
   if not exists(select 1 from public.unit_memberships where profile_id=v_id and status='active') then
    insert into public.unit_memberships(profile_id,unit_id,line_id,role) select profile_id,unit_id,line_id,role from public.unit_memberships where profile_id=v_id order by active_from desc limit 1;
   end if;
  else update public.unit_memberships set status='inactive',active_to=now() where profile_id=v_id and status='active';end if;
 elsif action='submit_report' then
  v_unit:=(p_action->>'unitId')::uuid;perform private.check_unit(v_unit);
  if private.my_role()<>'captain' then raise exception 'Reports must be submitted by the unit captain' using errcode='42501';end if;
  if (p_action->>'workDate')::date not between (now() at time zone 'Asia/Kolkata')::date-2 and (now() at time zone 'Asia/Kolkata')::date then raise exception 'Report date is outside the allowed window';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_unit::text||(p_action->>'workDate'),0));
  select * into v_report from public.captain_reports where unit_id=v_unit and work_date=(p_action->>'workDate')::date for update;
  if v_report.status='reviewed' then raise exception 'Reviewed reports are locked';end if;v_old:=case when v_report.id is not null then to_jsonb(v_report) end;
  insert into public.captain_reports(unit_id,captain_id,work_date,completed,packed,scheduled,present,blockers,notes)
  values(v_unit,actor,(p_action->>'workDate')::date,(p_action->>'completed')::integer,(p_action->>'packed')::integer,(p_action->>'scheduled')::integer,(p_action->>'present')::integer,coalesce(p_action->>'blockers',''),coalesce(p_action->>'notes',''))
  on conflict(unit_id,work_date) do update set captain_id=actor,completed=excluded.completed,packed=excluded.packed,scheduled=excluded.scheduled,present=excluded.present,blockers=excluded.blockers,notes=excluded.notes,status='submitted',submitted_at=now(),revision=captain_reports.revision+1
  returning id,to_jsonb(captain_reports.*) into v_id,v_new;
  insert into public.captain_report_events(report_id,actor_id,action,old_record,new_record) values(v_id,actor,action,v_old,v_new);
 elsif action='review_report' then
  perform private.check_admin();select * into strict v_report from public.captain_reports where id=(p_action->>'id')::uuid for update;
  if v_report.status<>'submitted' then raise exception 'Only submitted reports can be reviewed';end if;
  v_decision:=p_action->>'decision';if v_decision is null or v_decision not in ('reviewed','changes_requested') then raise exception 'Invalid report decision';end if;
  if v_decision='changes_requested' and v_reason='' then raise exception 'Explain the changes required';end if;
  v_id:=v_report.id;v_old:=to_jsonb(v_report);
  update public.captain_reports set status=v_decision,reviewed_by=actor,reviewed_at=now(),reviewer_note=nullif(v_reason,'') where id=v_id returning to_jsonb(captain_reports.*) into v_new;
  insert into public.captain_report_events(report_id,actor_id,action,old_record,new_record) values(v_id,actor,action,v_old,v_new);
 elsif action in ('review_entry','edit_entry','void_entry') then
  select * into strict v_entry from public.production_entries where id=(p_action->>'id')::uuid for update;v_id:=v_entry.id;v_old:=to_jsonb(v_entry);
  perform 1 from public.lots where id=v_entry.lot_id for update;
  if v_entry.status<>'pending' then raise exception 'Reviewed entries are immutable';end if;
  if action='review_entry' then
   perform private.check_admin();v_decision:=p_action->>'decision';if v_decision is null or v_decision not in ('approved','rejected') then raise exception 'Invalid decision';end if;
   if v_decision='rejected' and v_reason='' then raise exception 'Rejection reason is required';end if;
   update public.production_entries set status=v_decision::public.entry_status,reviewed_by=actor,reviewed_at=now(),reason=nullif(v_reason,'') where id=v_id returning to_jsonb(production_entries.*) into v_new;
  else
   if not private.is_admin() and not (private.my_role()='worker' and v_entry.employee_id=actor and now()<=v_entry.created_at+interval '1 hour') then raise exception 'Edit window closed or access denied' using errcode='42501';end if;
   if v_reason='' then raise exception 'Correction reason required';end if;
   update public.production_entries set quantity=case when action='edit_entry' then (p_action->>'quantity')::integer else quantity end,status=case when action='void_entry' then 'void'::public.entry_status else status end,edited_at=now(),reason=v_reason where id=v_id returning to_jsonb(production_entries.*) into v_new;
  end if;
 else
  perform private.check_admin();
  if action='create_unit' then insert into public.units(name,code) values(v_name,trim(p_action->>'code')) returning id,to_jsonb(units.*) into v_id,v_new;
  elsif action='create_line' then insert into public.lines(name,unit_id) values(v_name,(p_action->>'unitId')::uuid) returning id,to_jsonb(lines.*) into v_id,v_new;
  elsif action='create_style' then insert into public.styles(name,code,notes) values(v_name,trim(p_action->>'code'),coalesce(p_action->>'notes','')) returning id,to_jsonb(styles.*) into v_id,v_new;
  elsif action='create_operation' then
   insert into public.operations(style_id,name,sequence,rate_paise) values((p_action->>'styleId')::uuid,v_name,(p_action->>'sequence')::integer,(p_action->>'ratePaise')::integer) returning * into v_op;v_id:=v_op.id;
   for v_prereq in select value::text::uuid from jsonb_array_elements_text(coalesce(p_action->'prerequisiteIds','[]'::jsonb)) loop
    if not exists(select 1 from public.operations where id=v_prereq and style_id=v_op.style_id and sequence<v_op.sequence) then raise exception 'Prerequisite must be an earlier operation in the same style';end if;
    insert into public.operation_prereqs(operation_id,prerequisite_id) values(v_id,v_prereq);
   end loop;v_new:=to_jsonb(v_op)||jsonb_build_object('prerequisiteIds',p_action->'prerequisiteIds');
  elsif action='set_rate' then
   if v_reason='' then raise exception 'Rate change reason required';end if;
   select * into strict v_op from public.operations where id=(p_action->>'id')::uuid for update;v_id:=v_op.id;v_old:=to_jsonb(v_op);
   update public.operations set rate_paise=(p_action->>'ratePaise')::integer,updated_at=now() where id=v_id returning to_jsonb(operations.*) into v_new;
  elsif action='create_lot' then
   v_unit:=(p_action->>'unitId')::uuid;
   if not exists(select 1 from public.lines where id=(p_action->>'lineId')::uuid and unit_id=v_unit) then raise exception 'Line must belong to selected unit';end if;
   insert into public.lots(code,style_id,unit_id,line_id,total_pieces) values(trim(p_action->>'code'),(p_action->>'styleId')::uuid,v_unit,(p_action->>'lineId')::uuid,(p_action->>'totalPieces')::integer) returning id,to_jsonb(lots.*) into v_id,v_new;
  elsif action='assign_work' then
   select * into strict v_profile from public.profiles where id=(p_action->>'employeeId')::uuid and role='worker' and active;
   select * into strict v_lot from public.lots where id=(p_action->>'lotId')::uuid and status='active';
   if not exists(select 1 from public.unit_memberships where profile_id=v_profile.id and unit_id=v_lot.unit_id and status='active') or not exists(select 1 from public.operations where id=(p_action->>'operationId')::uuid and style_id=v_lot.style_id) then raise exception 'Assignment unit or style mismatch';end if;
   insert into public.assignments(employee_id,operation_id,lot_id,unit_id) values(v_profile.id,(p_action->>'operationId')::uuid,v_lot.id,v_lot.unit_id) returning id,to_jsonb(assignments.*) into v_id,v_new;
  elsif action='resolve_flag' then
   if v_reason='' then raise exception 'Resolution note required';end if;
   select to_jsonb(f) into strict v_old from public.review_flags f where id=(p_action->>'id')::uuid for update;
   update public.review_flags set status='resolved',resolution=v_reason,reviewed_by=actor,resolved_at=now() where id=(p_action->>'id')::uuid returning id,to_jsonb(review_flags.*) into v_id,v_new;
  else raise exception 'Unknown action' using errcode='22023';end if;
 end if;
 perform private.audit(actor,action,v_id,v_old,v_new||jsonb_build_object('reason',v_reason));
 return jsonb_build_object('id',v_id);
end $$;

-- Login helpers are service-only; every failed attempt reserves one count atomically.
create function public.reserve_login_attempt(p_employee_id text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.login_attempts;
begin
 if p_employee_id !~ '^[A-Z0-9-]{2,24}$' then return false;end if;
 insert into public.login_attempts(employee_id) values(p_employee_id) on conflict do nothing;
 select * into r from public.login_attempts where employee_id=p_employee_id for update;
 if r.locked_until>now() then return false;end if;
 if r.window_start<now()-interval '15 minutes' or r.locked_until<=now() then r.attempts:=0;r.window_start:=now();end if;
 update public.login_attempts set attempts=r.attempts+1,window_start=r.window_start,locked_until=case when r.attempts+1>=5 then now()+interval '15 minutes' else null end where employee_id=p_employee_id;
 return true;
end $$;
create function public.clear_login_attempts(p_employee_id text) returns void language sql security definer set search_path='' as $$
 delete from public.login_attempts where employee_id=p_employee_id
$$;
create function public.finish_provision(p_actor uuid,p_profile uuid,p_auth_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then raise exception 'Admin access required';end if;
 update public.profiles set auth_user_id=p_auth_user where id=p_profile and active;
 if not found then raise exception 'Active employee not found';end if;
 perform private.audit(p_actor,'pin_issued',p_profile,null,jsonb_build_object('authReady',true));
end $$;
create function public.bootstrap_admin(p_id uuid,p_auth_user uuid,p_employee_id text,p_name text,p_unit_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_unit uuid;
begin
 perform pg_advisory_xact_lock(991107);
 if exists(select 1 from public.profiles where role='admin') then raise exception 'An admin already exists';end if;
 insert into public.units(name,code) values(p_unit_name,'U01') returning id into v_unit;
 insert into public.lines(unit_id,name) values(v_unit,'Line 1');
 insert into public.profiles(id,auth_user_id,employee_id,name,role,operation) values(p_id,p_auth_user,upper(p_employee_id),p_name,'admin','Factory admin');
 insert into public.unit_memberships(profile_id,unit_id,role) values(p_id,v_unit,'admin');
 perform private.audit(p_id,'bootstrap_admin',p_id,null,jsonb_build_object('employeeId',upper(p_employee_id)));
 return p_id;
end $$;

revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.me(),private.my_role(),private.my_unit(),private.is_admin(),private.can_unit(uuid) to authenticated;
revoke all on function public.get_snapshot(),public.record_production(jsonb),public.perform_action(jsonb),public.reserve_login_attempt(text),public.clear_login_attempts(text),public.finish_provision(uuid,uuid,uuid),public.bootstrap_admin(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_snapshot(),public.record_production(jsonb),public.perform_action(jsonb) to authenticated;
grant execute on function public.reserve_login_attempt(text),public.clear_login_attempts(text),public.finish_provision(uuid,uuid,uuid),public.bootstrap_admin(uuid,uuid,text,text,text) to service_role;
