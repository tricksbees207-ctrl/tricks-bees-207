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
- The complete **browser-generated ZIP and full clean-project 25-table restore** remain untested. The current Recovery Test database already contains restored apiary records, and the importer correctly refuses to overwrite them.
- No production database, production backup module, live website, or camera process has been modified.

### Remaining release gate

Do not merge draft PR #25 or switch the live exporter until a fresh empty isolated recovery target passes a complete 25-table ZIP export, verification and restore, including unchanged handling of the legacy backups.
## Important next work before production

1. Browser login + MFA walkthrough using Recovery Test account, then manually test a full winter observation correction.
2. Browser-test owner-confirmed final spring outcomes and existing Loss Log links without duplicating regular spring inspections.
3. Browser-test closure, reopening, history and snapshot rendering on a test account, including the required unresolved explanations.
4. Verify the isolated v3 exporter and verifier in a browser, then certify complete 25-table import into an empty Recovery Test destination before changing production backup or restore.
5. Rehearse permissions with other users/aal1, test exclusion and later-added colony workflows, retire/transfer cases.
6. Integrate the Winter section into the actual Apiary Log only after test approval, with five equal-width navigation boxes per row on desktop. Existing uniform styling proposal PR #24 remains separate.

No automatic reminders, photo storage, separate spring inspection forms, or automatic checkbox confirmations.
