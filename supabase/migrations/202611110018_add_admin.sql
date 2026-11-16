-- A second (or later) admin. bootstrap_admin only works while no admin exists,
-- and the app cannot create admins. This is for the operator only: it is
-- callable with the service key from scripts/add-admin.mjs, never from the app.
-- The auth user is created by the script first; this adds the profile, puts it
-- in the first unit (admins are not tied to one line) and writes an audit row.
create function public.add_admin(p_id uuid,p_auth_user uuid,p_employee_id text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_unit uuid;v_code text:=upper(trim(coalesce(p_employee_id,'')));
begin
 perform pg_advisory_xact_lock(991107);
 if not exists(select 1 from public.profiles where role='admin' and active) then raise exception 'Create the first admin with bootstrap-admin first';end if;
 if v_code !~ '^[A-Z0-9-]{2,24}$' or length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Enter a valid ID and name';end if;
 if exists(select 1 from public.profiles where employee_id=v_code) then raise exception 'That employee ID is already used';end if;
 select id into v_unit from public.units order by code limit 1;
 if v_unit is null then raise exception 'Create a unit first';end if;
 insert into public.profiles(id,auth_user_id,employee_id,name,role,operation) values(p_id,p_auth_user,v_code,trim(p_name),'admin','Factory admin');
 insert into public.unit_memberships(profile_id,unit_id,role) values(p_id,v_unit,'admin');
 perform private.audit(p_id,'add_admin',p_id,null,jsonb_build_object('employeeId',v_code));
 return p_id;
end $$;
revoke all on function public.add_admin(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.add_admin(uuid,uuid,text,text) to service_role;
