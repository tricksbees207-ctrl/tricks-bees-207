-- Source of the isolated Recovery Test winter backup importer. Do not run in production.


-- TEST project only: restore winter archive records without modifying the established 18-table importer.
-- Requires base Apiary records to be present before winter records are restored.
create or replace function public.winter_recovery_remap_owner(p_value jsonb,p_previous text,p_next text)
returns jsonb language plpgsql immutable set search_path=''
as $$
declare v_type text; v_result jsonb;v_pair record;v_value jsonb;
begin
 if p_value is null then return null;end if;
 v_type=jsonb_typeof(p_value);
 if v_type='object' then
   v_result='{}'::jsonb;
   for v_pair in select key,value from jsonb_each(p_value) loop
     if v_pair.key='user_id' and v_pair.value=to_jsonb(p_previous) then
       v_value=to_jsonb(p_next);
     else
       v_value=public.winter_recovery_remap_owner(v_pair.value,p_previous,p_next);
     end if;
     v_result=v_result||jsonb_build_object(v_pair.key,v_value);
   end loop;
   return v_result;
 elsif v_type='array' then
   select coalesce(jsonb_agg(public.winter_recovery_remap_owner(value,p_previous,p_next)),'[]'::jsonb)
   into v_result from jsonb_array_elements(p_value);
   return v_result;
 end if;
 return p_value;
end;
$$;
revoke all on function public.winter_recovery_remap_owner(jsonb,text,text) from public,anon,authenticated;

