-- Source migration from the SEPARATE Recovery Test Supabase project only.
-- Archival development script, NOT approved for production migration.


-- Test-only: owner must explicitly approve each active colony added after season startup.
create or replace function public.winter_add_colony(
 p_season_id bigint, p_colony_id bigint, p_include boolean, p_reason text default null
) returns bigint language plpgsql security invoker set search_path=''
as $$
declare v_owner uuid; v_id bigint;
begin
 v_owner=auth.uid();
 if v_owner is null or (auth.jwt()->>'aal') <> 'aal2' then
   raise exception 'Verified sign-in required';
 end if;
 if not exists(select 1 from public."Winter_Seasons"
               where id=p_season_id and user_id=v_owner and status='open') then
   raise exception 'No open season belongs to this account';
 end if;
 if not exists(select 1 from public."Hive_Colonies"
               where id=p_colony_id and user_id=v_owner and colony_status='active') then
   raise exception 'Only your active colonies can be added';
 end if;
 if not p_include and nullif(trim(coalesce(p_reason,'')),'') is null then
   raise exception 'Please record a reason for excluding this colony';
 end if;
 insert into public."Winter_Participation"(user_id,season_id,colony_id,participation,exclusion_reason)
 values(v_owner,p_season_id,p_colony_id,case when p_include then 'included' else 'excluded' end,
        case when p_include then null else trim(p_reason) end)
 on conflict(season_id,colony_id) do nothing
 returning id into v_id;
 if v_id is null then
   raise exception 'This colony already belongs to the season';
 end if;
 if p_include then
   insert into public."Winter_Checklist_Items"(user_id,participation_id,item_key,section,label)
   select v_owner,v_id,x.key,x.section,x.label from (values
     ('health_queen','health','Queen status reviewed'),
     ('health_strength','health','Colony strength assessed'),
     ('health_varroa','health','Varroa management reviewed'),
     ('health_treatment','health','Treatment follow-ups reviewed'),
     ('food_stores','food','Winter food stores assessed'),
     ('food_feeding','food','Fall feeding reviewed'),
     ('protection_mouse_guard','protection','Mouse guard installed or checked'),
     ('protection_moisture','protection','Moisture and ventilation setup checked'),
     ('protection_equipment','protection','Hive equipment secured'),
     ('protection_wind','protection','Wind and weather protection reviewed')
   ) as x(key,section,label);
 end if;
 return v_id;
end;
$$;
revoke all on function public.winter_add_colony(bigint,bigint,boolean,text) from public,anon;
grant execute on function public.winter_add_colony(bigint,bigint,boolean,text) to authenticated;

