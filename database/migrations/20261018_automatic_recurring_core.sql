-- Review-independent automatic recurring expenses. Applied first in Recovery Test.
-- Daily scheduler installed separately after tests and explicit production release.
-- Existing manual-review schedules remain manual (automatic_posting defaults FALSE).
BEGIN;
ALTER TABLE public."Apiary_Recurring_Expenses"
  ADD COLUMN automatic_posting boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_recurring_next_due(
  p_anchor date, p_previous_due date, p_frequency text
) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_months integer;
  v_first date;
  v_last date;
BEGIN
  IF p_anchor IS NULL OR p_previous_due IS NULL
     OR p_frequency NOT IN ('monthly','quarterly','yearly') THEN
    RAISE EXCEPTION 'Invalid recurring date or frequency';
  END IF;
  v_months := CASE p_frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END;
  v_first := (date_trunc('month',p_previous_due::timestamp)
    + make_interval(months => v_months))::date;
  v_last := (v_first + interval '1 month - 1 day')::date;
  RETURN v_first + (LEAST(
    EXTRACT(day FROM p_anchor)::integer,
    EXTRACT(day FROM v_last)::integer
  ) - 1);
END
$$;

-- Links a recorded expense to a new auto-posting schedule atomically.
-- Never charges a bank/card or posts a second copy of the initial expense.
CREATE OR REPLACE FUNCTION public.enable_auto_recurring_expense(
  p_expense_id bigint, p_frequency text
) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_expense public."Apiary_Expenses"%ROWTYPE;
  v_existing public."Apiary_Recurring_Expenses"%ROWTYPE;
  v_schedule_id bigint;
  v_next date;
  v_local_today date := (now() AT TIME ZONE 'America/New_York')::date;
  v_iterations integer := 0;
BEGIN
  IF auth.uid() IS NULL OR p_frequency NOT IN ('monthly','quarterly','yearly') THEN
    RAISE EXCEPTION 'Sign-in and a valid payment frequency are required';
  END IF;
  SELECT * INTO v_expense FROM public."Apiary_Expenses"
    WHERE id=p_expense_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense unavailable';
  END IF;
  IF v_expense.recurring_template_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public."Apiary_Recurring_Expenses"
      WHERE id=v_expense.recurring_template_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND OR NOT v_existing.automatic_posting THEN
      RAISE EXCEPTION 'This expense has a separately managed schedule';
    END IF;
    UPDATE public."Apiary_Recurring_Expenses"
      SET active=true, updated_at=now()
      WHERE id=v_existing.id AND user_id=auth.uid();
    RETURN v_existing.id;
  END IF;
  v_next := public.auto_recurring_next_due(v_expense.expense_date,v_expense.expense_date,p_frequency);
  -- A backdated receipt starts future repetitions; it does not manufacture past payments.
  WHILE v_next <= v_local_today LOOP
    v_next := public.auto_recurring_next_due(v_expense.expense_date,v_next,p_frequency);
    v_iterations := v_iterations+1;
    IF v_iterations > 1200 THEN RAISE EXCEPTION 'Recurring date calculation exceeded limit'; END IF;
  END LOOP;
  INSERT INTO public."Apiary_Recurring_Expenses"(
    user_id, description, category, vendor, amount, payment_method, notes,
    hive_id, frequency, anchor_date, next_due_date, active, automatic_posting
  ) VALUES(
    v_expense.user_id,v_expense.description,v_expense.category,
    v_expense.vendor,v_expense.amount,v_expense.payment_method,v_expense.notes,
    v_expense.hive_id,p_frequency,v_expense.expense_date,v_next,true,true
  ) RETURNING id INTO v_schedule_id;
  UPDATE public."Apiary_Expenses"
    SET recurring_template_id=v_schedule_id, recurring_due_date=v_expense.expense_date
    WHERE id=v_expense.id AND user_id=auth.uid();
  RETURN v_schedule_id;
END
$$;
REVOKE ALL ON FUNCTION public.enable_auto_recurring_expense(bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_auto_recurring_expense(bigint,text) TO authenticated;
REVOKE ALL ON FUNCTION public.auto_recurring_next_due(date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_recurring_next_due(date,date,text) TO authenticated;

-- Worker runs only as the privileged database scheduler, never from an end-user browser.
-- A unique key prevents duplicate postings if a run is retried.
CREATE OR REPLACE FUNCTION public.post_due_auto_recurring_expenses(
  p_through_date date DEFAULT (now() AT TIME ZONE 'America/New_York')::date
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_schedule public."Apiary_Recurring_Expenses"%ROWTYPE;
  v_next date;
  v_count integer := 0;
  v_cycles integer;
BEGIN
  IF p_through_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  FOR v_schedule IN
    SELECT * FROM public."Apiary_Recurring_Expenses"
    WHERE automatic_posting=true AND active=true AND next_due_date<=p_through_date
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    v_cycles := 0;
    WHILE v_schedule.next_due_date<=p_through_date AND v_cycles<120 LOOP
      INSERT INTO public."Apiary_Expenses"(
        user_id, hive_id, expense_date, category, description, vendor, amount,
        payment_method, notes, recurring_template_id, recurring_due_date
      ) VALUES (
        v_schedule.user_id,v_schedule.hive_id,v_schedule.next_due_date,
        v_schedule.category,v_schedule.description,v_schedule.vendor,v_schedule.amount,
        v_schedule.payment_method,v_schedule.notes,v_schedule.id,v_schedule.next_due_date
      )
      ON CONFLICT (recurring_template_id, recurring_due_date) DO NOTHING;
      IF FOUND THEN v_count:=v_count+1; END IF;
      v_next := public.auto_recurring_next_due(
        v_schedule.anchor_date,v_schedule.next_due_date,v_schedule.frequency);
      UPDATE public."Apiary_Recurring_Expenses"
        SET next_due_date=v_next, updated_at=now() WHERE id=v_schedule.id;
      v_schedule.next_due_date:=v_next;
      v_cycles:=v_cycles+1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION public.post_due_auto_recurring_expenses(date)
  FROM PUBLIC, authenticated, anon;
COMMIT;
