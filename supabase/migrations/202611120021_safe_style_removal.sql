-- Safe style removal from a day plan. Removing a style that people are already
-- counting used to leave its assignments live while the style vanished from the plan.
-- Now: work already recorded (a count above zero) or an approved day blocks the removal;
-- otherwise the plan row is archived (never lost) and that day's dated assignments for
-- the style are switched off (never deleted). Standing assignments are not touched.
create table public.day_plan_history(
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null,work_date date not null,style_id uuid not null,
 position integer,count integer,
 removed_by uuid,removed_at timestamptz not null default now()
);
create index day_plan_history_unit_date on public.day_plan_history(unit_id,work_date);
alter table public.day_plan_history enable row level security;
revoke all on public.day_plan_history from public,anon,authenticated;
grant all on public.day_plan_history to service_role;

alter function public.set_day_plan(jsonb) set schema private;
alter function private.set_day_plan(jsonb) rename to set_day_plan_before_guard;
revoke all on function private.set_day_plan_before_guard(jsonb) from public,anon,authenticated,service_role;

create function public.set_day_plan(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.me();v_unit uuid;v_date date;v_keep uuid[];v_style uuid;v_row public.day_plan;v_n integer;
begin
 if actor is null then raise exception 'Active access required' using errcode='42501';end if;
 v_unit:=(p_action->>'unitId')::uuid;v_date:=(p_action->>'workDate')::date;
 perform private.check_unit(v_unit);
 -- Not a list: the original function produces its own error.
 if jsonb_typeof(p_action->'items')='array' then
  select coalesce(array_agg((i->>'styleId')::uuid),'{}'::uuid[]) into v_keep from jsonb_array_elements(p_action->'items') i;
  for v_row in select * from public.day_plan d where d.unit_id=v_unit and d.work_date=v_date and not (d.style_id=any(v_keep)) order by d.position loop
   -- Lock this style's assignments for the day first. A tap in flight holds a share
   -- lock on its assignment, so we wait for it to commit and then see its count below;
   -- a tap that starts later waits for us and is refused because the assignment is off.
   perform 1 from public.assignments a where a.unit_id=v_unit and a.work_date=v_date
    and a.operation_id in(select o.id from public.operations o where o.style_id=v_row.style_id) for update;
   if exists(select 1 from public.daily_counts c join public.assignments a on a.id=c.assignment_id join public.operations o on o.id=a.operation_id
     where c.unit_id=v_unit and c.work_date=v_date and c.quantity>0 and o.style_id=v_row.style_id) then
    raise exception 'Work is already recorded for this style today, so it cannot be removed.' using errcode='P0001';
   end if;
   if exists(select 1 from public.day_checks k,jsonb_array_elements(k.tasks) t join public.assignments a on a.id=nullif(t->>'assignmentId','')::uuid join public.operations o on o.id=a.operation_id
     where k.unit_id=v_unit and k.work_date=v_date and o.style_id=v_row.style_id) then
    raise exception 'This style is already part of an approved day, so it cannot be removed.' using errcode='P0001';
   end if;
  end loop;
  for v_row in select * from public.day_plan d where d.unit_id=v_unit and d.work_date=v_date and not (d.style_id=any(v_keep)) order by d.position loop
   insert into public.day_plan_history(unit_id,work_date,style_id,position,count,removed_by) values(v_row.unit_id,v_row.work_date,v_row.style_id,v_row.position,v_row.count,actor);
   update public.assignments a set active=false
    where a.unit_id=v_unit and a.work_date=v_date and a.active and a.operation_id in(select o.id from public.operations o where o.style_id=v_row.style_id)
     and not exists(select 1 from public.daily_counts c where c.assignment_id=a.id and c.quantity>0);
   get diagnostics v_n=row_count;
   perform private.audit(actor,'remove_style_from_day',v_unit,to_jsonb(v_row),jsonb_build_object('workDate',v_date,'styleId',v_row.style_id,'assignmentsDeactivated',v_n));
  end loop;
 end if;
 return private.set_day_plan_before_guard(p_action);
end $$;
revoke all on function public.set_day_plan(jsonb) from public,anon,authenticated;
grant execute on function public.set_day_plan(jsonb) to authenticated,service_role;
