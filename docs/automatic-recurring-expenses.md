# Automatic expenses: checkbox workflow (development)

**User-requested behavior:** In **Apiary Expense Tracking**, **Repeat this expense automatically** is unchecked by default. Checking it reveals Monthly, Quarterly, and Yearly. The current expense is saved **once**, with its optional current receipt. Future occurrences are written to Expense History by Supabase Cron every day at 12:00 UTC (7/8 AM Maine time). There is **no reminder or second approval**.

- Automatic records reflect the planned billing amount and date, **not verified external charges**. No card, bank account or payment processor is charged.
- Future entries have no copied receipts; a receipt can be attached normally using Expense History.
- The original purchase date anchors the billing day. End-of-month dates roll naturally. A backdated original purchase starts with the next future due date and does not post fictional historical expenses.
- A unique constraint on `(recurring_template_id, recurring_due_date)` prevents duplicates after cron retries.
- A small **Automatic Expenses** list after Expense History permits Pause or Resume. The previous duplicate scheduling form and manual review UI have been removed.
- An existing linked expense remains linked to its schedule. Unchecking **Repeat this expense automatically** while editing one of those expenses pauses it, but existing financial history is not deleted.
- Existing review-first schedules remain flagged as `automatic_posting=false` and are **not** posted by the background worker.
- Saving an expense and enabling its schedule are separate operations. If enabling fails, the expense remains saved with its ID and the page explicitly warns not to save it again. Editing the saved expense can retry enrollment safely.
- A full backup includes the existing 18 tables and all schedule rows. To restore onto fresh infrastructure, recreate the table/schema and install Supabase Cron from `database/migrations/20261018_automatic_recurring_schedule.sql`; the backup ZIP does not include cron configuration.
- Supabase Cron is the Free-plan database scheduler; this feature does not depend on the user's Mac, OBS, or any website visit.

## Tested

- **Recovery Test project** migrated for development and SQL transaction rehearsal passed: original expense linked without duplication, one due occurrence created, second run creates no duplicate, pause prevents later posting, anchored 31st/leap-day monthly/quarterly/yearly date arithmetic.
- After `ROLLBACK`, original 16 Recovery Test expenses and one manual schedule were intact.
- Unprivileged `authenticated` and `anon` roles cannot execute the privileged posting worker.
- `pg_cron` installed and a disposable cron job was created and unscheduled inside a rolled-back test transaction.
- Headless Chrome, jsdom and backup tests run in GitHub Actions. Development and production remain separate until user approval for deployment.

## Deployment sequence

1. Ensure full current backup available and CI passes.
2. Apply `database/migrations/20261018_automatic_recurring_core.sql` to production (schema only, no automatic schedules yet).
3. Apply `database/migrations/20261018_automatic_recurring_schedule.sql` to production, validate the named daily cron job.
4. Merge the production website change and verify GitHub Pages and expense counts.
5. Confirm the live checkbox and frequency selector in a signed-in browser **without saving a test expense**.
