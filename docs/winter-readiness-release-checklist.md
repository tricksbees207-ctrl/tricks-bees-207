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
- [x] **Real local Supabase Auth + PostgREST acceptance PASSED**: a dedicated disposable GitHub runner started actual GoTrue and REST services, created two synthetic email users, verified real TOTP challenges and AAL2 tokens, blocked anonymous and AAL1 read/write, rejected cross-account season closure, created 10 checklist items, and preserved a read-only closure snapshot. All live secrets, user accounts, hosted projects and production records were excluded. [Successful run](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39668172652).
- [x] **Actual staged Apiary Log + embedded Winter browser acceptance PASSED** in Chrome against a disposable local Supabase GoTrue/PostgREST stack, using a real password + six-digit TOTP MFA sign-in. The iframe inherited the AAL2 session, showed the owner's scoped colony in Hive 1, excluded it on Hive 2, and was unloaded on sign-out. The runner served temporary in-memory copies pointing ONLY to the local API and blocked non-local requests. [Successful GitHub Actions run](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39669575979).
- [x] **Clean-destination 25-table Winter restore importer PASSED** in an isolated PostgreSQL database with a complete production-shaped empty table fixture. Verified preview did not write, malformed foreign-key archive rolled back atomically, valid fictional archive preserved original IDs/closed-season status/immutable snapshot/audit history, and repeated restores were rejected. This exercise executes the actual v3 importer SQL but is **not** a restore from a real private ZIP or a test of stored receipt bytes. [Successful run](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39670795230).
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
- [ ] Complete **remaining hosted-environment and manual device acceptance**: the real Chrome parent/iframe/MFA/hive-switching test now passes locally, but hosted configuration and physical-phone usability, accessibility and private ZIP downloads still need review. Hosted branching is unavailable on the current plan; no paid branch was created.
- [ ] Confirm the **actual private 25-table ZIP and original receipt bytes** restore successfully in an empty isolated destination, with matching SHA-256 checks. The synthetic 25-table importer preview, rollback and full-record restoration are now tested in CI; no real private ZIP or receipt storage was read or copied. Do not restore into production or overwrite populated Recovery Test records.
- [ ] **Additional cross-tab and real-device checks** remain: automatic sign-out propagation between simultaneous open windows, interactive mobile usability, a real hosted session if safely available, closed-season history presentation, and download/restore of a real private 25-table ZIP. The basic same-origin parent/embedded browser MFA session flow is now tested successfully using real local Auth and REST services.
- [ ] Obtain explicit owner approval before **executing production schema changes**. Take/verify a fresh separate production data-and-receipts backup, and document safe rollback of a schema deployment before applying it.
- [ ] Only after above, separately obtain explicit owner approval before **merging** Draft PR #27 and publishing. Verify production data counts, alerts and receipt scheduler after deployment.

## Production safety rules

- No live records are copied to the disposable GitHub fixture.
- Never run Recovery Test importer or owner-remapping routines in the production project.
- Never delete historical snapshots or audit data to make a rollback work.
- Never put production receipts, private ZIPs, passwords, OTPs or secret/service-role keys in GitHub.
- Keep Draft PR #27 unmerged until every release blocker is satisfied.
