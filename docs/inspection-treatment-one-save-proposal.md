# Proposal: one-save treatment entry from Hive Inspections (draft, not deployed)

Status: design approved for a test implementation on 2026-10-24; **no production database migration or website publication is authorized by this draft**.

## Current behavior (verified against `apiary-log.html` and production schema)

- In the regular Hive Inspection form, `treatmentAppliedCheck` only writes `Hive_Inspections.treatment_applied` as a note.
- Actual treatment records are stored in `Hive_Treatments` with the treatment date, product, application details, follow-up date, notes, hive, colony and owner.
- Editing an inspection preserves historical follow-up fields but currently has no relationship to individual treatment rows.
- `Hive_Inspections` and `Hive_Treatments` have owner and/or verified-MFA RLS protections. Keep those policies intact.

## Desired interaction

1. The Treatment Applied checkbox defaults to unchecked; fields remain hidden and disabled.
2. Checking it expands a small treatment section within the inspection form: Treatment Date (defaulting to inspection date), Product/Treatment (required), Dose/Application Details, Follow-up Date and optional Notes.
3. One Save Inspection action saves the inspection and, when checked, the full treatment. An error saves **neither**, with a visible explanation and user input preserved for correction.
4. A linked treatment also appears in the existing Treatments log, including follow-up reminders and reporting.
5. Editing a previously linked inspection shows its treatment details and updates that **same linked treatment** (no duplicates).
6. Unchecking a previously linked treatment must **not silently delete** a historical treatment; display an explicit explanation and preserve the record in Treatments until deliberately edited/deleted there.
7. Legacy inspection treatment text remains readable and unchanged. Editing a legacy inspection must not silently generate a duplicate treatment when no source linkage exists.
8. Existing inspection-only saves, CSV/history exports, public Varroa Watch sync, and hive/colony attribution remain working.
9. Mobile inputs are single-column and touch-friendly; button labels and success/error states are unambiguous.

## Safe data model and execution plan

- Use the existing `Hive_Treatments` table as the only authoritative treatment log.
- Propose a nullable `Hive_Treatments.inspection_id` foreign key to `Hive_Inspections.id`, with a unique constraint/index for one treatment per inspection. Preserve historical independent treatment records with null `inspection_id`.
- On inspection deletion, do **not** delete applied treatment records. Prefer `ON DELETE SET NULL` and verify treatment history survives.
- Prefer one PostgreSQL transaction exposed through a narrowly scoped `SECURITY INVOKER` database function using explicit column allowlists, `auth.uid()` for treatment ownership and existing RLS + verified MFA. Do not expose the service-role key in browser code or bypass RLS. Restrict RPC execution to authenticated role.
- The function must reject a missing product, invalid dates, unowned/mismatched hive or inspection records, and a conflicting treatment linkage. Use one insert/update transaction; rely on the database to roll back on any failure.
- Save a link once, then update by that link on later edits (idempotent editing).
- Existing history/editor functions must recognize both independent and inspection-linked treatment records without duplicating display or changing unrelated data.
- Create the actual Supabase migration with the Supabase CLI before committing migration SQL, as required by the project workflow. Do **not** apply it to production until approved.

## Acceptance tests in a separate test environment

- Unchecked: inspection saves exactly one inspection and zero new treatments.
- Checked: one click saves exactly one inspection and exactly one linked treatment, with correct hive, colony and date.
- Missing treatment product: neither record is written, input preserved.
- Simulated treatment insert failure: inspection insert rolled back.
- Edit a linked inspection twice: one treatment row is updated, never duplicated.
- Edit an old inspection that contains legacy treatment text: original text remains and no duplicate treatment appears.
- Delete the inspection: independent treatment history is retained.
- Follow-up reminder and treatment-history views show linked treatment; public Varroa Watch behavior unchanged.
- Wrong user / session without MFA: database rejects write.
- Phone-width form: collapses cleanly; hidden fields are not keyboard-focusable.
- Backup export and verification still work with the additional nullable linkage column.

## Release gate

1. Confirm the UI layout and schema design with Trick.
2. Back up production data and check current repo/DB alignment.
3. Implement and test against local Supabase/recovery lab, keeping production untouched.
4. Open a draft PR for code review and run automated tests.
5. Ask for separate explicit approval before any live migration, merge or deployment.
6. After deployment, verify unchanged historic inspection/treatment counts and run new save/edit/rollback smoke tests.
