# Recurring expenses | staged implementation plan

**Status:** Option A (manual owner confirmation) approved. Implementation staged on feature/recurring-expenses-review. NO production database migration and NO main-branch deployment.

**Tested:** On October 17, 2026 the recurrence schema and updated recovery importer were applied ONLY to the existing Recovery Test Supabase project (xvthtxcinwbopoixaggv). A transactional, rolled-back simulated payment proved actual amount confirmation, calendar-aware next due date and rejection of duplicate confirmation. A SECOND rolled-back 18-table recovery rehearsal proved synthetic schedule + linked expense + receipt metadata restored together with owner mapping; a separate read-only check proved the importer blocks nonempty destinations. After rollback the test project still has 15 original expenses, 15 expense receipt rows, 3 income receipt rows and 0 recurring schedules. GitHub Actions automated tests passed for isolated DOM review/confirm/pause behavior, 17-table and 18-table ZIP verification, receipt SHA-256 integrity, and missing-table rejection. Production remains unchanged.

**Backup changes (branch only):** new full ZIP version 2 saves 18 tables (including the recurring schedule table); verifier accepts version 1 archives with 17 tables and new version 2 archives with 18 tables. The recovery lab UI and test-only import function have been updated for v2, but a complete v2 ZIP upload/download-and-restore (including actual receipt file bytes) in an empty test project has NOT yet been performed. Release blocker. A successful rolled-back database-import rehearsal is not the same as a fresh-project, complete archive restoration.

## Expected behavior
- Separate "Recurring" area inside the existing Expenses tab.
- Save a schedule for monthly, quarterly, or annual expenses: category, description, vendor, amount, payment method, optional hive, billing date, notes.
- Only one next due date per schedule is shown; overdue bills stay visible until reviewed.
- Press **Review** to see a payment summary, edit the paid date, and optionally attach a PDF/photo receipt. Press **Record expense** to approve recording.
- Recording invokes the database function to atomically append ONE historical expense to the existing expense table and advance the due date.
- A unique constraint prevents a second expense for the same schedule + due occurrence, even if two devices attempt to record simultaneously.
- An expense is NEVER automatically charged, and an unpaid reminder NEVER enters the income/expense totals.
- An already recorded expense remains unchanged if the schedule amount is later updated or paused.
- Pausing a schedule hides it from upcoming reminders without removing its historical expenses.
- No nested expense categories. Membership and web hosting charges may use Web Hosting & Subscriptions.
- Use user-local dates and a calendar-aware monthly anchor day (Jan 31 -> Feb 28/29 -> Mar 31).

## Required steps before any production release
1. Review this design and migration against existing Supabase RLS and current expense/receipt behavior.
2. Implement the UI on this branch, with receipt handling and a clear error if tables are absent.
3. Extend **complete ZIP exporter** and ZIP verifier for the recurring schedule table, maintaining compatibility with existing v1 ZIPs.
4. Extend recovery-test importer/validation to restore schedules and linked expense references with correct owner mapping. Update any legacy-JSON backup warnings.
5. Run test migrations and browser tests exclusively in an isolated database, confirm RLS isolation, duplicate protection, cancellation, failure and retry, months of different lengths, and signed-in MFA behavior.
6. Take a fresh verified full backup, obtain explicit approval, and only then migrate production and merge to main.

## Risk/backup considerations
- The October 17 ZIP does NOT contain recurring payment schedules, because this feature did not exist then.
- The October 17 successful restore covered existing app records and receipts, not this new table or function.
- Migrating schema alone does not enable the UI; incomplete migration or UI work must not be deployed.
- Do not expose any receipt PDFs, Auth tokens, or service-role keys in GitHub. Only public-safe SQL and code belong on the branch.
- Run database changes only after reviewing current schema and migration dependencies.
