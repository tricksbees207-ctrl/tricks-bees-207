-- Disposable PostgreSQL fixture for review-only Winter schema installation.
-- No external Supabase project is contacted. This file is test-only.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

CREATE TABLE public."Hive_Colonies" (
 id bigint PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 colony_status text NOT NULL
);
CREATE TABLE public."Hive_Losses" (
 id bigint PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 colony_id bigint NOT NULL
);
CREATE TABLE public."Hive_Inspections" (
 id bigint PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 colony_id bigint NOT NULL, inspection_date date NOT NULL
);
CREATE TABLE public."Hive_Feedings" (
 id bigint PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 colony_id bigint NOT NULL, feed_date date NOT NULL
);
CREATE TABLE public."Hive_Treatments" (
 id bigint PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 colony_id bigint NOT NULL, treatment_date date NOT NULL
);

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated;
GRANT SELECT ON public."Hive_Colonies", public."Hive_Losses",
 public."Hive_Inspections", public."Hive_Feedings",
 public."Hive_Treatments" TO authenticated;

INSERT INTO auth.users (id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO public."Hive_Colonies" (id,user_id,colony_status)
VALUES (1,'11111111-1111-4111-8111-111111111111','active');
