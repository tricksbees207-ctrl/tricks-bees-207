-- MANUAL PHASE 2 ONLY. DO NOT RUN DURING DEPLOYMENT.
-- Tricks Bees 207: enforce authenticator MFA in database RLS.
-- Prerequisites:
-- 1. Deploy and verify the MFA-enabled Apiary Log on the official domain.
-- 2. Owner enrolls a NEW TOTP factor on the official domain, verifies it,
--    signs out, signs back in and completes the 6-digit challenge.
-- 3. Confirm recovery access to Supabase dashboard before activation.
-- 4. Run this SQL manually in Supabase SQL Editor, only after owner approval.
-- This script does not modify data. It does change access permissions.
-- If the authenticator is lost, owner may be locked out of the Apiary Log
-- until the factor is recovered or these policies are removed by an admin.
BEGIN;
DO $mfa$
DECLARE
  t text;
  private_tables text[] := ARRAY[
    'Hives', 'Hive_Inspections', 'Apiary_Activities', 'Hive_Profiles',
    'Hive_Feedings', 'Hive_Treatments', 'Hive_Harvests',
    'Hive_Queen_Replacements', 'Hive_Splits', 'Hive_Losses',
    'Apiary_Expenses', 'Apiary_Income', 'Hive_Colonies',
    'Colony_Transfers', 'varroa_watch_results'
  ];
  policy_name constant text := 'Require verified authenticator MFA';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.mfa_factors
    WHERE user_id = '95fb5a87-0ded-44e5-8f8d-2632ab7d3f58'::uuid
      AND factor_type::text = 'totp'
      AND status::text = 'verified'
  ) THEN
    RAISE EXCEPTION 'STOP: owner has not verified a TOTP authenticator. No MFA policies installed.';
  END IF;

  FOREACH t IN ARRAY private_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'STOP: expected table public.% missing', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select auth.jwt() ->> ''aal'') = ''aal2'') WITH CHECK ((select auth.jwt() ->> ''aal'') = ''aal2'')',
        policy_name, t
      );
    END IF;
  END LOOP;
END
$mfa$;
COMMIT;

-- RECOVERY (MANUAL ONLY): An administrator can remove these MFA gates
-- without deleting hive data. Use only after identity verification.
-- DO $rollback$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'Hives','Hive_Inspections','Apiary_Activities','Hive_Profiles',
--     'Hive_Feedings','Hive_Treatments','Hive_Harvests',
--     'Hive_Queen_Replacements','Hive_Splits','Hive_Losses',
--     'Apiary_Expenses','Apiary_Income','Hive_Colonies',
--     'Colony_Transfers','varroa_watch_results'
--   ] LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
--       'Require verified authenticator MFA', t);
--   END LOOP;
-- END $rollback$;
--
-- Note: public anonymous SELECT access to varroa_watch_results remains
-- governed by its existing separate anon policy; this gate is for
-- authenticated sessions only.
