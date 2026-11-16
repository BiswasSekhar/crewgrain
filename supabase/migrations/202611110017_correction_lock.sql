-- Accepting an employee correction computes the new wage adjustment from the
-- task's current total. Two admins accepting different corrections for the
-- same task at the same instant could both read the same total. Take the same
-- per-task lock that request_correction and admin_adjust_count use
-- (assignment id + work date, key space 2) before the action runs. The lock is
-- held until the end of the transaction, so the second reviewer waits and then
-- sees the first adjustment.
create or replace function public.app_action(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_req public.correction_requests;
begin
 if p_action->>'type' in ('apply_line_defaults','manage_employee','delete_employee','set_line_captain','assign_operations','save_operation_details','save_material') then return public.operations_action(p_action);end if;
 if p_action->>'type'='review_correction' and private.my_role()='admin' and private.try_uuid(p_action->>'id') is not null then
  select * into v_req from public.correction_requests where id=private.try_uuid(p_action->>'id');
  if v_req.id is not null then
   perform pg_advisory_xact_lock(hashtextextended(v_req.assignment_id::text||v_req.work_date::text,2));
  end if;
 end if;
 return private.app_action_before_operations(p_action);
end $$;
revoke all on function public.app_action(jsonb) from public,anon;
grant execute on function public.app_action(jsonb) to authenticated,service_role;
