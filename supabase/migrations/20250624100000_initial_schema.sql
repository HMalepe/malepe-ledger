-- Malepe Ledger: initial schema, RLS, audit triggers, and seed data
-- Multi-tenant by household_id from day one (Prompt 0.5)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: current authenticated user's household_id
-- Resolves via profiles; never hardcode household IDs in application code.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.household_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid();
$$;

COMMENT ON FUNCTION public.household_id() IS
  'Returns the household_id for the currently authenticated user (via profiles).';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  display_name text NOT NULL
);

CREATE INDEX profiles_household_id_idx ON public.profiles (household_id);

CREATE TABLE public.accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  name             text NOT NULL,
  institution      text NOT NULL,
  account_type     text NOT NULL,
  currency         text NOT NULL DEFAULT 'ZAR',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX accounts_household_id_idx ON public.accounts (household_id);
CREATE INDEX accounts_owner_profile_id_idx ON public.accounts (owner_profile_id);

CREATE TABLE public.categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  name         text NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('shared', 'individual')),
  UNIQUE (household_id, name)
);

CREATE INDEX categories_household_id_idx ON public.categories (household_id);

CREATE TABLE public.import_batches (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id               uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  account_id                 uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  filename                   text NOT NULL,
  uploaded_by                uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  uploaded_at                timestamptz NOT NULL DEFAULT now(),
  status                     text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reconciled', 'flagged', 'committed')),
  currency                   text NOT NULL DEFAULT 'ZAR',
  opening_balance            numeric(12, 2),
  closing_balance            numeric(12, 2),
  calculated_closing_balance numeric(12, 2)
);

CREATE INDEX import_batches_household_id_idx ON public.import_batches (household_id);
CREATE INDEX import_batches_account_id_idx ON public.import_batches (account_id);

CREATE TABLE public.transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  account_id           uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  import_batch_id      uuid REFERENCES public.import_batches (id) ON DELETE SET NULL,
  date                 date NOT NULL,
  description          text NOT NULL,
  reference            text,
  category             text,
  amount               numeric(12, 2) NOT NULL,
  is_debit             boolean NOT NULL,
  currency             text NOT NULL DEFAULT 'ZAR',
  tx_type              text NOT NULL
    CHECK (tx_type IN ('expense', 'income', 'debt_in', 'debt_out', 'internal_transfer')),
  is_internal_transfer boolean NOT NULL DEFAULT false,
  is_billing_error     boolean NOT NULL DEFAULT false,
  billing_error_status text
    CHECK (
      billing_error_status IS NULL
      OR billing_error_status IN ('flagged', 'disputed', 'resolved')
    ),
  notes                text,
  created_by           uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT transactions_amount_sign_matches_debit_chk CHECK (
    (is_debit = true AND amount <= 0)
    OR (is_debit = false AND amount >= 0)
  ),
  CONSTRAINT transactions_billing_error_status_chk CHECK (
    (is_billing_error = false AND billing_error_status IS NULL)
    OR (is_billing_error = true AND billing_error_status IS NOT NULL)
  )
);

CREATE INDEX transactions_household_id_idx ON public.transactions (household_id);
CREATE INDEX transactions_account_id_idx ON public.transactions (account_id);
CREATE INDEX transactions_date_idx ON public.transactions (date);
CREATE INDEX transactions_deleted_at_idx ON public.transactions (deleted_at)
  WHERE deleted_at IS NULL;
CREATE INDEX transactions_import_batch_id_idx ON public.transactions (import_batch_id);

