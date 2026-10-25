-- DRAFT ONLY. Do not run against production without separate approval.
-- Generate an actual timestamped migration using Supabase CLI in a local test project
-- before adoption. This file intentionally lives in docs/, not supabase/migrations/.
--
-- A treatment may belong to an inspection, but old independent treatment rows stay
-- unlinked. Removing an inspection preserves its treatment history.
ALTER TABLE public."Hive_Treatments"
  ADD COLUMN IF NOT EXISTS inspection_id bigint
  REFERENCES public."Hive_Inspections"(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hive_treatments_one_per_inspection_idx
  ON public."Hive_Treatments" (inspection_id)
  WHERE inspection_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_inspection_with_treatment(
  p_hive_id bigint,
  p_inspection_id bigint,
  p_colony_id bigint,
  p_inspection jsonb,
  p_treatment jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_inspection_id bigint;
  v_colony_id bigint;
  v_existing_note text;
  v_treatment_id bigint;
  v_i record;
  v_t record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'A signed-in session with verified MFA is required';
  END IF;
  IF p_hive_id IS NULL OR p_inspection IS NULL OR p_treatment IS NULL
     OR pg_catalog.jsonb_typeof(p_inspection) <> 'object'
     OR pg_catalog.jsonb_typeof(p_treatment) <> 'object' THEN
    RAISE EXCEPTION 'A hive, inspection and treatment are required';
  END IF;

  -- Explicit columns: callers cannot overwrite owner, IDs, completion history,
  -- colony relationships or unrelated columns by adding extra JSON keys.
  SELECT * INTO v_i FROM pg_catalog.jsonb_to_record(p_inspection) AS input(
    inspection_date date, queen_seen boolean, eggs_seen boolean,
    brood_pattern text, temperament text, honey_stores text,
    pollen_stores text, colony_strength text, mite_count integer,
    mite_test_method text, mite_sample_size integer,
    treatment_applied text, inspection_notes text
  );
  SELECT * INTO v_t FROM pg_catalog.jsonb_to_record(p_treatment) AS input(
    treatment_date date, product text, application_details text,
    follow_up_date date, notes text
  );

  IF v_i.inspection_date IS NULL THEN
    RAISE EXCEPTION 'Inspection date is required';
  END IF;
  IF v_i.mite_count IS NOT NULL AND (v_i.mite_count < 0 OR v_i.mite_test_method IS NULL) THEN
    RAISE EXCEPTION 'Mite count requires a testing method and cannot be negative';
  END IF;
  IF v_i.mite_count IS NOT NULL
     AND v_i.mite_test_method IN ('Alcohol Wash', 'Sugar Roll')
     AND v_i.mite_sample_size IS NULL THEN
    RAISE EXCEPTION 'A bee sample size is required for this mite test';
  END IF;
  IF v_i.mite_sample_size IS NOT NULL
     AND (v_i.mite_sample_size < 1 OR v_i.mite_sample_size > 10000) THEN
    RAISE EXCEPTION 'Bee sample size must be between 1 and 10000';
  END IF;
  IF v_t.treatment_date IS NULL OR NULLIF(pg_catalog.btrim(v_t.product), '') IS NULL THEN
    RAISE EXCEPTION 'Treatment date and product are required';
  END IF;
  IF v_t.follow_up_date IS NOT NULL AND v_t.follow_up_date < v_t.treatment_date THEN
    RAISE EXCEPTION 'Treatment follow-up cannot precede treatment date';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Hives" WHERE id = p_hive_id) THEN
    RAISE EXCEPTION 'Hive not found or not accessible';
  END IF;

  IF p_inspection_id IS NULL THEN
    IF p_colony_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Hive_Colonies"
      WHERE id = p_colony_id AND hive_id = p_hive_id AND user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Colony does not belong to this hive and account';
    END IF;
    v_colony_id := p_colony_id;
    INSERT INTO public."Hive_Inspections" (
      hive_id, colony_id, inspection_date, queen_seen, eggs_seen,
      brood_pattern, temperament, honey_stores, pollen_stores,
      colony_strength, mite_count, mite_test_method, mite_sample_size,
      treatment_applied, inspection_notes
    ) VALUES (
      p_hive_id, v_colony_id, v_i.inspection_date, v_i.queen_seen, v_i.eggs_seen,
      v_i.brood_pattern, v_i.temperament, v_i.honey_stores, v_i.pollen_stores,
      v_i.colony_strength, v_i.mite_count, v_i.mite_test_method,
      v_i.mite_sample_size,
      COALESCE(NULLIF(pg_catalog.btrim(v_i.treatment_applied), ''), 'Yes, see Treatments tab'),
      v_i.inspection_notes
    ) RETURNING id INTO v_inspection_id;
  ELSE
    -- Locked, visible record only; existing colony attribution must not change.
    SELECT i.colony_id, i.treatment_applied
      INTO v_colony_id, v_existing_note
    FROM public."Hive_Inspections" i
    WHERE i.id = p_inspection_id AND i.hive_id = p_hive_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inspection not found or not accessible';
    END IF;
    -- An old checkbox text may refer to a separate, unlinked treatment.
    -- Do not create a second treatment by silently upgrading legacy history.
    IF v_existing_note IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Hive_Treatments"
      WHERE inspection_id = p_inspection_id
    ) THEN
      RAISE EXCEPTION 'This historical treatment note is not linked; edit the existing treatment in Treatments';
    END IF;
    UPDATE public."Hive_Inspections" SET
      inspection_date = v_i.inspection_date,
      queen_seen = v_i.queen_seen, eggs_seen = v_i.eggs_seen,
      brood_pattern = v_i.brood_pattern, temperament = v_i.temperament,
      honey_stores = v_i.honey_stores, pollen_stores = v_i.pollen_stores,
      colony_strength = v_i.colony_strength, mite_count = v_i.mite_count,
      mite_test_method = v_i.mite_test_method,
      mite_sample_size = v_i.mite_sample_size,
      treatment_applied = COALESCE(NULLIF(pg_catalog.btrim(v_i.treatment_applied), ''), 'Yes, see Treatments tab'),
      inspection_notes = v_i.inspection_notes
    WHERE id = p_inspection_id AND hive_id = p_hive_id
    RETURNING id INTO v_inspection_id;
    IF v_inspection_id IS NULL THEN
      RAISE EXCEPTION 'Inspection could not be updated';
    END IF;
  END IF;

  -- Unique inspection_id prevents duplicates, including concurrent saves.
  SELECT id INTO v_treatment_id
  FROM public."Hive_Treatments"
  WHERE inspection_id = v_inspection_id AND hive_id = p_hive_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF v_treatment_id IS NULL THEN
    INSERT INTO public."Hive_Treatments" (
      hive_id, user_id, colony_id, inspection_id, treatment_date,
      product, application_details, follow_up_date, notes
    ) VALUES (
      p_hive_id, v_user_id, v_colony_id, v_inspection_id, v_t.treatment_date,
      pg_catalog.btrim(v_t.product), v_t.application_details,
      v_t.follow_up_date, v_t.notes
    );
  ELSE
    -- Preserve completed follow-up flags/results when editing treatment basics.
    UPDATE public."Hive_Treatments" SET
      treatment_date = v_t.treatment_date,
      product = pg_catalog.btrim(v_t.product),
      application_details = v_t.application_details,
      follow_up_date = v_t.follow_up_date,
      notes = v_t.notes
    WHERE id = v_treatment_id AND inspection_id = v_inspection_id
      AND hive_id = p_hive_id AND user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked treatment could not be updated';
    END IF;
  END IF;

  RETURN v_inspection_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_inspection_with_treatment(
  bigint, bigint, bigint, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_inspection_with_treatment(
  bigint, bigint, bigint, jsonb, jsonb
) TO authenticated;
