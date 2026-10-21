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

SELECT 'ISOLATED WINTER MIGRATION SMOKE: PASSED' AS result;
