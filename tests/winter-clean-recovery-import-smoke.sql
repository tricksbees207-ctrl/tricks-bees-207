-- Disposable PostgreSQL-only LIVE restore of a fictional 25-table archive.
-- No private ZIP, online test project, or production user/database is contacted.
CREATE SCHEMA recovery_test_private;
CREATE FUNCTION recovery_test_private.is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT auth.uid()='11111111-1111-4111-8111-111111111111'::uuid $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',false);
SET ROLE authenticated;

DO $restore$
DECLARE
 names text[]:=ARRAY[
  'Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles',
  'Hive_Inspections','Hive_Feedings','Hive_Treatments','Hive_Harvests',
  'Hive_Queen_Replacements','Hive_Splits','Hive_Losses','Apiary_Activities',
  'Apiary_Recurring_Expenses','Apiary_Expenses','Apiary_Income',
  'Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results',
  'Winter_Seasons','Winter_Participation','Winter_Checklist_Items',
  'Winter_Observations','Winter_Outcomes','Winter_Snapshots','Winter_Audit_History'
 ];
 archive jsonb;
 invalid_archive jsonb;
 result jsonb;
 caught boolean;
 cnt integer;
 original_snapshot jsonb;
BEGIN
 SELECT jsonb_object_agg(n,'[]'::jsonb) INTO archive FROM unnest(names) n;
 archive:=archive || jsonb_build_object(
  'Hives',jsonb_build_array(jsonb_build_object(
    'id',7,'created_at','2026-10-01T00:00:00Z','hive_number',7,'hive_name','Synthetic Recovery Hive','hive_status','active')),
  'Hive_Colonies',jsonb_build_array(jsonb_build_object(
    'id',11,'hive_id',7,'user_id','22222222-2222-4222-8222-222222222222','colony_name','Restored Synthetic Colony','colony_status','active','created_at','2026-10-01T00:00:00Z')),
  'Winter_Seasons',jsonb_build_array(jsonb_build_object(
    'id',31,'user_id','22222222-2222-4222-8222-222222222222','start_year',2026,'status','closed',
    'started_at','2026-10-01T00:00:00Z',
    'closed_at','2027-04-01T00:00:00Z',
    'updated_at','2027-04-01T00:00:00Z')),
  'Winter_Participation',jsonb_build_array(jsonb_build_object(
    'id',41,'user_id','22222222-2222-4222-8222-222222222222','season_id',31,'colony_id',11,'participation','included','prep_assessment','unassessed','added_at','2026-10-01T00:00:00Z')),
  'Winter_Checklist_Items',jsonb_build_array(jsonb_build_object(
    'id',46,'user_id','22222222-2222-4222-8222-222222222222','participation_id',41,'item_key','health_queen',
    'section','health','label','Queen status reviewed','is_custom',false,'status','complete','created_at','2026-10-01T00:00:00Z')),
  'Winter_Snapshots',jsonb_build_array(jsonb_build_object(
    'id',50,'user_id','22222222-2222-4222-8222-222222222222','season_id',31,'version',1,
    'snapshot',jsonb_build_object('schema_version',1,
      'participants',jsonb_build_array(jsonb_build_object('colony_id',11)),
      'sentinel','immutable-original'),
    'created_at','2027-04-01T00:00:00Z')),
  'Winter_Audit_History',jsonb_build_array(jsonb_build_object(
    'id',51,'user_id','22222222-2222-4222-8222-222222222222','entity_type','Winter_Seasons','entity_id',31,
    'event_type','INSERT','after_record',jsonb_build_object('status','open'),
    'recorded_at','2026-10-01T00:00:00Z'))
 );
 IF (SELECT count(*) FROM jsonb_object_keys(archive))<>25 THEN
  RAISE EXCEPTION 'Recovery archive must contain exactly 25 tables';END IF;
 -- Preview must report empty destination and refuse changes.
 result:=public.recovery_test_import_v3(archive,false);
 IF result->>'mode'<>'preview' OR result->>'ready'<>'true'
    OR (result->>'rows')::int<>7
 THEN RAISE EXCEPTION 'Unexpected empty database preview %',result;END IF;
 IF EXISTS(SELECT 1 FROM public."Winter_Seasons") THEN
  RAISE EXCEPTION 'Preview unexpectedly inserted records';END IF;
 RAISE NOTICE '25-TABLE RESTORE PREVIEW: PASS (7 fictional records, no changes)';

 -- A malformed archive must fail atomically without partial inserts.
 invalid_archive:=jsonb_set(archive,'{Winter_Checklist_Items}',
  jsonb_build_array(jsonb_build_object('id',46,
    'participation_id',99999,'item_key','bad','section','health','label','Wrong FK')));
 caught:=false;
 BEGIN
  PERFORM public.recovery_test_import_v3(invalid_archive,true);
 EXCEPTION WHEN OTHERS THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'Bad FK archive was accepted';END IF;
 IF EXISTS(SELECT 1 FROM public."Hives")
    OR EXISTS(SELECT 1 FROM public."Winter_Audit_History")
 THEN RAISE EXCEPTION 'Failed restore left partial records';END IF;
 RAISE NOTICE 'INVALID RESTORE: ATOMIC ROLLBACK PASS';

 result:=public.recovery_test_import_v3(archive,true);
 IF result->>'mode'<>'applied' OR (result->>'rows')::int<>7
 THEN RAISE EXCEPTION 'Unexpected committed result %',result;END IF;
 SELECT count(*) INTO cnt FROM public."Winter_Snapshots";
 IF cnt<>1 THEN RAISE EXCEPTION 'Historical snapshot count lost';END IF;
 SELECT snapshot INTO original_snapshot FROM public."Winter_Snapshots" WHERE id=50;
 IF original_snapshot->>'sentinel'<>'immutable-original'
 THEN RAISE EXCEPTION 'Original snapshot payload was rewritten';END IF;
 SELECT count(*) INTO cnt FROM public."Winter_Audit_History";
 IF cnt<>1 THEN RAISE EXCEPTION 'Original audit history not recovered exactly: %',cnt;END IF;
 SELECT count(*) INTO cnt FROM public."Winter_Checklist_Items" WHERE id=46 AND status='complete';
 IF cnt<>1 THEN RAISE EXCEPTION 'Archived checklist not restored';END IF;
 SELECT count(*) INTO cnt FROM public."Winter_Seasons"
 WHERE id=31 AND status='closed' AND closed_at='2027-04-01T00:00:00Z';
 IF cnt<>1 THEN RAISE EXCEPTION 'Closed season status/timestamp not restored';END IF;
 RAISE NOTICE '25-TABLE RESTORE: PASS (season, checklist, snapshot, audit and original IDs)';

 caught:=false;
 BEGIN PERFORM public.recovery_test_import_v3(archive,true);
 EXCEPTION WHEN OTHERS THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'Repeated restore bypassed nonempty guard';END IF;
 caught:=false;
 BEGIN PERFORM public.recovery_test_import_v3(archive,false);
 EXCEPTION WHEN OTHERS THEN caught:=true;
 END;
 IF NOT caught THEN RAISE EXCEPTION 'Preview after restore bypassed nonempty guard';END IF;
 SELECT count(*) INTO cnt FROM public."Winter_Snapshots";
 IF cnt<>1 THEN RAISE EXCEPTION 'Repeated restore altered immutable snapshots';END IF;
 RAISE NOTICE 'REPEATED RESTORE AND PREVIEW: BLOCKED, EXISTING HISTORY PRESERVED';
END
$restore$;
RESET ROLE;
