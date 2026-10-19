-- Source migration from the SEPARATE Recovery Test Supabase project only.
-- Archival development script, NOT approved for production migration.


-- Recovery Test only. Prevent silent deletion and record changes after a season closes.
create or replace function public.winter_guard_child_mutation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_owner uuid;
 v_season bigint;
 v_state text;
 v_participation bigint;
begin
 if TG_OP='DELETE' then
   raise exception 'Winter history is retained; deleting saved winter records is not allowed';
 end if;
 if TG_OP='UPDATE' then
   if new.id<>old.id or new.user_id<>old.user_id then
     raise exception 'Cannot reassign a winter record identity';
   end if;
   if TG_TABLE_NAME='Winter_Participation' and
      (new.season_id<>old.season_id or new.colony_id<>old.colony_id) then
     raise exception 'Cannot reassign a winter participant';
   end if;
   if TG_TABLE_NAME<>'Winter_Participation' and
      new.participation_id<>old.participation_id then
     raise exception 'Cannot reassign a winter record to another colony';
   end if;
 end if;
 if TG_TABLE_NAME='Winter_Participation' then
   v_season=new.season_id;
 else
   v_participation=new.participation_id;
   select p.season_id into v_season
   from public."Winter_Participation" p
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
create trigger winter_guard_participation
before insert or update or delete on public."Winter_Participation"
for each row execute function public.winter_guard_child_mutation();
create trigger winter_guard_checklist
before insert or update or delete on public."Winter_Checklist_Items"
for each row execute function public.winter_guard_child_mutation();
create trigger winter_guard_observations
before insert or update or delete on public."Winter_Observations"
for each row execute function public.winter_guard_child_mutation();
create trigger winter_guard_outcomes
before insert or update or delete on public."Winter_Outcomes"
for each row execute function public.winter_guard_child_mutation();

-- A linked loss must be owned by the same signed-in owner and colony.
create or replace function public.winter_validate_loss_link()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_colony bigint;
begin
 if new.loss_record_id is null then return new; end if;
 select p.colony_id into v_colony from public."Winter_Participation" p
 where p.id=new.participation_id and p.user_id=new.user_id;
 if not exists(select 1 from public."Hive_Losses" l
               where l.id=new.loss_record_id and l.user_id=new.user_id and l.colony_id=v_colony) then
   raise exception 'Loss record must belong to the same colony and owner';
 end if;
 return new;
end;
$$;
create trigger winter_validate_loss_link
before insert or update on public."Winter_Outcomes"
for each row execute function public.winter_validate_loss_link();

