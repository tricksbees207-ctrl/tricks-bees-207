-- Executes ONLY in the isolated GitHub Actions PostgreSQL service.
-- Assertions cover the main season lifecycle, MFA and owner RLS, and snapshot immutability.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', false);
SET ROLE authenticated;

DO $smoke$
DECLARE
 sid bigint;
 part_id bigint;
 snapshot_version integer;
 total bigint;
 blocked boolean;
 historical_sid bigint;
 historical_part bigint;
 archived jsonb;
BEGIN
 sid := public.winter_start_season(2026);
 IF sid IS NULL THEN RAISE EXCEPTION 'No Winter season created'; END IF;
 SELECT id INTO part_id FROM public."Winter_Participation" WHERE season_id = sid;
 IF part_id IS NULL THEN RAISE EXCEPTION 'Active colony not included'; END IF;
 SELECT count(*) INTO total FROM public."Winter_Checklist_Items" WHERE participation_id=part_id;
 IF total <> 10 THEN RAISE EXCEPTION 'Expected 10 checklist items, got %',total; END IF;

 snapshot_version := public.winter_close_season(sid,jsonb_build_object(part_id::text,'Test unresolved outcome'),null);
 IF snapshot_version <> 1 THEN RAISE EXCEPTION 'Expected snapshot 1, got %',snapshot_version; END IF;
 SELECT count(*) INTO total FROM public."Winter_Snapshots" WHERE season_id=sid;
 IF total <> 1 THEN RAISE EXCEPTION 'Snapshot was not created'; END IF;
 SELECT count(*) INTO total FROM public."Winter_Audit_History";
 IF total < 12 THEN RAISE EXCEPTION 'Audit history incomplete: %',total; END IF;
 RAISE NOTICE 'WINTER LIFECYCLE: PASS (season %, snapshot %, audit entries %)', sid,snapshot_version,total;
 -- Closed seasons must reject checklist changes, even by the correct MFA-verified owner.
 blocked := false;
 BEGIN
  UPDATE public."Winter_Checklist_Items" SET status='complete'
   WHERE participation_id=part_id;
 EXCEPTION WHEN raise_exception THEN
  blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Closed season checklist was editable'; END IF;
 RAISE NOTICE 'CLOSED SEASON MUTATION: BLOCKED';

 IF NOT public.winter_reopen_season(sid,'Controlled test reopening') THEN
  RAISE EXCEPTION 'Season did not reopen';
 END IF;
 SELECT count(*) INTO total FROM public."Winter_Snapshots" WHERE season_id=sid;
 IF total <> 1 THEN RAISE EXCEPTION 'Original snapshot vanished after reopening'; END IF;
 snapshot_version := public.winter_close_season(sid,jsonb_build_object(part_id::text,'Second closure test'),null);
 IF snapshot_version <> 2 THEN
  RAISE EXCEPTION 'Expected second immutable snapshot version, got %', snapshot_version;
 END IF;
 SELECT count(*) INTO total FROM public."Winter_Snapshots" WHERE season_id=sid;
 IF total <> 2 THEN RAISE EXCEPTION 'Historical snapshot versions not preserved'; END IF;
 RAISE NOTICE 'WINTER REOPEN/CLOSE HISTORY: PASS (two snapshots preserved)';

 -- A 2025-26 historical closure must reject pre-existing inspection/feeding/
 -- treatment records whose colony ID matches but hive ID does not.
 historical_sid := public.winter_start_season(2025);
 SELECT id INTO historical_part FROM public."Winter_Participation" WHERE season_id=historical_sid;
 IF historical_part IS NULL THEN RAISE EXCEPTION 'Historical season colony missing'; END IF;
 PERFORM public.winter_close_season(historical_sid,
     jsonb_build_object(historical_part::text,'Fixture historical assessment'),null);
 SELECT snapshot->'participants'->0 INTO archived
 FROM public."Winter_Snapshots" WHERE season_id=historical_sid AND version=1;
 IF archived IS NULL THEN RAISE EXCEPTION 'Historical snapshot payload missing'; END IF;
 IF jsonb_array_length(archived->'spring_inspections')<>1 THEN
   RAISE EXCEPTION 'Historical spring inspections include the wrong hive or omit correct hive';
 END IF;
 IF archived->'spring_inspections'->0->>'inspection_notes'<>'MATCHED-HIVE-INSPECTION'
   OR archived->'last_inspection'->>'inspection_notes'<>'MATCHED-HIVE-INSPECTION'
   OR archived->'last_feeding'->>'notes'<>'MATCHED-HIVE-FEEDING'
   OR archived->'last_treatment'->>'product'<>'MATCHED-HIVE-TREATMENT'
 THEN RAISE EXCEPTION 'Historical closure captured a wrong-hive record'; END IF;
 RAISE NOTICE 'WINTER SNAPSHOT HIVE-COLONY CROSS-CHECK: PASS';


END
$smoke$;

-- Same owner, but AAL1 without MFA: all private Winter data must disappear.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', false);
SET ROLE authenticated;
DO $mfa$
BEGIN
 IF EXISTS(SELECT 1 FROM public."Winter_Seasons")
    OR EXISTS(SELECT 1 FROM public."Winter_Checklist_Items")
    OR EXISTS(SELECT 1 FROM public."Winter_Audit_History")
    OR EXISTS(SELECT 1 FROM public."Winter_Snapshots")
 THEN RAISE EXCEPTION 'AAL1 account can see private Winter data'; END IF;
 RAISE NOTICE 'WINTER AAL1 ACCESS: BLOCKED';
