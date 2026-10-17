-- DRAFT ONLY: NOT APPLIED to any database. Use after inspecting the recovery-test database.
-- Handles 17-table legacy backups and 18-table recurring backups. Recovery test still requires EMPTY target.
CREATE OR REPLACE FUNCTION public.recovery_test_import(p_tables jsonb, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_owner uuid;
  v_table text;
  v_data jsonb;
  v_row jsonb;
  v_row_id text;
  v_path text;
  v_count integer;
  v_existing integer;
  v_total integer := 0;
  v_before integer := 0;
  v_receipts integer := 0;
  v_counts jsonb := '{}'::jsonb;
  v_sequence text;
  v_max bigint;
  v_sql text;
BEGIN
  v_owner := auth.uid();
  IF v_owner IS NULL OR NOT recovery_test_private.is_owner() THEN
    RAISE EXCEPTION 'Only the confirmed recovery-test owner may import data.';
  END IF;
  IF jsonb_typeof(p_tables) <> 'object' OR
     (SELECT count(*) FROM jsonb_object_keys(p_tables)) NOT IN (17,18) THEN
    RAISE EXCEPTION 'Expected 17 legacy tables or 18 recurring-capable Apiary Log tables.';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_tables)) = 18
     AND jsonb_typeof(p_tables->'Apiary_Recurring_Expenses') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'The recurring expenses table is missing or invalid.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(481207,20261017);
  FOR v_table IN SELECT unnest(ARRAY['Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles','Hive_Inspections','Hive_Feedings','Hive_Treatments','Hive_Harvests','Hive_Queen_Replacements','Hive_Splits','Hive_Losses','Apiary_Activities','Apiary_Recurring_Expenses','Apiary_Expenses','Apiary_Income','Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results']::text[]) LOOP
    IF v_table = 'Apiary_Recurring_Expenses' AND NOT (p_tables ? v_table) THEN CONTINUE; END IF;
    IF jsonb_typeof(p_tables->v_table) <> 'array' THEN
      RAISE EXCEPTION 'Missing or invalid backup table %', v_table;
    END IF;
    v_count := jsonb_array_length(p_tables->v_table);
    IF v_count > 2000 THEN
      RAISE EXCEPTION 'Safety limit exceeded for %', v_table;
    END IF;
    v_total := v_total+v_count;
    v_counts := v_counts || jsonb_build_object(v_table,v_count);
    IF v_total > 10000 THEN RAISE EXCEPTION 'Safety record limit exceeded.'; END IF;
    IF v_table IN ('Apiary_Expense_Receipts','Apiary_Income_Receipts') THEN
       v_receipts := v_receipts + v_count;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',v_table) INTO v_existing;
    v_before := v_before + v_existing;
  END LOOP;
  IF v_before <> 0 THEN
    RAISE EXCEPTION 'Recovery-test database already contains % records. This operation never overwrites or merges existing data.', v_before;
  END IF;
  IF NOT p_apply THEN
    RETURN jsonb_build_object('mode','preview','ready',true,'rows',v_total,'receipts',v_receipts,'table_counts',v_counts);
  END IF;
  FOR v_table IN SELECT unnest(ARRAY['Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles','Hive_Inspections','Hive_Feedings','Hive_Treatments','Hive_Harvests','Hive_Queen_Replacements','Hive_Splits','Hive_Losses','Apiary_Activities','Apiary_Recurring_Expenses','Apiary_Expenses','Apiary_Income','Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results']::text[]) LOOP
    IF v_table = 'Apiary_Recurring_Expenses' AND NOT (p_tables ? v_table) THEN CONTINUE; END IF;
    v_data := '[]'::jsonb;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_tables->v_table) AS items(value) LOOP
      IF jsonb_typeof(v_row)<>'object' THEN
        RAISE EXCEPTION 'Invalid record in %.',v_table;
      END IF;
      IF v_row ? 'user_id' THEN
        v_row := jsonb_set(v_row,'{user_id}',to_jsonb(v_owner::text));
      END IF;
      IF v_table IN ('Apiary_Expense_Receipts','Apiary_Income_Receipts') THEN
        v_path := v_row->>'storage_path';
        IF v_path IS NULL OR v_path !~ '^[a-fA-F0-9-]{36}/[0-9]+/[a-zA-Z0-9_-]+[.]([a-zA-Z0-9]+)$' THEN
           RAISE EXCEPTION 'A receipt path is invalid.';
        END IF;
        v_row := jsonb_set(v_row,'{storage_path}',to_jsonb(v_owner::text || substring(v_path from position('/' in v_path))));
      END IF;
      v_data := v_data || jsonb_build_array(v_row);
    END LOOP;
    IF jsonb_array_length(v_data)>0 THEN
      v_sql := format('INSERT INTO public.%I OVERRIDING SYSTEM VALUE SELECT * FROM pg_catalog.jsonb_populate_recordset(NULL::public.%I, $1)',v_table,v_table);
      EXECUTE v_sql USING v_data;
    END IF;
  END LOOP;
  FOR v_table IN SELECT unnest(ARRAY['Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles','Hive_Inspections','Hive_Feedings','Hive_Treatments','Hive_Harvests','Hive_Queen_Replacements','Hive_Splits','Hive_Losses','Apiary_Activities','Apiary_Recurring_Expenses','Apiary_Expenses','Apiary_Income','Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results']::text[]) LOOP
    IF v_table = 'Apiary_Recurring_Expenses' AND NOT (p_tables ? v_table) THEN CONTINUE; END IF;
    IF v_table = 'varroa_watch_results' THEN CONTINUE; END IF;
    v_sequence := pg_catalog.pg_get_serial_sequence(format('public.%I',v_table),'id');
    IF v_sequence IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(MAX(id),0) FROM public.%I',v_table) INTO v_max;
      IF v_max>0 THEN
         PERFORM pg_catalog.setval(v_sequence::regclass,v_max,true);
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('mode','applied','rows',v_total,'receipts',v_receipts,'table_counts',v_counts);
END;
$function$