CREATE TABLE public.debts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  creditor_name          text NOT NULL,
  amount                 numeric(12, 2) NOT NULL,
  currency               text NOT NULL DEFAULT 'ZAR',
  date_borrowed          date NOT NULL,
  date_due               date,
  repaid                 boolean NOT NULL DEFAULT false,
  debt_type              text NOT NULL DEFAULT 'standard'
    CHECK (debt_type IN ('standard', 'pass_through')),
  inflow_transaction_id  uuid REFERENCES public.transactions (id) ON DELETE SET NULL,
  outflow_transaction_id uuid REFERENCES public.transactions (id) ON DELETE SET NULL,
  notes                  text,
  CONSTRAINT debts_pass_through_linkage_chk CHECK (
    (debt_type = 'standard' AND inflow_transaction_id IS NULL AND outflow_transaction_id IS NULL)
    OR (
      debt_type = 'pass_through'
      AND inflow_transaction_id IS NOT NULL
      AND outflow_transaction_id IS NOT NULL
    )
  )
);

CREATE INDEX debts_household_id_idx ON public.debts (household_id);

CREATE TABLE public.monthly_insights (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  month          date NOT NULL,
  currency       text NOT NULL DEFAULT 'ZAR',
  income_total   numeric(12, 2) NOT NULL,
  expense_total  numeric(12, 2) NOT NULL,
  surplus        numeric(12, 2) NOT NULL,
  ai_summary     text,
  ai_flags       jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, month)
);

CREATE INDEX monthly_insights_household_id_idx ON public.monthly_insights (household_id);

CREATE TABLE public.transaction_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  household_id   uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  changed_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  action         text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_values     jsonb,
  new_values     jsonb
);

CREATE INDEX transaction_audit_log_transaction_id_idx
  ON public.transaction_audit_log (transaction_id);
CREATE INDEX transaction_audit_log_household_id_idx
  ON public.transaction_audit_log (household_id);

-- ---------------------------------------------------------------------------
-- Auto-create profile when a new auth.users row is inserted
-- Pass household_id and display_name via raw_user_meta_data at signup/seed time.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_display_name text;
BEGIN
  v_household_id := NULLIF(NEW.raw_user_meta_data ->> 'household_id', '')::uuid;
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION
      'New users must include household_id in raw_user_meta_data (no public signup).';
  END IF;

  INSERT INTO public.profiles (id, household_id, display_name)
  VALUES (NEW.id, v_household_id, v_display_name)
  ON CONFLICT (id) DO UPDATE
    SET household_id = EXCLUDED.household_id,
        display_name = EXCLUDED.display_name;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Transaction audit log trigger (insert / update / soft-delete)