END
$mfa$;

-- Different owner, even at AAL2: no access to someone else's Winter data.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', false);
SET ROLE authenticated;
DO $owner$
BEGIN
 IF EXISTS(SELECT 1 FROM public."Winter_Seasons")
    OR EXISTS(SELECT 1 FROM public."Winter_Snapshots")
 THEN RAISE EXCEPTION 'Another account can see private Winter data'; END IF;
 RAISE NOTICE 'WINTER CROSS-ACCOUNT ACCESS: BLOCKED';
END
$owner$;

-- Even a database administrator must not change a historical snapshot.
RESET ROLE;
DO $immutable$
DECLARE
 snapshot_id bigint;
 blocked boolean;
 op text;
BEGIN
 SELECT min(id) INTO snapshot_id FROM public."Winter_Snapshots";
 IF snapshot_id IS NULL THEN RAISE EXCEPTION 'Snapshot missing'; END IF;

 FOREACH op IN ARRAY ARRAY['UPDATE', 'DELETE'] LOOP
  blocked := false;
  BEGIN
   IF op='UPDATE' THEN
    UPDATE public."Winter_Snapshots" SET version=version WHERE id=snapshot_id;
   ELSE
    DELETE FROM public."Winter_Snapshots" WHERE id=snapshot_id;
   END IF;
  EXCEPTION WHEN raise_exception THEN
   blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Snapshot % unexpectedly allowed',op; END IF;
  RAISE NOTICE 'SNAPSHOT %: BLOCKED',op;
 END LOOP;
END
$immutable$;

-- Verify that the proposed production migration removes the exact grants flagged
-- by the online Recovery Test Supabase security advisor. No online DB is changed.
RESET ROLE;
DO $grants$
DECLARE
 f record;
 is_client_rpc boolean;
 anon_can_call boolean;
 signed_can_call boolean;
BEGIN
 FOR f IN
  SELECT p.oid, p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'winter_%'
 LOOP
  anon_can_call := has_function_privilege('anon',f.oid,'EXECUTE');
  signed_can_call := has_function_privilege('authenticated',f.oid,'EXECUTE');
  is_client_rpc := f.proname=ANY(ARRAY[
   'winter_start_season','winter_add_colony','winter_close_season','winter_reopen_season'
  ]);
  IF anon_can_call THEN
   RAISE EXCEPTION 'Anonymous EXECUTE unexpectedly allowed: %', f.proname;
  END IF;
  IF signed_can_call IS DISTINCT FROM is_client_rpc THEN
   RAISE EXCEPTION 'Incorrect signed-in EXECUTE permission: % (actual %, expected %)',
    f.proname,signed_can_call,is_client_rpc;
  END IF;
 END LOOP;
 IF has_table_privilege('authenticated','public."Winter_Audit_History"','INSERT')
    OR has_table_privilege('authenticated','public."Winter_Audit_History"','UPDATE')
    OR has_table_privilege('authenticated','public."Winter_Audit_History"','DELETE')
    OR has_table_privilege('authenticated','public."Winter_Snapshots"','INSERT')
    OR has_table_privilege('authenticated','public."Winter_Snapshots"','UPDATE')
    OR has_table_privilege('authenticated','public."Winter_Snapshots"','DELETE')
 THEN RAISE EXCEPTION 'Winter audit/snapshot DML privileges must be revoked'; END IF;
 RAISE NOTICE 'RPC GRANTS: anonymous blocked for every Winter routine; authenticated limited to four guarded season RPCs';
 IF has_table_privilege('authenticated','public."Winter_Seasons"','UPDATE')
    OR has_table_privilege('authenticated','public."Winter_Seasons"','DELETE')
 THEN RAISE EXCEPTION 'Winter seasons must only be updated by guarded season RPCs'; END IF;
 IF has_table_privilege('authenticated','public."Winter_Participation"','DELETE')
    OR has_table_privilege('authenticated','public."Winter_Checklist_Items"','DELETE')
    OR has_table_privilege('authenticated','public."Winter_Observations"','DELETE')
    OR has_table_privilege('authenticated','public."Winter_Outcomes"','DELETE')
 THEN RAISE EXCEPTION 'Winter history must not have direct DELETE grants'; END IF;
 RAISE NOTICE 'LEAST PRIVILEGE: direct deletes blocked; season update reserved for guarded RPCs';
 RAISE NOTICE 'IMMUTABLE HISTORY GRANTS: signed-in table writes blocked';
END
$grants$;

-- AAL1 cannot invoke a privileged season-creation RPC.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',false);
SET ROLE authenticated;
DO $mfa_rpc$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.winter_start_season(2040);
 EXCEPTION WHEN raise_exception THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'AAL1 started a Winter season'; END IF;
 RAISE NOTICE 'WINTER MFA RPC: AAL1 blocked';
END
$mfa_rpc$;

-- Another signed-in owner cannot manipulate an existing season.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT set_config('request.jwt.claims',
 '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',false);
SET ROLE authenticated;
DO $cross_write$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.winter_reopen_season(1,'Unauthorized attempt');
 EXCEPTION WHEN raise_exception THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Other owner reopened a Winter season'; END IF;
 RAISE NOTICE 'WINTER CROSS-OWNER RPC: blocked';
END
$cross_write$;
RESET ROLE;

SELECT 'ISOLATED WINTER MIGRATION SMOKE: PASSED' AS result;
