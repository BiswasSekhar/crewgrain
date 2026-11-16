-- Captains can see what each employee on their line earned per day. Only the
-- computed amount is sent; piece rates themselves stay hidden from captains.
alter function public.get_app_snapshot() rename to get_app_snapshot_plan;
revoke all on function public.get_app_snapshot_plan() from public,anon,authenticated;
create function public.get_app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=public.get_app_snapshot_plan();unit uuid:=private.my_unit();
begin
 if private.my_role()<>'captain' then return base;end if;
 return base||jsonb_build_object('employeeMoney',coalesce((
  select jsonb_agg(jsonb_build_object('employeeId',m.employee_id,'workDate',m.work_date,'amountPaise',m.amount_paise) order by m.work_date,m.employee_id)
  from (
   select r.employee_id,r.work_date,sum(r.amount_paise)::bigint amount_paise
   from (
    select c.employee_id,c.work_date,
     (case when d.status in ('approved','admin_approved')
      then coalesce(nullif(checked_task.task->>'finalQuantity','')::integer,c.quantity)+coalesce((select sum(w.quantity_delta)::integer from public.wage_adjustments w where w.assignment_id=c.assignment_id and w.work_date=c.work_date),0)
      else c.quantity end)::bigint * coalesce(nullif(checked_task.task->>'ratePaise','')::integer,c.rate_paise)::bigint amount_paise
    from public.daily_counts c
    left join public.day_checks d on d.employee_id=c.employee_id and d.work_date=c.work_date
    left join lateral (
     select task from jsonb_array_elements(coalesce(d.tasks,'[]'::jsonb)) as item(task)
     where task->>'assignmentId'=c.assignment_id::text limit 1
    ) checked_task on true
    where c.unit_id=unit and c.work_date>=(now() at time zone 'Asia/Kolkata')::date-400
    union all
    select e.employee_id,e.work_date,e.quantity::bigint*e.rate_paise::bigint amount_paise
    from public.production_entries e
    where e.unit_id=unit and e.status in ('approved','pending') and e.work_date>=(now() at time zone 'Asia/Kolkata')::date-400
     and not exists(
      select 1 from public.daily_counts c join public.assignments a on a.id=c.assignment_id
      where c.employee_id=e.employee_id and c.unit_id=e.unit_id and c.work_date=e.work_date
       and a.operation_id=e.operation_id and a.lot_id=e.lot_id
     )
   ) r
   group by r.employee_id,r.work_date
  ) m
 ),'[]'::jsonb));
end $$;
revoke all on function public.get_app_snapshot() from public,anon,authenticated;
grant execute on function public.get_app_snapshot() to authenticated,service_role;
