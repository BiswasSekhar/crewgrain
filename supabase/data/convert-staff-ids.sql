-- One-off: move staff from the old four-digit IDs (1001, 1002, ...) to the new
-- format: the first letter of the name plus three random digits (Ravi -> R482).
-- Admins are left alone. Safe to run again: only IDs that are still four digits
-- are changed. Names with no A-Z letter use E. IDs are checked for repeats
-- against every profile, deleted staff included. Run as the database owner.
do $$
declare
 r record;
 v_letter text;
 v_id text;
 v_try integer;
begin
 for r in
  select id, name from public.profiles
  where role <> 'admin' and employee_id ~ '^[0-9]{4}$'
  order by employee_id
 loop
  v_letter := coalesce((regexp_match(upper(r.name), '[A-Z]'))[1], 'E');
  v_id := null;
  for v_try in 1..2000 loop
   v_id := v_letter || lpad(floor(random() * 1000)::integer::text, 3, '0');
   exit when not exists (select 1 from public.profiles where employee_id = v_id);
   v_id := null;
  end loop;
  if v_id is null then
   raise exception 'No free ID for letter % (name %)', v_letter, r.name;
  end if;
  update public.profiles set employee_id = v_id where id = r.id;
 end loop;
end $$;
