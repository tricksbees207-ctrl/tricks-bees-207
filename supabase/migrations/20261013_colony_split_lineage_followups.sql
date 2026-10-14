-- Add daughter colony lineage and track completion of split follow-up inspections.
alter table public."Hive_Splits"
  add column if not exists daughter_colony_id bigint references public."Hive_Colonies"(id) on delete set null,
  add column if not exists follow_up_completed boolean not null default false,
  add column if not exists follow_up_completed_date date,
  add column if not exists follow_up_notes text;

alter table public."Hive_Splits"
  add constraint hive_splits_different_locations check (daughter_hive_id is null or daughter_hive_id <> hive_id),
  add constraint hive_splits_follow_up_after_split check (follow_up_date is null or follow_up_date >= split_date),
  add constraint hive_splits_follow_up_completion_consistent check (
    (follow_up_completed and follow_up_completed_date is not null and follow_up_completed_date >= split_date)
    or (not follow_up_completed and follow_up_completed_date is null and follow_up_notes is null)
  ),
  add constraint hive_splits_daughter_colony_requires_location check
    (daughter_colony_id is null or daughter_hive_id is not null);

create index if not exists hive_splits_daughter_colony_idx on public."Hive_Splits"(daughter_colony_id);
create index if not exists hive_splits_follow_up_idx on public."Hive_Splits"(user_id,follow_up_date)
  where follow_up_date is not null and not follow_up_completed;

-- Validate the chosen daughter colony belongs to the same account and daughter location.
-- Also ensure any parent colony linked to the split belongs to its parent location.
create or replace function public.validate_apiary_split_lineage()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.daughter_colony_id is not null and not exists (
    select 1 from public."Hive_Colonies" c
    where c.id = new.daughter_colony_id and c.hive_id = new.daughter_hive_id and c.user_id = new.user_id
  ) then
    raise exception 'Daughter colony must belong to the selected daughter hive and user';
  end if;
  if new.colony_id is not null and not exists (
    select 1 from public."Hive_Colonies" c
    where c.id = new.colony_id and c.hive_id = new.hive_id and c.user_id = new.user_id
  ) then
    raise exception 'Parent colony must belong to the selected parent hive and user';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_apiary_split_lineage_trigger on public."Hive_Splits";
create trigger validate_apiary_split_lineage_trigger
before insert or update on public."Hive_Splits"
for each row execute function public.validate_apiary_split_lineage();
