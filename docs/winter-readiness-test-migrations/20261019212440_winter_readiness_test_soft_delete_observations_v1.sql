-- Recovery Test project only. Soft deletion of winter observations retains full audit history.

-- Recovery Test ONLY: audited deletion hides observations but retains original record and history.
-- This migration does not delete or update any existing observation rows.
ALTER TABLE public."Winter_Observations" ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.winter_guard_child_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_season bigint; v_state text;
begin
 if TG_OP='DELETE' then
   raise exception 'Winter history is retained; deletion is not allowed';
 end if;
 if TG_OP='UPDATE' then
   if TG_TABLE_NAME='Winter_Observations' and old.deleted_at is not null then
     raise exception 'Deleted winter observations cannot be edited';
   end if;
   if new.id<>old.id or new.user_id<>old.user_id then
     raise exception 'Cannot reassign winter record identity';
   end if;
   if TG_TABLE_NAME='Winter_Participation' then
     if new.season_id<>old.season_id or new.colony_id<>old.colony_id then
       raise exception 'Cannot reassign a winter participant';
     end if;
   else
     if new.participation_id<>old.participation_id then
       raise exception 'Cannot reassign a winter record';
     end if;
   end if;
 end if;
 if TG_TABLE_NAME='Winter_Participation' then
   v_season=new.season_id;
 else
   select p.season_id into v_season from public."Winter_Participation" p
   where p.id=new.participation_id and p.user_id=new.user_id;
 end if;
 select s.status,s.user_id into v_state,v_owner
 from public."Winter_Seasons" s where s.id=v_season for share;
 if v_state is distinct from 'open' or v_owner is distinct from new.user_id then
   raise exception 'Winter season closed or participant ownership invalid';
 end if;
 return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.winter_close_season(p_season_id bigint, p_unresolved jsonb DEFAULT '{}'::jsonb, p_closure_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_owner uuid;
 v_start_year integer;
 v_state text;
 v_closed timestamptz;
 v_version integer;
 v_people jsonb;
 v_missing integer;
begin
 v_owner=auth.uid();
 if v_owner is null or (auth.jwt()->>'aal') <> 'aal2' then
   raise exception 'Verified MFA sign-in required';
 end if;
 if p_unresolved is null or jsonb_typeof(p_unresolved)<>'object' then
   raise exception 'Unresolved outcome explanations must be a JSON object';
 end if;
 select s.start_year,s.status into v_start_year,v_state
 from public."Winter_Seasons" s
 where s.id=p_season_id and s.user_id=v_owner for update;
 if v_state is distinct from 'open' then
   raise exception 'No open season found for this account';
 end if;

 select count(*) into v_missing
 from public."Winter_Participation" p
 left join public."Winter_Outcomes" o on o.participation_id=p.id and o.user_id=v_owner
 where p.season_id=p_season_id and p.user_id=v_owner and p.participation='included'
   and (o.id is null or o.outcome='not_assessed')
   and nullif(trim(coalesce(p_unresolved->>(p.id::text),'')),'') is null;
 if v_missing>0 then
   raise exception 'Closure requires an explanation for each of % unresolved colonies',v_missing;
 end if;
 v_closed=clock_timestamp();
 select coalesce(jsonb_agg(
   jsonb_build_object(
     'participation',to_jsonb(p),
     'colony',to_jsonb(c),
     'unresolved_reason',nullif(trim(coalesce(p_unresolved->>(p.id::text),'')),''),
     'checklist',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)
                  from public."Winter_Checklist_Items" i where i.participation_id=p.id and i.user_id=v_owner),
     'observations',(select coalesce(jsonb_agg(to_jsonb(o) order by o.observed_on,o.id),'[]'::jsonb)
                     from public."Winter_Observations" o where o.participation_id=p.id and o.user_id=v_owner and o.deleted_at is null),
     'outcome',(select to_jsonb(o) from public."Winter_Outcomes" o
                where o.participation_id=p.id and o.user_id=v_owner),
     'linked_loss',(select to_jsonb(l) from public."Winter_Outcomes" o
                    join public."Hive_Losses" l on l.id=o.loss_record_id and l.user_id=v_owner
                    where o.participation_id=p.id and o.user_id=v_owner),
     'spring_inspections',(select coalesce(jsonb_agg(to_jsonb(i) order by i.inspection_date,i.id),'[]'::jsonb)
                           from public."Hive_Inspections" i
                           where i.colony_id=p.colony_id
                             and i.inspection_date between make_date(v_start_year+1,1,1) and v_closed::date),
     'last_inspection',(select to_jsonb(i) from public."Hive_Inspections" i
                        where i.colony_id=p.colony_id and i.inspection_date<=v_closed::date
                        order by i.inspection_date desc,i.id desc limit 1),
     'last_feeding',(select to_jsonb(f) from public."Hive_Feedings" f
                     where f.colony_id=p.colony_id and f.user_id=v_owner and f.feed_date<=v_closed::date
                     order by f.feed_date desc,f.id desc limit 1),
     'last_treatment',(select to_jsonb(t) from public."Hive_Treatments" t
                       where t.colony_id=p.colony_id and t.user_id=v_owner and t.treatment_date<=v_closed::date
                       order by t.treatment_date desc,t.id desc limit 1)
   ) order by p.id),'[]'::jsonb)
 into v_people
 from public."Winter_Participation" p
 join public."Hive_Colonies" c on c.id=p.colony_id and c.user_id=v_owner
 where p.season_id=p_season_id and p.user_id=v_owner;

 update public."Winter_Seasons" set status='closed',closed_at=v_closed,updated_at=v_closed
 where id=p_season_id and user_id=v_owner;
 select coalesce(max(version),0)+1 into v_version
 from public."Winter_Snapshots" where season_id=p_season_id and user_id=v_owner;
 insert into public."Winter_Snapshots"
   (user_id,season_id,version,snapshot,closure_reason,created_at)
 values
   (v_owner,p_season_id,v_version,
    jsonb_build_object('schema_version',1,'season_year',v_start_year,'season_id',p_season_id,
                       'closed_at',v_closed,'participants',v_people,'closure_notes',p_closure_notes),
    p_closure_notes,v_closed);
 return v_version;
end;
$function$
;

