-- Bank import profiles and transaction duplicate-detection hash

-- ---------------------------------------------------------------------------
-- bank_profiles: reusable CSV column mappings per institution
-- household_id NULL = system default available to all households
-- ---------------------------------------------------------------------------

CREATE TABLE public.bank_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid REFERENCES public.households (id) ON DELETE CASCADE,
  institution     text NOT NULL,
  profile_key     text NOT NULL,
  display_name    text NOT NULL,
  column_mapping  jsonb NOT NULL,
  date_format     text,
  amount_mode     text NOT NULL DEFAULT 'signed'
    CHECK (amount_mode IN ('signed', 'debit_credit')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, profile_key)
);

CREATE INDEX bank_profiles_institution_idx ON public.bank_profiles (institution);
CREATE INDEX bank_profiles_household_id_idx ON public.bank_profiles (household_id);

ALTER TABLE public.bank_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_profiles_select ON public.bank_profiles
  FOR SELECT TO authenticated
  USING (
    household_id IS NULL
    OR household_id = public.household_id()
  );

CREATE POLICY bank_profiles_insert ON public.bank_profiles
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY bank_profiles_update ON public.bank_profiles
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

CREATE POLICY bank_profiles_delete ON public.bank_profiles
  FOR DELETE TO authenticated
  USING (household_id = public.household_id());

-- ---------------------------------------------------------------------------
-- row_hash on transactions for duplicate detection on import
-- SHA256(date + description + amount + account_id) computed in application code
-- ---------------------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN row_hash text;

CREATE UNIQUE INDEX transactions_account_row_hash_active_idx
  ON public.transactions (account_id, row_hash)
  WHERE deleted_at IS NULL AND row_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Seed system-default bank profiles (Capitec + Discovery layouts)
-- ---------------------------------------------------------------------------

INSERT INTO public.bank_profiles (
  household_id,
  institution,
  profile_key,
  display_name,
  column_mapping,
  date_format,
  amount_mode
) VALUES
  (
    NULL,
    'Capitec',
    'capitec_csv',
    'Capitec — CSV download',
    '{
      "date": "Date",
      "description": "Description",
      "amount": "Amount",
      "reference": "Reference"
    }'::jsonb,
    'yyyy/MM/dd',
    'signed'
  ),
  (
    NULL,
    'Capitec',
    'capitec_statement',
    'Capitec — statement export (debit/credit columns)',
    '{
      "date": "Date",
      "description": "Description",
      "debit": "Debit",
      "credit": "Credit",
      "reference": "Reference"
    }'::jsonb,
    'dd/MM/yyyy',
    'debit_credit'
  ),
  (
    NULL,
    'Discovery',
    'discovery_csv',
    'Discovery — CSV / statement export',
    '{
      "date": "Date",
      "description": "Description",
      "amount": "Amount",
      "reference": "Reference",
      "opening_balance": "Opening Balance",
      "closing_balance": "Closing Balance"
    }'::jsonb,
    'yyyy-MM-dd',
    'signed'
  ),
  (
    NULL,
    'Discovery',
    'discovery_alt',
    'Discovery — alternate layout (Transaction Date)',
    '{
      "date": "Transaction Date",
      "description": "Narrative",
      "amount": "Amount",
      "reference": "Reference Number",
      "opening_balance": "Opening balance",
      "closing_balance": "Closing balance"
    }'::jsonb,
    'dd MMM yyyy',
    'signed'
  );
