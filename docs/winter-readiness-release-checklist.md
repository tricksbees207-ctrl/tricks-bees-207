# Winter Readiness: deployment readiness checklist

**Status:** REVIEW ONLY. Draft pull request #27 must not be merged until all remaining gates pass.
**Prepared:** October 21, 2026. **Production data and schema:** unchanged.

## Completed and verified

- [x] Stage exactly ten hive tabs, with Winter selected from the current hive.
- [x] Verify the ten-tab DOM in GitHub CI, plus a **no-network headless Chrome** test at 1200px desktop and 420px mobile widths: 5/2 grid columns, scoped Winter iframe URLs, switching hives, Feedings tab return, and signed-out link clearing. Synthetic hive selection only; no real account or Supabase sign-in.
- [x] Produce a guarded, transactional production Winter migration for seven tables, 70 columns, 49 constraints, nine functions, 12 triggers and 15 ownership/MFA RLS policies.
- [x] Test SQL installation and season start/close/reopen against a disposable PostgreSQL fixture using the real definitions of all 19 production application tables (no production data copied).
- [x] **Fresh local Supabase installation rehearsal PASSED in GitHub Actions** using pinned Supabase CLI 2.84.2: native `auth.users`, `auth.uid()`, `auth.jwt()`, roles and actual default privileges, with a temporary runner database and the production-derived 19-table fixture (no live rows). Migration applied successfully; negative MFA/owner checks, snapshot preservation, history matching and table/RLS catalog tests all passed. Temporary database stopped. [Workflow result](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39666429162).
- [x] The first native Supabase rehearsal detected its **default table/sequence grants**, which differ from the simplified Postgres fixture. Updated all seven Winter table and sequence blocks to revoke `PUBLIC`, `anon` and `authenticated` defaults before granting only required access. Fresh rerun PASSED.
- [x] Exercise snapshot immutability, two closure versions, internal function grants, caller/owner boundaries, and AAL1/AAL2 restrictions in disposable CI.
- [x] Verify separate **existing** Supabase Recovery Test has all seven Winter tables with RLS and intact 1 season, 4 participation records, 3 snapshots, and 66 audit entries.
- [x] Perform manual migration defense-in-depth review of Winter snapshot reads: hive and colony must agree for inspections, feedings, treatments, and linked loss records. The disposable PostgreSQL fixture deliberately creates wrong-hive rows sharing a colony ID; historic season closure excludes them and preserves the matching rows.
- [x] Restrict ID-sequence grants for Winter_Audit_History and Winter_Snapshots to service-role only. The disposable database now asserts ordinary authenticated users cannot select or advance those sequences.
- [x] Inspect **production source-table policy metadata read-only**: all six referenced Hive/Hives tables have RLS enabled, with separate restrictive MFA policies; owner's read/write policies remain in place. No production policy changed.
- [x] Verify owner AAL2 sees Recovery Test history; AAL1 and unrelated AAL2 users see none (read-only simulated JWT context).
- [x] Revoke direct anonymous/authenticated EXECUTE from four internal Recovery Test Winter trigger helpers; verify all 11 trigger attachments remain and the four related advisor warnings disappear.
- [x] Independently test, in READ-ONLY/ROLLBACK transactions, that all three test-only importers reject an unrelated AAL2 account and reject the legitimate owner at AAL1.
- [x] Run backup ZIP integrity and staged application checks with GitHub Actions.
- [x] Test the embedded Winter page's shared-session sign-out behavior in a no-network Chrome fixture: duplicate navigation hidden, private ZIP gated before login, external SIGNED_OUT event clears cached winter records, and the embedded Sign Out control clears them too.
- [x] Verify **two synthetic hives** in Chrome: individual Winter tab lists only selected hive's colony, refuses cross-hive colony selection, shows hive-specific included/excluded counts, and hides all-apiary Start/Close/Reopen controls. Whole-apiary ZIP backup is also hidden within the single-hive view, with access retained on the standalone administration page.
- [x] Include the Winter HTML JavaScript module in the CI syntax checks to catch errors before browser testing.

## Intentional remaining Recovery Test advisories

These are **not cleared warnings** and must stay documented:

- `public.recovery_test_import`, `public.recovery_test_import_v3`, `public.recovery_test_import_winter`: `SECURITY DEFINER` test-only restore RPCs, permitted to signed-in callers, guarded internally by the confirmed test-owner allowlist and AAL2/MFA, and configured not to overwrite existing populated tables. Revoking authenticated EXECUTE would disable the Recovery Test restore UI. Do not copy them into production.
- `public.winter_close_season`, `public.winter_reopen_season`: guarded `SECURITY DEFINER` endpoints needed by the Winter UI to transition seasons and preserve snapshots. They demand owner/MFA checks. A standard Supabase advisor flags the privileged execution despite these internal gates; review their bodies and explicitly accept any residual risk.
- **Leaked password protection disabled**: Supabase Authentication account setting warning. Not caused by the Winter migration and not remediated in this change. Review in dashboard before public rollout. [Supabase password documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Release blockers

- [ ] Obtain an independent review of `database/migrations/20261021_winter_readiness_production_schema.sql` including SECURITY DEFINER bodies, permissions, audit immutability, and trigger behavior.
- [ ] Complete **hosted Supabase Auth/API and signed-in browser acceptance** (true JWT/MFA flow, PostgREST and session sharing, any Supabase-hosted environment differences). The clean local Supabase **database** installation rehearsal now passes; hosted branching remains unavailable on this plan, so no paid branch was created.
- [ ] Confirm Recovery Test's full 25-table ZIP restore workflow from a verified user-held archive in another empty isolated destination before changing the production backup exporter. Do not restore into production or overwrite populated test records.
- [ ] **Manual real-device and signed-in Supabase acceptance** remains: real account MFA/session refresh, true cross-tab authentication broadcast, iframe authentication, hive ownership, mobile usability, closed-season history and verified ZIP downloads. Synthetic Chrome tests prove the DOM and callback behavior, not an authenticated production session.
- [ ] Obtain explicit owner approval before **executing production schema changes**. Take/verify a fresh separate production data-and-receipts backup, and document safe rollback of a schema deployment before applying it.
- [ ] Only after above, separately obtain explicit owner approval before **merging** Draft PR #27 and publishing. Verify production data counts, alerts and receipt scheduler after deployment.

## Production safety rules

- No live records are copied to the disposable GitHub fixture.
- Never run Recovery Test importer or owner-remapping routines in the production project.
- Never delete historical snapshots or audit data to make a rollback work.
- Never put production receipts, private ZIPs, passwords, OTPs or secret/service-role keys in GitHub.
- Keep Draft PR #27 unmerged until every release blocker is satisfied.
