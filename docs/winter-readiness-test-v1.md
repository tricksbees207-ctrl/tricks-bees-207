## October 21: Draft hive-tab integration and existing browser preview

- **Development draft:** `apiary-log.html` on PR #25 now includes the Winter tab as tenth hive section in a responsive five-column layout (two rows of five on desktop). The nine existing tabs remain, and their DOM panels are not replaced.
- The draft's Winter panel tracks the selected hive using a custom selection event, clears any previous iframe on hive changes, and loads winter records only when that tab is active. The draft *deliberately blocks* TEST iframe loading on the actual production path and is not ready for merging.
- **Existing public TEST preview:** `apiary-log-winter-test.html`, already published separately, uses the **Recovery Test** Supabase project and scoped `winter-readiness-test.html?embedded=1&hive=<id>`. The draft reuses this published preview instead of creating a competing page. User login with Recovery Test MFA is required to see private records.
- Verified by static checks: the published production `apiary-log.html` remains unchanged, the draft has all ten tabs and responsive five-column layout, the preview contains no production Supabase project ID, both implementations switch scoped hives without retaining the preceding iframe, and PR #25 remains a draft.
- **Still pending:** Owner browser acceptance test of choosing Hive 1, Winter, switching to Hive 2, and confirming hive-specific records and nine other tabs. Then perform actual production schema/permissions, normal importer and integrated backup acceptance checks; do **not** merge this test-only code into production as-is. A future production Winter component must use the production project after migrations, rather than the Recovery Test iframe.

## October 20 milestone: isolated real-ZIP restore and live receipt test

**RECORDED PASS, recovery-testing task #1 (isolated rehearsal).** The project report `Tricks_Bees_207_Recovery_Test_Result_2026-10-20.md` documents that the actual October 19 archive (SHA-256 `a74ffcd9f934975d796a92629aba7dcf7ca3ab6df19371b0097c83cf51873680`) was loaded into temporary, isolated Recovery Test tables and its records compared:
- 25 tables, all 175 archive rows matched.
- 51 reconstructed foreign-key relationship checks passed.
- Both historical winter snapshots and all 61 winter audit entries matched.
- The separate authenticated receipt-recovery page uploaded, downloaded and compared 18 receipt copies by SHA-256, then removed the temporary objects.
- The test report states that existing records and sequences were preserved. No production project was changed.

**Scope limit:** The isolated temporary-table restore did *not* call the normal `recovery_test_import_v3` application importer or exercise all of its triggers. The full importer previously passed a rollback-only 25-table SQL rehearsal, but combining a real downloaded ZIP with that exact importer in a browser remains a **separate production-release acceptance test**. Do not wipe the existing Recovery Test database to force that test. The receipt report references a successful screenshot; its detailed exported receipt-run JSON was not supplied at report time.

On October 21 a separate read-only query confirmed the Recovery Test project still held winter records (1 season, 4 participants, 40 checklists, 3 observations, 1 outcome, 66 audit events and 3 snapshots) and 18 receipt metadata rows. These are *newer* than the October 19 ZIP's two snapshots and 61 audit events, as expected after subsequent test activity.