-- Financial ledgers must never lose history silently.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_transaction_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_changed_by uuid;
BEGIN
  v_changed_by := auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    INSERT INTO public.transaction_audit_log (
      transaction_id,
      household_id,
      changed_by,
      action,
      old_values,
      new_values
    ) VALUES (
      NEW.id,
      NEW.household_id,
      v_changed_by,
      v_action,
      NULL,
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    INSERT INTO public.transaction_audit_log (
      transaction_id,
      household_id,
      changed_by,
      action,
      old_values,
      new_values
    ) VALUES (
      NEW.id,
      NEW.household_id,
      v_changed_by,
      v_action,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    INSERT INTO public.transaction_audit_log (
      transaction_id,
      household_id,
      changed_by,
      action,
      old_values,
      new_values
    ) VALUES (
      OLD.id,
      OLD.household_id,
      v_changed_by,
      v_action,
      to_jsonb(OLD),
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER transactions_audit_log_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_transaction_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Scope strictly by household_id — never by owner_profile_id.
-- Both household members have full equal read/write within their household.
-- ---------------------------------------------------------------------------

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;

-- households
CREATE POLICY households_select ON public.households
  FOR SELECT TO authenticated
  USING (id = public.household_id());

CREATE POLICY households_update ON public.households
  FOR UPDATE TO authenticated
  USING (id = public.household_id())
  WITH CHECK (id = public.household_id());

-- profiles
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

-- accounts
CREATE POLICY accounts_select ON public.accounts
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY accounts_insert ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY accounts_update ON public.accounts
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

CREATE POLICY accounts_delete ON public.accounts
  FOR DELETE TO authenticated
  USING (household_id = public.household_id());

-- categories
CREATE POLICY categories_select ON public.categories
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY categories_insert ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY categories_update ON public.categories
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

CREATE POLICY categories_delete ON public.categories
  FOR DELETE TO authenticated
  USING (household_id = public.household_id());

-- import_batches
CREATE POLICY import_batches_select ON public.import_batches
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY import_batches_insert ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY import_batches_update ON public.import_batches
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

CREATE POLICY import_batches_delete ON public.import_batches
  FOR DELETE TO authenticated
  USING (household_id = public.household_id());

-- transactions
CREATE POLICY transactions_select ON public.transactions
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY transactions_insert ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY transactions_update ON public.transactions
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

-- No DELETE policy: transactions are soft-deleted via deleted_at only.

-- debts
CREATE POLICY debts_select ON public.debts
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY debts_insert ON public.debts
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY debts_update ON public.debts
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

CREATE POLICY debts_delete ON public.debts
  FOR DELETE TO authenticated
  USING (household_id = public.household_id());

-- monthly_insights
CREATE POLICY monthly_insights_select ON public.monthly_insights
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY monthly_insights_insert ON public.monthly_insights
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY monthly_insights_update ON public.monthly_insights
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

CREATE POLICY monthly_insights_delete ON public.monthly_insights
  FOR DELETE TO authenticated
  USING (household_id = public.household_id());

-- transaction_audit_log (read-only for users; writes come from trigger)
CREATE POLICY transaction_audit_log_select ON public.transaction_audit_log
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

-- ---------------------------------------------------------------------------
-- Seed data
-- Fixed UUIDs for reproducibility across environments.
-- Default password for both seed users: ChangeMeNow!1
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_household_id   uuid := 'a1000000-0000-4000-8000-000000000001';
  v_holiday_id     uuid := 'b1000000-0000-4000-8000-000000000001';
  v_desiree_id     uuid := 'b1000000-0000-4000-8000-000000000002';
  v_instance_id    uuid := '00000000-0000-0000-0000-000000000000';
  v_password_hash  text := crypt('ChangeMeNow!1', gen_salt('bf'));
BEGIN
  INSERT INTO public.households (id, name)
  VALUES (v_household_id, 'Malepe Household');

  -- Holiday
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    v_instance_id,
    v_holiday_id,
    'authenticated',
    'authenticated',
    'holiday@malepe.local',
    v_password_hash,
    now(),
    jsonb_build_object(
      'household_id', v_household_id::text,
      'display_name', 'Holiday'
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_holiday_id,
    v_holiday_id,
    jsonb_build_object(
      'sub', v_holiday_id::text,
      'email', 'holiday@malepe.local',
      'email_verified', true
    ),
    'email',
    v_holiday_id::text,
    now(),
    now(),
    now()
  );

  -- Desiree
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    v_instance_id,
    v_desiree_id,
    'authenticated',
    'authenticated',
    'desiree@malepe.local',
    v_password_hash,
    now(),
    jsonb_build_object(
      'household_id', v_household_id::text,
      'display_name', 'Desiree'
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_desiree_id,
    v_desiree_id,
    jsonb_build_object(
      'sub', v_desiree_id::text,
      'email', 'desiree@malepe.local',
      'email_verified', true
    ),
    'email',
    v_desiree_id::text,
    now(),
    now(),
    now()
  );

  -- Accounts (one owner per account; no joint accounts in v1)
  INSERT INTO public.accounts (
    household_id,
    owner_profile_id,
    name,
    institution,
    account_type
  ) VALUES
    (v_household_id, v_holiday_id, 'Holiday-Capitec',   'Capitec',    'cheque'),
    (v_household_id, v_holiday_id, 'Holiday-Discovery', 'Discovery',  'cheque'),
    (v_household_id, v_desiree_id, 'Desiree-Capitec',   'Capitec',    'cheque'),
    (v_household_id, v_desiree_id, 'Desiree-Discovery', 'Discovery',  'cheque');
END $$;
