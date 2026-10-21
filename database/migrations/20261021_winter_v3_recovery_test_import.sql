-- TEST PROJECT ONLY: v3 25-table transactional restore.
-- Installing this function never modifies database records or stored receipts.
CREATE OR REPLACE FUNCTION public.recovery_test_import_v3(
 p_tables jsonb, p_apply boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_owner uuid;
 v_table text;
 v_row jsonb;
 v_rows jsonb;
 v_season jsonb;
 v_path text;
 v_count integer;
 v_existing bigint;
 v_before bigint := 0;
 v_total integer := 0;
 v_receipts integer := 0;
 v_counts jsonb := '{}'::jsonb;
 v_sequence text;
 v_max bigint;
 v_sql text;
 v_order text[] := ARRAY[
  'Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles',
  'Hive_Inspections','Hive_Feedings','Hive_Treatments','Hive_Harvests',
  'Hive_Queen_Replacements','Hive_Splits','Hive_Losses','Apiary_Activities',
  'Apiary_Recurring_Expenses','Apiary_Expenses','Apiary_Income',
  'Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results',
  'Winter_Seasons','Winter_Participation','Winter_Checklist_Items',
  'Winter_Observations','Winter_Outcomes','Winter_Snapshots','Winter_Audit_History'
 ];
BEGIN
 v_owner := auth.uid();
 IF v_owner IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
    OR NOT recovery_test_private.is_owner() THEN
   RAISE EXCEPTION 'Recovery Test owner must verify MFA before using importer v3.';
 END IF;
 IF jsonb_typeof(p_tables) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_tables)) <> 25 THEN
   RAISE EXCEPTION 'Importer v3 requires exactly 25 winter-capable tables.';
 END IF;
 -- Serialize restores and block concurrent writes before the emptiness check.
 PERFORM pg_catalog.pg_advisory_xact_lock(481207,20261017);
 FOREACH v_table IN ARRAY v_order LOOP
   EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',v_table);
 END LOOP;
 FOREACH v_table IN ARRAY v_order LOOP
   IF jsonb_typeof(p_tables->v_table) IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Missing or invalid v3 table %.',v_table;
   END IF;
   v_count := jsonb_array_length(p_tables->v_table);
   IF v_count>2000 THEN RAISE EXCEPTION 'Safety per-table limit exceeded for %.',v_table; END IF;
   v_total := v_total+v_count;
   IF v_total>10000 THEN RAISE EXCEPTION 'Safety total record limit exceeded.'; END IF;
   v_counts := v_counts || jsonb_build_object(v_table,v_count);
   IF v_table IN ('Apiary_Expense_Receipts','Apiary_Income_Receipts') THEN
     v_receipts := v_receipts+v_count;
   END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',v_table) INTO v_existing;
   v_before := v_before+v_existing;
 END LOOP;
 IF v_before<>0 THEN
   RAISE EXCEPTION 'Recovery Test already contains % records across 25 tables. Import blocked; preserve existing data and use a separate EMPTY test destination.',v_before;
 END IF;
 IF NOT p_apply THEN
   RETURN jsonb_build_object('mode','preview','ready',true,'rows',v_total,
     'receipts',v_receipts,'table_counts',v_counts);
 END IF;
 FOREACH v_table IN ARRAY v_order LOOP
   IF v_table='Winter_Audit_History' THEN
     -- Winter guard triggers require an OPEN season while child rows are inserted.
     -- Restore the final CLOSED status and original timestamps once children exist.
     FOR v_season IN SELECT value FROM jsonb_array_elements(p_tables->'Winter_Seasons') AS t(value) LOOP
       IF v_season->>'status'='closed' THEN
         UPDATE public."Winter_Seasons"
            SET status='closed',
                closed_at=(v_season->>'closed_at')::timestamptz,
                updated_at=(v_season->>'updated_at')::timestamptz,
                last_reopen_reason=v_season->>'last_reopen_reason'
          WHERE id=(v_season->>'id')::bigint AND user_id=v_owner;
         IF NOT FOUND THEN RAISE EXCEPTION 'Missing restored winter season.'; END IF;
       END IF;
     END LOOP;
     -- Only new audit entries from THIS empty-target transaction exist here.
     -- Replace them with the archived immutable history and original IDs.
     DELETE FROM public."Winter_Audit_History" WHERE user_id=v_owner;
   END IF;
   IF v_table='varroa_watch_results' THEN
     -- Inspection triggers can synthesize varroa summaries: retain archive truth.
     DELETE FROM public.varroa_watch_results
       WHERE inspection_id IN (SELECT id FROM public."Hive_Inspections");
   END IF;
   v_rows := '[]'::jsonb;
   FOR v_row IN SELECT value FROM jsonb_array_elements(p_tables->v_table) AS t(value) LOOP
     IF jsonb_typeof(v_row)<>'object' THEN RAISE EXCEPTION 'Invalid record in %.',v_table; END IF;
     IF v_row ? 'user_id' THEN
       v_row := jsonb_set(v_row,'{user_id}',to_jsonb(v_owner::text));
     END IF;
     IF v_table IN ('Apiary_Expense_Receipts','Apiary_Income_Receipts') THEN
       v_path := v_row->>'storage_path';
       IF v_path IS NULL OR v_path !~ '^[a-fA-F0-9-]{36}/[0-9]+/[a-zA-Z0-9_-]+[.]([a-zA-Z0-9]+)$' THEN
         RAISE EXCEPTION 'Invalid receipt storage path.';
       END IF;
       v_row := jsonb_set(v_row,'{storage_path}',
         to_jsonb(v_owner::text || substring(v_path from position('/' in v_path))));
     END IF;
     IF v_table='Winter_Seasons' AND v_row->>'status'='closed' THEN
       v_row := jsonb_set(v_row,'{status}','"open"'::jsonb);
       v_row := jsonb_set(v_row,'{closed_at}','null'::jsonb);
     END IF;
     -- Do not rewrite embedded historical audit/snapshot JSON evidence.
     v_rows := v_rows || jsonb_build_array(v_row);
   END LOOP;
   IF jsonb_array_length(v_rows)>0 THEN
     v_sql := format('INSERT INTO public.%I OVERRIDING SYSTEM VALUE SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.%I, $1)',v_table,v_table);
     EXECUTE v_sql USING v_rows;
   END IF;
 END LOOP;
 FOREACH v_table IN ARRAY v_order LOOP
   IF v_table='varroa_watch_results' THEN CONTINUE; END IF;
   v_sequence := pg_catalog.pg_get_serial_sequence(format('public.%I',v_table),'id');
   IF v_sequence IS NOT NULL THEN
     EXECUTE format('SELECT COALESCE(MAX(id),0) FROM public.%I',v_table) INTO v_max;
     IF v_max>0 THEN PERFORM pg_catalog.setval(v_sequence::regclass,v_max,true); END IF;
   END IF;
 END LOOP;
 RETURN jsonb_build_object('mode','applied','rows',v_total,
   'receipts',v_receipts,'table_counts',v_counts);
END;
$function$;
REVOKE ALL ON FUNCTION public.recovery_test_import_v3(jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recovery_test_import_v3(jsonb,boolean) TO authenticated;