create or replace function public.recovery_test_import_winter(p_winter jsonb,p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;v_table text;v_count integer;v_existing integer;
 v_total integer:=0;v_counts jsonb:='{}'::jsonb;v_rows jsonb;v_row jsonb;
 v_old text;v_rec jsonb;v_recovery_row jsonb;v_sql text;v_seq text;v_max bigint;
 v_tables text[]:=array['Winter_Seasons','Winter_Participation','Winter_Checklist_Items',
  'Winter_Observations','Winter_Outcomes','Winter_Audit_History','Winter_Snapshots'];
begin
 v_owner=auth.uid();
 if v_owner is null or (auth.jwt()->>'aal')<>'aal2' or not recovery_test_private.is_owner() then
   raise exception 'Recovery Test owner MFA required';
 end if;
 if jsonb_typeof(p_winter)<>'object' or
    (select count(*) from jsonb_object_keys(p_winter))<>7 then
   raise exception 'Exactly seven winter history tables are required';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(481207,20261017);
 foreach v_table in array v_tables loop
   if jsonb_typeof(p_winter->v_table)<>'array' then
     raise exception 'Invalid winter table %',v_table;
   end if;
   v_count=jsonb_array_length(p_winter->v_table);
   if v_count>2000 then raise exception 'Safety limit exceeded for %',v_table; end if;
   v_counts=v_counts||jsonb_build_object(v_table,v_count);
   v_total=v_total+v_count;
   if v_total>10000 then raise exception 'Winter archive exceeds safety limit';end if;
   execute format('select count(*) from public.%I',v_table) into v_existing;
   if v_existing<>0 then
     raise exception 'Test % contains % records; winter importer never overwrites existing data',v_table,v_existing;
   end if;
 end loop;
 select min(elem->>'user_id') into v_old
 from jsonb_array_elements(p_winter->'Winter_Seasons') elem;
 if v_old is null then
   select min(elem->>'user_id') into v_old
   from jsonb_array_elements(p_winter->'Winter_Participation') elem;
 end if;
 if v_old is not null then
   for v_table in select unnest(v_tables) loop
     if exists(select 1 from jsonb_array_elements(p_winter->v_table) elem
       where elem->>'user_id' is distinct from v_old)
     then raise exception 'Winter archive has mixed owners';end if;
   end loop;
 else
   if v_total>0 then raise exception 'Winter archive has records but no season owner';end if;
   v_old=v_owner::text;
 end if;
 if not p_apply then
   return jsonb_build_object('mode','preview','rows',v_total,'table_counts',v_counts);
 end if;
 -- Restore 5 relational tables in FK dependency order.
 foreach v_table in array array['Winter_Seasons','Winter_Participation',
   'Winter_Checklist_Items','Winter_Observations','Winter_Outcomes']::text[] loop
   v_rows='[]'::jsonb;
   for v_row in select value from jsonb_array_elements(p_winter->v_table)items(value)loop
     if jsonb_typeof(v_row)<>'object' or not(v_row?'id') then
       raise exception 'Winter archive record lacks ID in %',v_table;
     end if;
     v_rec=public.winter_recovery_remap_owner(v_row,v_old,v_owner::text);
     if v_table='Winter_Seasons' then
       v_rec=jsonb_set(jsonb_set(v_rec,'{status}','"open"'::jsonb),'{closed_at}','null'::jsonb);
     end if;
     v_rows=v_rows||jsonb_build_array(v_rec);
   end loop;
   if jsonb_array_length(v_rows)>0 then
     v_sql=format('insert into public.%I overriding system value select * from pg_catalog.jsonb_populate_recordset(null::public.%I,$1)',v_table,v_table);
     execute v_sql using v_rows;
   end if;
 end loop;
 -- Preserve captured historical data as literal JSONB values with original version numbers.
 v_rows='[]'::jsonb;
 for v_row in select value from jsonb_array_elements(p_winter->'Winter_Snapshots')items(value)loop
   if jsonb_typeof(v_row)<>'object' or not(v_row?'id') then
     raise exception 'Invalid historical winter snapshot';
   end if;
   v_rows=v_rows||jsonb_build_array(public.winter_recovery_remap_owner(v_row,v_old,v_owner::text));
 end loop;
 if jsonb_array_length(v_rows)>0 then
   insert into public."Winter_Snapshots" overriding system value
     select * from pg_catalog.jsonb_populate_recordset(null::public."Winter_Snapshots",v_rows);
 end if;
 -- Restore original closed states after all children have been inserted.
 for v_row in select value from jsonb_array_elements(p_winter->'Winter_Seasons') items(value)loop
   if (v_row->>'status')='closed' then
     update public."Winter_Seasons"
     set status='closed',closed_at=(v_row->>'closed_at')::timestamptz,
       updated_at=(v_row->>'updated_at')::timestamptz,
       last_reopen_reason=v_row->>'last_reopen_reason'
     where id=(v_row->>'id')::bigint and user_id=v_owner;
   elsif (v_row->>'status') is distinct from 'open' then
     raise exception 'Invalid winter season status';
   end if;
 end loop;
 -- Replace importer-generated audit events with exact archived events in the
 -- already-verified empty TEST winter history. No real history is deleted.
 delete from public."Winter_Audit_History" where user_id=v_owner;
 v_rows='[]'::jsonb;
 for v_row in select value from jsonb_array_elements(p_winter->'Winter_Audit_History') items(value) loop
   if jsonb_typeof(v_row)<>'object' or not(v_row?'id') then
     raise exception 'Invalid winter audit record';
   end if;
   v_rows=v_rows||jsonb_build_array(public.winter_recovery_remap_owner(v_row,v_old,v_owner::text));
 end loop;
 if jsonb_array_length(v_rows)>0 then
   insert into public."Winter_Audit_History" overriding system value
     select * from pg_catalog.jsonb_populate_recordset(null::public."Winter_Audit_History",v_rows);
 end if;
 foreach v_table in array v_tables loop
   v_seq=pg_catalog.pg_get_serial_sequence(format('public.%I',v_table),'id');
   if v_seq is not null then
     execute format('select coalesce(max(id),0) from public.%I',v_table)into v_max;
     if v_max>0 then perform pg_catalog.setval(v_seq::regclass,v_max,true);end if;
   end if;
 end loop;
 return jsonb_build_object('mode','applied','rows',v_total,'table_counts',v_counts);
end;
$$;
revoke all on function public.recovery_test_import_winter(jsonb,boolean) from public,anon;
grant execute on function public.recovery_test_import_winter(jsonb,boolean) to authenticated;

-- Atomic full v3 import: established 18-table importer + seven winter tables
-- succeed or roll back together.
create or replace function public.recovery_test_import_v3(p_tables jsonb,p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;v_base jsonb;v_winter jsonb;v_base_reply jsonb;v_winter_reply jsonb;
 v_table text;
 v_winter_tables text[]:=array['Winter_Seasons','Winter_Participation','Winter_Checklist_Items',
  'Winter_Observations','Winter_Outcomes','Winter_Audit_History','Winter_Snapshots'];
begin
 v_owner=auth.uid();
 if v_owner is null or (auth.jwt()->>'aal')<>'aal2' or not recovery_test_private.is_owner() then
  raise exception 'Recovery Test owner MFA required';
 end if;
 if jsonb_typeof(p_tables)<>'object' or
   (select count(*) from jsonb_object_keys(p_tables))<>25 then
   raise exception 'Expected 25-table winter-aware archive';
 end if;
 v_winter='{}'::jsonb;
 v_base=p_tables;
 foreach v_table in array v_winter_tables loop
  if jsonb_typeof(p_tables->v_table)<>'array' then
    raise exception 'Missing winter table %',v_table;
  end if;
  v_winter=v_winter||jsonb_build_object(v_table,p_tables->v_table);
  v_base=v_base-v_table;
 end loop;
 if (select count(*) from jsonb_object_keys(v_base))<>18 then
   raise exception 'Wrong number of original apiary tables';
 end if;
 -- Preview and apply are scoped to the same Postgres transaction.
 v_winter_reply=public.recovery_test_import_winter(v_winter,false);
 v_base_reply=public.recovery_test_import(v_base,p_apply);
 if p_apply then
   v_winter_reply=public.recovery_test_import_winter(v_winter,true);
 end if;
 return jsonb_build_object(
   'mode',case when p_apply then 'applied' else 'preview' end,
   'rows',(v_base_reply->>'rows')::integer+(v_winter_reply->>'rows')::integer,
   'receipts',(v_base_reply->>'receipts')::integer,
   'table_counts',(v_base_reply->'table_counts')||(v_winter_reply->'table_counts')
 );
end;
$$;
revoke all on function public.recovery_test_import_v3(jsonb,boolean) from public,anon;
grant execute on function public.recovery_test_import_v3(jsonb,boolean) to authenticated;

