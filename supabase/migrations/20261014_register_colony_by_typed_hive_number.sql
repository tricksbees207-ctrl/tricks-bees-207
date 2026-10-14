-- Register a colony by typed hive number/name without losing permanent hive IDs or history.
-- Runs atomically with the caller's RLS permissions.
create or replace function public.register_colony_with_hive(
  p_hive_number integer,
  p_hive_name text,
  p_colony_name text,
  p_start_date date default null,
  p_origin text default null,
  p_historical_notes text default null,
  p_apiary_area text default null,
  p_change_area boolean default false
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hive_id bigint;
  v_colony_id bigint;
  v_hive_name text := nullif(btrim(p_hive_name), '');
  v_colony_name text := nullif(btrim(p_colony_name), '');
  v_area text := nullif(btrim(p_apiary_area), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in before registering a colony';
  end if;
  if p_hive_number is null or p_hive_number < 1 or p_hive_number > 32767 then
    raise exception 'Enter a hive number between 1 and 32767';
  end if;
  if v_hive_name is null or char_length(v_hive_name) > 120 then
    raise exception 'Enter a hive name (up to 120 characters)';
  end if;
  if v_colony_name is null or char_length(v_colony_name) > 120 then
    raise exception 'Enter a colony name (up to 120 characters)';
  end if;
  if v_area is not null and char_length(v_area) > 120 then
    raise exception 'Apiary description must be 120 characters or fewer';
  end if;
  if p_start_date is not null and p_start_date > current_date then
    raise exception 'Colony start date cannot be in the future';
  end if;
  select h.id into v_hive_id from public."Hives" h
  where h.hive_number = p_hive_number for update;
  if v_hive_id is null then
    insert into public."Hives" (hive_number,hive_name,hive_location,hive_status)
    values (p_hive_number,v_hive_name,case when p_change_area then v_area else null end,'active')
    returning id into v_hive_id;
  elsif exists (
    select 1 from public."Hive_Colonies" c
    where c.hive_id=v_hive_id and c.colony_status='active'
  ) then
    raise exception 'Hive % already has an active colony. Retire or transfer it before registering another.', p_hive_number;
  end if;
  insert into public."Hive_Colonies"
    (hive_id,colony_name,colony_status,user_id,start_date,origin,historical_notes)
  values
    (v_hive_id,v_colony_name,'active',auth.uid(),p_start_date,
     nullif(btrim(p_origin),''),nullif(btrim(p_historical_notes),''))
  returning id into v_colony_id;
  update public."Hives" set
    hive_name=v_hive_name,
    hive_location=case when p_change_area then v_area else hive_location end
  where id=v_hive_id;
  return v_colony_id;
end;
$$;
revoke all on function public.register_colony_with_hive(integer,text,text,date,text,text,text,boolean) from public,anon;
grant execute on function public.register_colony_with_hive(integer,text,text,date,text,text,text,boolean) to authenticated;
