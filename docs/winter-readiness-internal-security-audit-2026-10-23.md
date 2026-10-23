# Tricks Bees 207 — Internal security audit, October 23, 2026

**Status: PARTIAL INTERNAL REVIEW — NOT INDEPENDENT SIGN-OFF OR DEPLOYMENT APPROVAL.**
Reviewed the staged Winter Readiness changes in [Draft PR #27](https://github.com/tricksbees207-ctrl/tricks-bees-207/pull/27), plus read-only Supabase Security Advisor results. This review is limited to the code and test evidence named below. No production, online Recovery Test, or Mac Recovery Lab data were changed.

## Scope reviewed

- Proposed guarded seven-table Winter migration: `database/migrations/20261021_winter_readiness_production_schema.sql`.
- Staged authenticated Winter client: `winter-readiness.html`, and its main Apiary Log iframe/session integration in `apiary-log.html`.
- Read-only private backup exporter `js/apiary-complete-backup-v3.js` and on-device ZIP verifier `js/apiary-backup-verifier-v3.js`.
- Disposable migration, Auth/REST, ZIP, and browser tests, including `tests/winter-embedded-auth.test.mjs`.
- Production and Recovery Test **Security Advisor** results (read only, October 23); no private row data retrieved.

## Findings and actions

| Priority | Item | Evidence and action | Status |
| --- | --- | --- | --- |
| Medium | In-flight authenticated reads could outlive sign-out or a hive/season switch. | Existing code cleared displayed data on `SIGNED_OUT` but did not cancel delayed UI updates. Draft `winter-readiness.html` now invalidates stale responses using session, refresh, and detail revision checks. A browser regression test deliberately resolves a delayed season read **after** sign-out and requires all state and private DOM content to remain empty. | Draft fix + passing code-check regression at `a5b221a`; latest combined CI must also pass. |
| Low–medium | Main Apiary Log loaded `supabase-js` via a floating major version (`@2`), while Winter used an exact version. | Pinned the parent to the same `@supabase/supabase-js@2.118.0` version already used by Winter, to reduce unexpected authentication-library drift. | Draft-only fix `99b6b359`; final CI/real-device compatibility check pending. |
| Medium | Production Auth Security Advisor reports **Leaked Password Protection Disabled**. | Only production advisor finding at this point; this is not evidence of a leaked password. **Supabase's official documentation says this feature is available only on the Pro Plan or above.** The user's Free plan cannot clear this warning without an upgrade; strong unique passwords plus the existing MFA protection remain appropriate no-cost safeguards. [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). | **OPEN**, no live setting changed. |
| Medium (accepted test-only design pending sign-off) | Recovery Test advisor reports five signed-in `SECURITY DEFINER` endpoints. | Three deliberately exposed test-only recovery importers and two owner+MFA-gated season close/reopen RPCs. These must remain subject to separate privilege/negative-case review and never be copied into production unintentionally. [Supabase function guidance](https://supabase.com/docs/guides/database/functions). | **OPEN REVIEW**, no hosted function altered. |
| Data-consistency caution | ZIP exporter assembles a multi-table best-effort snapshot, not an atomic database transaction. | The module rechecks receipt metadata plus Winter audit/snapshot contents, verifies original receipt byte sizes and SHA-256 hashes, and discloses the consistency limitation in README. Other tables could still change while a long download runs. | Documented limitation; fresh dedicated production data/schema/receipt backup remains a release prerequisite. |
| Scope question | `renderSpring` reads the owner's inspections for a selected colony without a `hive_id` filter; the historical close-snapshot query also checks hive ID. | For a transferred colony, this could display older inspections under the selected hive; it does **not** by itself prove cross-account access. Decide whether whole-colony history or current-hive-only history is intended before altering behavior. | **FOLLOW-UP**, no speculative behavior change. |

## Defensive checks observed in the staged migration

- All **seven** new Winter tables explicitly enable PostgreSQL RLS.
- Restrictive MFA AAL2 policies are combined with owner policies. `Winter_Seasons` accepts authenticated owner inserts but not direct client updates/deletes; other child-table writes require matching user IDs and open-season triggers.
- Audit and snapshot tables grant ordinary authenticated users only `SELECT`; privileged history sequences are not granted to ordinary clients. Snapshots block update/delete with an immutability trigger.
- Internal Winter trigger functions explicitly revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`; the two exposed privileged Close/Reopen season functions check `auth.uid()` and AAL2 and use a fixed empty search path.
- The candidate migration aborts when any Winter table already exists and excludes the Recovery Test importer.
- Browser code builds dynamic user-record displays using DOM nodes and `textContent`, not by interpolating user records into HTML.
- The public browser client contains a Supabase **publishable** key, not a service-role secret.

These are source-level observations and existing test assertions, **not proof against every authorization bypass or dependency compromise**. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verification and evidence

- Before these security edits, the six disposable CI workflows passed on `bf3ba814`.
- **All six disposable GitHub Actions workflows passed on code commit [`99b6b359`](https://github.com/tricksbees207-ctrl/tricks-bees-207/commit/99b6b359cf1a197fd5e3608fa75c48ddffc46185)**, including Apiary Log browser/code checks (with the delayed-response sign-out regression), isolated migration, native Supabase installation, real disposable Auth/REST acceptance, fictional 25-table restore, and private ZIP integrity. This does not replace manual physical-device testing.
- Full Mac-local October 21 recovery previously matched 182 archived rows, 18 downloaded receipt SHA-256 checks, 66 audit events and three snapshots. No private ZIP, credentials or receipt bytes are attached here.
- October 23 physical Samsung smoke remains **partial**; the revised code has not yet been accepted on the actual device. See [phone test status](winter-readiness-phone-acceptance.md).

## Deliberate limits and remaining release gates

- **An attempted read-only production table-permission query was declined, and a Storage policy metadata query failed.** Those portions of the live permission inventory are **NOT VERIFIED**. Do not reinterpret Security Advisor silence as proof that every production table and bucket policy is correct; no further SQL access was attempted after the decline.
- No active penetration test, real hostile-account test, third-party code audit, hosted new-schema migration, or full production backup/rollback was performed in this review.
- An assistant that helped develop the code cannot call its own review independent. This document is a transparent internal audit, not external certification.
- Keep PR #27 in DRAFT and unmerged. Still required: optional qualified second review/risk acceptance, completed safe mobile acceptance, fresh separate production data-and-receipts backup and rollback plan, and **explicit separate owner approvals** before (1) any production schema write and (2) merging/publishing the staged site.
