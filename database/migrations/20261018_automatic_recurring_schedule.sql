-- Enable server-side automatic expense posting once the core schema is installed.
-- One daily check at 12:00 UTC (7am EST / 8am EDT).
-- Supabase Cron runs in the database, independent of the Mac or website browser.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
  'tricks-bees207-auto-expenses-daily',
  '0 12 * * *',
  'SELECT public.post_due_auto_recurring_expenses();'
);
