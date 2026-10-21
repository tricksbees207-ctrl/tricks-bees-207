-- RECOVERY TEST PROJECT ONLY. Security hardening for existing Winter trigger helpers.
-- These internal trigger functions must not be directly callable via PostgREST RPC.
-- This script does not change functions, triggers, policies, table rows, or production.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.winter_audit_changes()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.winter_guard_child_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.winter_validate_loss_link()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.winter_validate_participant_owner()
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE problems integer;
BEGIN
 SELECT COUNT(*) INTO problems
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
 AND p.proname IN ('winter_audit_changes','winter_guard_child_mutation',
                   'winter_validate_loss_link','winter_validate_participant_owner')
 AND (has_function_privilege('anon',p.oid,'EXECUTE')
   OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
 IF problems <> 0 THEN
  RAISE EXCEPTION 'Internal Winter helper RPC access not fully revoked: % functions', problems;
 END IF;
END
$verify$;
COMMIT;