**Decision:** Do not repeat the completed isolated ZIP recovery and receipt test. Move on to production integration planning (#2) while retaining normal-importer acceptance and security/release review as explicit gates before any production merge.

## October 19 browser test: downloaded 25-table ZIP

**PASSED in Chrome using a real TEST ZIP download and the published, local-only verifier.** The beekeeper selected their actual downloaded ZIP in `winter-backup-verify-test.html`, and its on-screen result reported **ZIP INTEGRITY PASSED: 25 tables, 175 database records, 18 receipt files, 2 historical winter snapshots**. The verifier checks local ZIP directory CRCs, receipt SHA-256 hashes, backup-record relationships, audit records and snapshots without uploading the archive or changing Supabase data.

An independent read-only Recovery Test database query confirmed 8 hives, 4 colonies, 18 receipt metadata rows, 1 winter season, 4 winter participants, 40 winter checklist items, 2 winter observations, 1 spring outcome, 61 winter audit history records and 2 snapshots. **The two winter observations were marked deleted during the browser tests but deliberately remain in the backup to preserve full history.**

The **actual downloaded ZIP and real-browser local verification** have now passed. A real ZIP **restore into an empty database** has not yet occurred. The earlier complete 25-table database import rehearsal passed using an isolated rollback-protected SQL transaction, and existing Recovery Test data must remain undisturbed until an intentional restore rehearsal is authorized.

# Winter Readiness: Recovery Test implementation (v1)

**Test project only:** `xvthtxcinwbopoixaggv` (Tricks Bees 207 Recovery Test). Production Supabase project `mkypanucvttinkjggxzv` was NOT modified.

## Included in this first build

- Seven new private tables in the Recovery Test project: `Winter_Seasons`, `Winter_Participation`, `Winter_Checklist_Items`, `Winter_Observations`, `Winter_Outcomes`, `Winter_Audit_History`, `Winter_Snapshots`.
- Row-level security: owner matching `auth.uid()` and a restrictive verified-MFA (`aal2`) policy on each table.
- Database-generated append-only audit events for inserts and updates. The client has read-only access to the audit table.
- Database checks for participant-colony ownership, immutable record associations, no direct deletion, and no edits to child records of closed seasons.
- `winter_start_season(year)` RPC: manual start, automatically selects active colonies and initializes ten standard checklist items per colony in one database transaction; never silently adds new colonies on repeated calls.
- `winter_add_colony(season_id,colony_id,include,reason)` RPC: asks the owner before including/excluding a colony registered later.
- `winter-readiness-test.html`: separate-authentication, test-only page demonstrating ten uniform hive navigation boxes (5 across on desktop), winter season startup, colony participation, expandable checklist, custom tasks, manual personal confirmation, recent supporting records, one-hive-at-a-time observations and history. This page is committed only to a review branch, **not** the published homepage.

## Smoke test performed

The Recovery Test account was simulated with a verified-MFA JWT in a **single rolled-back SQL transaction**, which exercised a real test project transaction without leaving test records.

- 1 test season
- 4 active colonies included
- 40 standard checklist entries
- 1 example observation
- 1 checklist confirmation
- 47 append-only audit events

After `ROLLBACK`, winter table record counts returned to zero. Page JavaScript syntax, ID references, and uniqueness checks passed.

## Phase 2 completed in the Recovery Test project

- Manually confirmed final spring outcomes are recorded once per participating colony through `Winter_Outcomes`. The test screen lists existing regular spring inspections (January–June) without introducing duplicate spring-assessment forms.
- Confirmed winter losses can link to an existing `Hive_Losses` record for the **same owner and colony**. The test feature never creates a duplicate loss entry.
- `winter_close_season(season_id,unresolved_reasons,notes)`: authenticated (`aal2`) owner manually closes an open season. Each unresolved included colony requires a nonblank individual explanation. An atomic, immutable, by-value snapshot captures participation, checklist, observations, outcomes, linked loss records, spring inspection records and recent support records.
- `winter_reopen_season(season_id,reason)`: verified owner reopens only a closed season with a mandatory reason. A later closure saves a **new snapshot version**, preserving the previous one.
- New database guards prevent child-record writes to closed seasons, forbid direct season editing, and preserve snapshot immutability.
- The test screen shows frozen historical data from its saved snapshot when a season is closed, not a live query for subsequently edited inspection data.
- **All five test-project migrations have been archived as SQL under `docs/winter-readiness-test-migrations/` in execution order.** They are historical test migrations and need review/consolidation before any future production migration.

### Phase 2 rollback smoke tests

All tests below ran against the **separate Recovery Test project** inside transactions rolled back afterward:

- Closing with unresolved outcomes but without per-colony explanations was blocked.
- Closed-season checklist edits were blocked.
- Ordinary authenticated-account attempts to edit immutable snapshots or directly reopen a closed season were denied (including zero-row updates).
- Manually reopened and reclosed seasons produced **two snapshot versions**. Snapshot 1 retained `not_checked`, while snapshot 2 correctly showed the later `complete` status.
- Test change history recorded the operations. No real winter seasons or checklist entries remain after rollback.
- Test page JavaScript parsing and internal DOM ID-reference checks passed. **Full browser login/MFA and interaction testing has not yet been performed.**

## Phase 3 staged: winter archive v3 / backup recovery

- The existing live ZIP format remains **unchanged**. The 25-table exporter is isolated as `js/apiary-complete-backup-v3-test.js`, and its verifier as `js/apiary-backup-verifier-v3-test.js`. The original live exporter and verifier remain identical to `main`.
- V3 archives use manifest version **3** and data version **4** and include all **25 tables** (18 existing + 7 winter tables), plus receipt files and SHA-256 hashes. The isolated verifier also accepts legacy manifest versions **1 and 2**.
- The winter prototype provides a TEST-only ZIP download. The Recovery Test Lab in this draft uses the isolated v3 verifier and selects the atomic `recovery_test_import_v3` function for v3 backups, without disrupting legacy restore support.
- The new test-only importer combines the existing 18-table import and the seven winter tables in one database transaction. It preserves original IDs, full audit events and historical snapshots, and remaps nested owner IDs to the destination test account.
- All six database migrations are archived in `docs/winter-readiness-test-migrations/`.
- A rollback-only winter data round trip verified **exact JSONB equality across all seven winter tables**, including audit entries and immutable snapshots. Post-test winter row counts remained zero.
- **Full 25-table SQL import rehearsal PASSED on October 19, 2026:** existing Recovery Test records plus temporary Winter Readiness fixtures were archived in a rollback-protected transaction; all 25 tables were temporarily emptied, the exact `recovery_test_import_v3` preview and apply functions ran, and **161 restored rows matched the archived JSONB record-for-record across all 25 tables**. The inner transaction was rolled back and all original public ID sequence counters were restored. An independent subsequent query confirmed the original 8 hive, 4 colony, 4 inspection, 15 expense, 3 income, and 18 receipt metadata records remained, with all seven Winter Readiness tables empty. **This is a database import rehearsal, not yet a real browser ZIP import.**
- No production database, production backup module, live website, or camera process has been modified.

### Remaining release gate

Do not merge draft PR #25 or switch the live exporter until the real-browser ZIP download, integrity verification, MFA login and recovery workflow pass acceptance testing. The transactional 25-table database import was verified in the existing Recovery Test project; a separate new billable project is not required for that SQL rehearsal.
## Recovery QA: additional automated and rollback tests

- A fresh, empty Supabase development branch does **not** exist. We deliberately did not remove recovered records from the existing Recovery Test project or create a potentially billable Supabase project or branch.
- The existing 25-table importer passed four safe rejection checks: rejects missing required tables, refuses a preview against an already-populated recovery database, refuses overwrite during apply, and denies MFA level `aal1`. Each database test used a rolled-back transaction.
- Winter-only recovery tested restoring data from a synthetic **different owner UUID** back to the Recovery Test owner. Every one of the seven winter tables, including the complete audit trail and frozen season snapshot, matched the original JSONB data exactly. Its temporary test privilege was rolled back.
- The actual draft v3 ZIP verifier passed nine **synthetic ZIP** validation tests, including accepting valid v1/v2/v3 archives, rejecting duplicate winter colony records, inconsistent historical snapshots, missing tables, mismatched owner links and tampered CRC contents.
- The actual draft v3 ZIP exporter was exercised together with the real v3 verifier, using mocked browser APIs, synthetic records and a synthetic receipt. **25 tables, 11 sample records, 1 attached receipt, ZIP checksums and SHA-256 integrity all passed.** No real apiary data was used.
- An automated Node.js regression suite is staged at `tests/winter-archive-v3.test.mjs`, with test fixtures for the three backup versions, winter constraints, ZIP CRC and one receipt SHA-256. It remains to be executed in a Node-capable runner; the equivalent core verifier/exporter integration tests were run in an isolated JavaScript environment.
- Post-test audit: all test winter tables are empty and the winter owner-remapping helper is not executable directly by ordinary authenticated users.

### Still pending

**Final release blocker:** real-browser MFA and interface acceptance tests, plus actual 25-table ZIP download and import verification. An exact 25-table database restore was validated inside a rollback-protected transaction, with the existing recovered data preserved. This is not yet certified as a real ZIP-based recovery. No additional billable Supabase project or branch has been created.
## Important next work before production

1. Browser login + MFA walkthrough using Recovery Test account, then manually test a full winter observation correction.
2. Browser-test owner-confirmed final spring outcomes and existing Loss Log links without duplicating regular spring inspections.
3. Browser-test closure, reopening, history and snapshot rendering on a test account, including the required unresolved explanations.
4. Browser-test the isolated v3 ZIP exporter and verifier, then complete a real ZIP-based Recovery Test import under a rollback-safe or separately authorized empty destination. The 25-table SQL import rehearsal is passed.
5. Rehearse permissions with other users/aal1, test exclusion and later-added colony workflows, retire/transfer cases.
6. Integrate the Winter section into the actual Apiary Log only after test approval, with five equal-width navigation boxes per row on desktop. Existing uniform styling proposal PR #24 remains separate.

No automatic reminders, photo storage, separate spring inspection forms, or automatic checkbox confirmations.
