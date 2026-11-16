-- Style categories (Sleepsuit, Cap, Kurta...) and quick task entry.
create table public.style_category (
 style_id uuid primary key references public.styles on delete cascade,
 category text not null check(length(category) between 1 and 40)
);
create index style_category_name on public.style_category(category);
alter table public.style_category enable row level security;
revoke all on public.style_category from public,anon,authenticated;
grant all on public.style_category to service_role;

-- Create or edit a style and its category in one admin-only call.
create function public.save_style(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_id uuid:=nullif(p_action->>'id','')::uuid;v_name text:=trim(coalesce(p_action->>'name',''));
 v_code text:=trim(coalesce(p_action->>'code',''));v_cat text:=trim(coalesce(p_action->>'category',''));v_before jsonb;v_after jsonb;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_admin();
 if v_name='' or length(v_name)>120 then raise exception 'Enter a style name up to 120 characters';end if;
 if v_code='' or length(v_code)>24 then raise exception 'Enter a style code up to 24 characters';end if;
 if length(v_cat)>40 then raise exception 'Category can be up to 40 characters';end if;
 begin
  if v_id is null then
   insert into public.styles(name,code,notes) values(v_name,v_code,left(coalesce(p_action->>'notes',''),2000)) returning id,to_jsonb(styles.*) into v_id,v_after;
  else
   select to_jsonb(s) into strict v_before from public.styles s where id=v_id for update;
   update public.styles set name=v_name,code=v_code,notes=left(coalesce(p_action->>'notes',''),2000) where id=v_id returning to_jsonb(styles.*) into v_after;
  end if;
 exception when unique_violation then raise exception 'Style code already exists';end;
 if v_cat='' then delete from public.style_category where style_id=v_id;
 else insert into public.style_category(style_id,category) values(v_id,v_cat) on conflict(style_id) do update set category=excluded.category;end if;
 perform private.audit(actor,'save_style',v_id,v_before,v_after||jsonb_build_object('category',v_cat));
 return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.save_style(jsonb) from public,anon,authenticated;
grant execute on function public.save_style(jsonb) to authenticated,service_role;

-- Add many tasks (operation name + rate) to a style at once, after its last task.
create function public.add_operations(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_style uuid:=(p_action->>'styleId')::uuid;v_seq integer;t jsonb;v_name text;v_rate integer;v_n integer:=0;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 perform private.check_admin();
 if not exists(select 1 from public.styles where id=v_style) then raise exception 'Style not found';end if;
 if jsonb_typeof(p_action->'tasks')<>'array' or jsonb_array_length(p_action->'tasks') not between 1 and 60 then raise exception 'Add between 1 and 60 tasks';end if;
 select coalesce(max(sequence),0) into v_seq from public.operations where style_id=v_style;
 for t in select * from jsonb_array_elements(p_action->'tasks') loop
  v_name:=trim(coalesce(t->>'name',''));v_rate:=(t->>'ratePaise')::integer;
  if v_name='' or length(v_name)>120 then raise exception 'Each task needs a name up to 120 characters';end if;
  if v_rate is null or v_rate<0 or v_rate>10000000 then raise exception 'Each task needs a rate';end if;
  v_seq:=v_seq+1;v_n:=v_n+1;
  insert into public.operations(style_id,name,sequence,rate_paise) values(v_style,v_name,v_seq,v_rate);
 end loop;
 perform private.audit(actor,'add_operations',v_style,null,jsonb_build_object('count',v_n));
 return jsonb_build_object('id',v_style,'count',v_n);
end $$;
revoke all on function public.add_operations(jsonb) from public,anon,authenticated;
grant execute on function public.add_operations(jsonb) to authenticated,service_role;

-- Add categories to the styles in the snapshot without rewriting the base function.
alter function public.get_app_snapshot() rename to get_app_snapshot_base;
revoke all on function public.get_app_snapshot_base() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select public.get_app_snapshot_base()||jsonb_build_object('styles',coalesce((
  select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'code',s.code,'color',s.color,'notes',s.notes,'category',coalesce(c.category,'')) order by s.name)
  from public.styles s left join public.style_category c on c.style_id=s.id
 ),'[]'::jsonb));
$$;
revoke all on function public.get_app_snapshot() from public,anon,authenticated;
grant execute on function public.get_app_snapshot() to authenticated,service_role;

-- People think in lines, not sub-lines. Every line keeps one hidden default
-- sub-line so existing batches (which reference a sub-line) keep working.
create function private.default_line() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.lines(unit_id,name) values(new.id,'Main') on conflict do nothing;return new;end $$;
revoke all on function private.default_line() from public,anon,authenticated;
create trigger units_default_line after insert on public.units for each row execute function private.default_line();
insert into public.lines(unit_id,name) select u.id,'Main' from public.units u where not exists(select 1 from public.lines l where l.unit_id=u.id);
