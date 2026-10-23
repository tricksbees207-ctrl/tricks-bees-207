# Winter Readiness production migration: independent security review handoff

**Review status: REQUESTED, NOT APPROVED.** This checklist is an engineering handoff, not an independent reviewer sign-off. No production SQL or deployment is authorized by this document.

**Scope:** Proposed production migration `database/migrations/20261021_winter_readiness_production_schema.sql`, staged `winter-readiness.html`, staged Apiary Log hive-tab integration and related isolated tests in Draft PR #27.

## Context and boundaries

- The migration is intended to add **seven** Winter Readiness tables, supporting functions, triggers, grants and row-level security to the existing **19-table** production application. Production has not received these Winter objects.
- The actual private October 21 backup has separately passed full restoration into an isolated **Mac-local Supabase stack**, preserving all **182 rows across 25 archived tables**, **66 audit events**, **three historic snapshots**, and **18 privately stored receipt files**, each downloaded and SHA-256 matched. **The backup must not be attached to this PR, copied into CI, or sent to a reviewer unless the owner independently authorizes a secure transfer.**
- The online Recovery Test already contains data, and production remains populated. **Never overwrite, reset or reuse either project for testing.**
- The migration excludes the **test-only** `recovery_test_import_v3` RPC. Under no circumstances include that importer in production.
- GitHub Actions use disposable environments and fictional fixtures, not private records. A successful synthetic test does **not** establish production readiness.

## Requested independent reviewer checks

Mark each item explicitly PASS, FAIL or NEEDS FOLLOW-UP and reference migration line numbers, tests and findings.

1. **SECURITY DEFINER review:** Inspect `winter_close_season`, `winter_reopen_season`, `winter_audit_changes`, `winter_guard_child_mutation`, `winter_validate_loss_link` and `winter_validate_participant_owner` for ownership bypass, table privileges, RLS bypass, function ownership, caller identity and search-path hazards. Both exposed season RPCs use `auth.uid()` and AAL2/MFA gates and fixed search paths, but the review should test whether all code paths are truly safe.
2. **Owner and MFA boundaries:** Verify direct table reads/writes and all four callable RPCs deny anonymous/AAL1 and cross-account requests, including `INSERT`, `UPDATE`, negative/null inputs and concurrency. Treat JWT AAL2 as an authenticated assertion rather than trusting a client-supplied user ID.
3. **Audit and snapshot integrity:** Verify direct client DML is revoked for `Winter_Audit_History` and `Winter_Snapshots`; the snapshot UPDATE/DELETE guard works; snapshot versions are immutable after reopen/closure; legacy table references and nested JSON cannot pull another hive/owner's data; and the audit trigger captures authorized mutations, without silently losing earlier history.
4. **Database constraints and direct-REST parity:** Confirm composite owner foreign keys and parent/child references; winter participation constraints including the new nonblank exclusion reason check; reject `NULL` include/exclude choices at the RPC boundary; validate closed-season mutation rejection and non-empty close/reopen reasons.
5. **Least-privilege grants:** Inspect default schema/table/sequence privileges under native Supabase and confirm only the intended public API RPCs remain callable by the `authenticated` role; helper trigger functions cannot be invoked directly; `anon` cannot access Winter tables/functions; history sequences are not advanced by ordinary accounts. RLS policy semantics must match actual table grants.
6. **Concurrency and business logic:** Review concurrent season start/add/close/reopen, `FOR UPDATE` and advisory locks where needed, idempotent paths, duplicate snapshots, time boundaries, and handling of imported/historical closed seasons.
7. **Migration and rollback:** Confirm dry-run migration on a fresh Supabase stack with the true 19-table schema, non-destructive deployment to existing production rows, a *schema-only* rollback strategy that never erases Winter history, and that data/receipts are freshly backed up and checked before deployment.
8. **Storage and session integration:** Confirm receipt Storage policies and bucket isolation are not altered by the migration, and that embedded hive tabs and standalone Winter Readiness obey the same AAL2 account context, sign-out cleanup, and no cross-hive data access.
9. **Residual advisories:** Explicitly document risk acceptance or required fixes for privileged client RPCs and the existing authentication leaked-password-protection warning, rather than declaring all warnings cleared.

## Verified internal evidence (not independent approval)

- [Isolated PostgreSQL migration and regression checks](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39686968746) **PASS**, including direct exclusion without an explanation blocked, `NULL` include/exclude RPC rejected, AAL1/cross-owner blocks, and snapshot immutability.
- [Fresh native Supabase installation rehearsal](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39686968767) **PASS**.
- [Real local Supabase Auth/MFA and REST plus embedded browser acceptance](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39686968811) **PASS**.
- [Disposable 25-table recovery rehearsal](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39686968826) **PASS**, fictional records only.
- [Apiary Log code checks](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39686968772) **PASS**.
- [Backup ZIP integrity CI](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39686968867) **PASS**, no private ZIP.
- Owner-observed **October 21 actual local recovery audit:** full 182-row content comparison, 18 receipt SHA-256 downloads, private buckets, 66 audit events, three snapshots and repeat-import rejection **PASS**. This is a hands-on local restore, not production deployment validation.

## Required reviewer disposition

Reviewer should give their independent identity/affiliation or reviewer handle, date, reviewed commit hash, and clear **APPROVED / CHANGES REQUIRED / NOT REVIEWED** disposition, with specific issues and re-test evidence. Do **not** tick the independent-review release blocker on the basis of this handoff or model-generated checks alone.

**Other outstanding gates:** hosted/manual phone accessibility and sign-out across windows; real hosted configuration where safe; fresh production data-and-receipts backup; explicit separate owner approvals for (1) production schema changes and (2) merging/publishing Draft PR #27.

**Safety rule:** Keep PR #27 in DRAFT and do not change production or the populated online Recovery Test until each gate is separately met.

## October 23 security-review handoff addendum

**Review baseline:** [commit `bf3ba8140503f6485b7d714e420357cb0b3525a1`](https://github.com/tricksbees207-ctrl/tricks-bees-207/commit/bf3ba8140503f6485b7d714e420357cb0b3525a1), with six passing disposable CI workflows. The reviewer must state the exact PR commit reviewed and recheck any later code changes. No independent reviewer or submitted review was listed on PR #27 when this packet was checked.

**Latest successful workflow runs:**

- [Code and browser checks](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39962662162)
- [Isolated PostgreSQL migration](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39962662013)
- [Native disposable Supabase installation](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39962661990)
- [Disposable Supabase Auth and REST](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39962662170)
- [Fictional 25-table recovery](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39962662037)
- [Backup ZIP integrity](https://github.com/tricksbees207-ctrl/tricks-bees-207/actions/runs/39962662054)

**Phone evidence:** The owner's October 23 Samsung USB test passed four hive-specific Winter views, Feedings-to-Winter navigation and signout/Back privacy behavior in the Mac-local Recovery Lab. The [P01–P11 device plan](winter-readiness-phone-acceptance.md) is only partially complete; Android accessibility, remaining cases and retesting the corrected short historical-version label remain open.

**Requested reviewer reply:** For each of the nine sections above, mark PASS / FAIL / NEEDS FOLLOW-UP, cite code lines and any negative tests, identify blocking findings and retest criteria, and end with APPROVED / CHANGES REQUIRED / NOT REVIEWED. Record reviewer handle, date and reviewed commit. Do not attach credentials, tokens, receipts or private ZIP files.

This addendum is documentation only. It neither grants security approval nor authorizes a production migration or merge.
