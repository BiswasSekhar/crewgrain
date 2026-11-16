-- Staff enter an existing employee ID or phone number without a password/OTP.
-- The edge gateway alone mints the random device credential; admins use Supabase Auth.
create function public.reserve_staff_login(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.login_attempts;
begin
 if p_key !~ '^STAFF-[0-9a-f]{64}$' then return false; end if;
 insert into public.login_attempts(employee_id) values(p_key) on conflict do nothing;
 select * into r from public.login_attempts where employee_id=p_key for update;
 if r.window_start < now()-interval '15 minutes' then
  r.attempts:=0; r.window_start:=now();
 end if;
 if r.attempts >= 60 then return false; end if;
 update public.login_attempts set attempts=r.attempts+1,window_start=r.window_start where employee_id=p_key;
 return true;
end $$;

create function public.staff_sign_in(p_identifier text,p_device_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare identifier text:=upper(trim(p_identifier)); digits text;
 matches uuid[]; profile uuid; device uuid;
begin
 if identifier is null or length(identifier) not between 1 and 40 or p_device_hash is null or p_device_hash !~ '^[a-f0-9]{64}$' then return null; end if;
 digits:=regexp_replace(identifier,'[^0-9]','','g');
 if length(digits)=12 and left(digits,2)='91' then digits:=right(digits,10); end if;
 select array_agg(p.id) into matches from public.profiles p
 where p.active and p.role in ('worker','captain')
 and exists(select 1 from public.unit_memberships m join public.units u on u.id=m.unit_id and u.active where m.profile_id=p.id and m.status='active')
 and (upper(p.employee_id)=identifier or (
  identifier ~ '^[+0-9 ().-]+$' and length(digits)>=7 and p.phone is not null and
  case when length(regexp_replace(p.phone,'[^0-9]','','g'))=12 and left(regexp_replace(p.phone,'[^0-9]','','g'),2)='91'
   then right(regexp_replace(p.phone,'[^0-9]','','g'),10)
   else regexp_replace(p.phone,'[^0-9]','','g') end = digits
 ));
 -- Duplicate/shared numbers are ambiguous: use the unique employee ID instead.
 if coalesce(array_length(matches,1),0)<>1 then return null; end if;
 profile:=matches[1];
 insert into public.linked_phones(profile_id,token_hash) values(profile,p_device_hash) returning id into device;
 perform private.audit(profile,'staff_signed_in',device,null,jsonb_build_object('profileId',profile));
 return device;
end $$;
revoke all on function public.reserve_staff_login(text),public.staff_sign_in(text,text) from public,anon,authenticated;
grant execute on function public.reserve_staff_login(text),public.staff_sign_in(text,text) to service_role;
