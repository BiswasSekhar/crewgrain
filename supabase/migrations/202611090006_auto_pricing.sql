-- Automatic task pricing: pay per piece = seconds / 60 x rate per minute.
-- The factory has a default rate per minute (Rs 3.50); a style can override it;
-- a task can fix its own price. Automatic tasks re-price when a rate changes.
-- Work already recorded keeps the rate captured when it was recorded.
create table public.rate_settings (
 id boolean primary key default true check(id),
 per_minute_paise integer not null default 350 check(per_minute_paise between 1 and 100000)
);
insert into public.rate_settings default values;
create table public.style_pricing (
 style_id uuid primary key references public.styles on delete cascade,
 per_minute_paise integer not null check(per_minute_paise between 1 and 100000)
);
create table public.operation_pricing (
 operation_id uuid primary key references public.operations on delete cascade,
 seconds integer not null check(seconds between 1 and 36000),
 manual boolean not null default false
);
alter table public.rate_settings enable row level security;
alter table public.style_pricing enable row level security;
alter table public.operation_pricing enable row level security;
revoke all on public.rate_settings,public.style_pricing,public.operation_pricing from public,anon,authenticated;
grant all on public.rate_settings,public.style_pricing,public.operation_pricing to service_role;

create function private.per_minute(p_style uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select per_minute_paise from public.style_pricing where style_id=p_style),(select per_minute_paise from public.rate_settings),350)
$$;
create function private.reprice(p_style uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 with changed as (
  update public.operations o set rate_paise=round(p.seconds/60.0*private.per_minute(o.style_id))::integer,updated_at=now()
  from public.operation_pricing p
  where p.operation_id=o.id and not p.manual and (p_style is null or o.style_id=p_style)
   and o.rate_paise<>round(p.seconds/60.0*private.per_minute(o.style_id))::integer
  returning 1)
 select count(*) into n from changed;
 return n;
end $$;
revoke all on function private.per_minute(uuid),private.reprice(uuid) from public,anon,authenticated;

create function public.set_rate_settings(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_rate integer:=(p_action->>'perMinutePaise')::integer;v_before jsonb;v_n integer;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_admin();
 if v_rate is null or v_rate not between 1 and 100000 then raise exception 'Enter a rate per minute between Rs 0.01 and Rs 1000';end if;
 select to_jsonb(r) into v_before from public.rate_settings r;
 update public.rate_settings set per_minute_paise=v_rate;
 v_n:=private.reprice(null);
 perform private.audit(actor,'set_rate_settings',actor,v_before,jsonb_build_object('perMinutePaise',v_rate,'updated',v_n));
 return jsonb_build_object('updated',v_n);
end $$;

create function public.set_style_pricing(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_style uuid:=(p_action->>'styleId')::uuid;v_rate integer:=(p_action->>'perMinutePaise')::integer;v_before jsonb;v_n integer;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_admin();
 if not exists(select 1 from public.styles where id=v_style) then raise exception 'Style not found';end if;
 if v_rate is not null and v_rate not between 1 and 100000 then raise exception 'Enter a rate per minute between Rs 0.01 and Rs 1000';end if;
 select to_jsonb(p) into v_before from public.style_pricing p where style_id=v_style;
 if v_rate is null then delete from public.style_pricing where style_id=v_style;
 else insert into public.style_pricing(style_id,per_minute_paise) values(v_style,v_rate) on conflict(style_id) do update set per_minute_paise=excluded.per_minute_paise;end if;
 v_n:=private.reprice(v_style);
 perform private.audit(actor,'set_style_pricing',v_style,v_before,jsonb_build_object('perMinutePaise',v_rate,'updated',v_n));
 return jsonb_build_object('updated',v_n);
end $$;

create function public.set_task_pricing(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_id uuid:=(p_action->>'id')::uuid;v_op public.operations;v_old public.operation_pricing;
 v_sec integer;v_manual boolean;v_rate integer;v_kind text:=jsonb_typeof(p_action->'ratePaise');v_before jsonb;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_admin();
 select * into v_op from public.operations where id=v_id for update;
 if v_op.id is null then raise exception 'Task not found';end if;
 select * into v_old from public.operation_pricing where operation_id=v_id;
 v_before:=to_jsonb(v_op)||jsonb_build_object('seconds',v_old.seconds,'manual',v_old.manual);
 v_sec:=coalesce((p_action->>'seconds')::integer,v_old.seconds);
 v_manual:=coalesce(v_old.manual,true);
 v_rate:=v_op.rate_paise;
 if v_sec is not null and v_sec not between 1 and 36000 then raise exception 'Seconds per piece must be between 1 and 36000';end if;
 if v_kind='number' then
  v_rate:=(p_action->>'ratePaise')::integer;v_manual:=true;
  if v_rate not between 0 and 10000000 then raise exception 'Enter a valid rate';end if;
 elsif v_kind='null' then
  if v_sec is null then raise exception 'Add seconds per piece to price this task automatically';end if;
  v_manual:=false;
 end if;
 if not v_manual and v_sec is not null then v_rate:=round(v_sec/60.0*private.per_minute(v_op.style_id))::integer;end if;
 if v_sec is not null then
  insert into public.operation_pricing(operation_id,seconds,manual) values(v_id,v_sec,v_manual)
   on conflict(operation_id) do update set seconds=excluded.seconds,manual=excluded.manual;
 end if;
 update public.operations set rate_paise=v_rate,updated_at=now() where id=v_id;
 perform private.audit(actor,'set_task_pricing',v_id,v_before,jsonb_build_object('seconds',v_sec,'manual',v_manual,'ratePaise',v_rate));
 return jsonb_build_object('id',v_id,'ratePaise',v_rate);
end $$;

-- Quick task entry: name plus seconds (priced automatically) or a fixed rate.
create or replace function public.add_operations(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_style uuid:=(p_action->>'styleId')::uuid;v_seq integer;t jsonb;v_name text;v_sec integer;v_rate integer;v_manual boolean;v_op uuid;v_n integer:=0;v_per integer;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_admin();
 if not exists(select 1 from public.styles where id=v_style) then raise exception 'Style not found';end if;
 if jsonb_typeof(p_action->'tasks')<>'array' or jsonb_array_length(p_action->'tasks') not between 1 and 60 then raise exception 'Add between 1 and 60 tasks';end if;
 select coalesce(max(sequence),0) into v_seq from public.operations where style_id=v_style;
 v_per:=private.per_minute(v_style);
 for t in select * from jsonb_array_elements(p_action->'tasks') loop
  v_name:=trim(coalesce(t->>'name',''));v_sec:=(t->>'seconds')::integer;v_rate:=(t->>'ratePaise')::integer;v_manual:=v_rate is not null;
  if v_name='' or length(v_name)>120 then raise exception 'Each task needs a name up to 120 characters';end if;
  if v_sec is not null and v_sec not between 1 and 36000 then raise exception 'Seconds per piece must be between 1 and 36000';end if;
  if v_manual then
   if v_rate not between 0 and 10000000 then raise exception 'Each task needs a valid rate';end if;
  elsif v_sec is null then v_rate:=0;v_manual:=true;
  else v_rate:=round(v_sec/60.0*v_per)::integer;
  end if;
  v_seq:=v_seq+1;v_n:=v_n+1;
  insert into public.operations(style_id,name,sequence,rate_paise) values(v_style,v_name,v_seq,v_rate) returning id into v_op;
  if v_sec is not null then insert into public.operation_pricing(operation_id,seconds,manual) values(v_op,v_sec,v_manual);end if;
 end loop;
 perform private.audit(actor,'add_operations',v_style,null,jsonb_build_object('count',v_n));
 return jsonb_build_object('id',v_style,'count',v_n);
end $$;
revoke all on function public.set_rate_settings(jsonb),public.set_style_pricing(jsonb),public.set_task_pricing(jsonb) from public,anon,authenticated;
grant execute on function public.set_rate_settings(jsonb),public.set_style_pricing(jsonb),public.set_task_pricing(jsonb) to authenticated,service_role;

-- Add seconds, manual flags and rate settings to the snapshot.
alter function public.get_app_snapshot() rename to get_app_snapshot_cat;
revoke all on function public.get_app_snapshot_cat() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=public.get_app_snapshot_cat();v_admin boolean:=coalesce(private.is_admin(),false);result jsonb;
begin
 result:=base||jsonb_build_object(
  'operations',coalesce((select jsonb_agg(o.value||case when p.operation_id is null then '{}'::jsonb else jsonb_build_object('seconds',p.seconds,'manual',p.manual) end order by o.ord)
    from jsonb_array_elements(base->'operations') with ordinality o(value,ord) left join public.operation_pricing p on p.operation_id=(o.value->>'id')::uuid),'[]'::jsonb),
  'styles',coalesce((select jsonb_agg(s.value||case when v_admin and sp.style_id is not null then jsonb_build_object('perMinutePaise',sp.per_minute_paise) else '{}'::jsonb end order by s.ord)
    from jsonb_array_elements(base->'styles') with ordinality s(value,ord) left join public.style_pricing sp on sp.style_id=(s.value->>'id')::uuid),'[]'::jsonb));
 if v_admin then result:=result||jsonb_build_object('rateSettings',jsonb_build_object('perMinutePaise',(select per_minute_paise from public.rate_settings)));end if;
 return result;
end $$;
revoke all on function public.get_app_snapshot() from public,anon,authenticated;
grant execute on function public.get_app_snapshot() to authenticated,service_role;
