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

## Important next work before production

1. Browser login + MFA walkthrough using Recovery Test account, then manually test a full winter observation correction.
2. Build owner-confirmed final spring outcomes using the *existing* regular spring inspections, linking to the existing Loss Log.
3. Implement manual close/reopen operations as atomic, audited database functions producing immutable versioned historical snapshots; prevent any future-season data from altering older snapshots.
4. Add all winter tables to **both** complete backup ZIP/JSON, backup verifier, Recovery Test restore process, and related scripts; test restoring complete winter data.
5. Rehearse permissions with other users/aal1, test exclusion and later-added colony workflows, retire/transfer cases.
6. Integrate the Winter section into the actual Apiary Log only after test approval, with five equal-width navigation boxes per row on desktop. Existing uniform styling proposal PR #24 remains separate.

No automatic reminders, photo storage, separate spring inspection forms, or automatic checkbox confirmations.
