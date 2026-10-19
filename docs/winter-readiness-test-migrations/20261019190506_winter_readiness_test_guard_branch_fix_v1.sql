-- Source migration from the SEPARATE Recovery Test Supabase project only.
-- Archival development script, NOT approved for production migration.


-- Test-only bugfix: PL/pgSQL record fields must be tested in table-specific branches.
create or replace function public.winter_guard_child_mutation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;v_season bigint;v_state text;v_participation bigint;
begin
 if TG_OP='DELETE' then
   raise exception 'Winter history is retained; deleting saved winter records is not allowed';
 end if;
 if TG_OP='UPDATE' then
   if new.id<>old.id or new.user_id<>old.user_id then
     raise exception 'Cannot reassign a winter record identity';
   end if;
   if TG_TABLE_NAME='Winter_Participation' then
     if new.season_id<>old.season_id or new.colony_id<>old.colony_id then
       raise exception 'Cannot reassign a winter participant';
     end if;
   else
     if new.participation_id<>old.participation_id then
       raise exception 'Cannot reassign a winter record to another colony';
     end if;
   end if;
 end if;
 if TG_TABLE_NAME='Winter_Participation' then
   v_season=new.season_id;
 else
   v_participation=new.participation_id;
   select p.season_id into v_season from public."Winter_Participation" p
   where p.id=v_participation and p.user_id=new.user_id;
 end if;
 select s.status,s.user_id into v_state,v_owner from public."Winter_Seasons" s
 where s.id=v_season;
 if v_state is distinct from 'open' or v_owner is distinct from new.user_id then
   raise exception 'Winter season is closed or participant ownership is invalid';
 end if;
 return new;
end;
$$;
