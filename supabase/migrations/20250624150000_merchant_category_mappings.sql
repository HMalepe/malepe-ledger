-- Household-level merchant → category mappings learned over time

CREATE TABLE public.merchant_category_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  merchant_key  text NOT NULL,
  category_name text NOT NULL,
  source        text NOT NULL DEFAULT 'learned'
    CHECK (source IN ('learned', 'manual', 'ai')),
  hit_count     integer NOT NULL DEFAULT 1,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, merchant_key)
);

CREATE INDEX merchant_category_mappings_household_idx
  ON public.merchant_category_mappings (household_id);
CREATE INDEX merchant_category_mappings_key_idx
  ON public.merchant_category_mappings (household_id, merchant_key);

ALTER TABLE public.merchant_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY merchant_category_mappings_select ON public.merchant_category_mappings
  FOR SELECT TO authenticated
  USING (household_id = public.household_id());

CREATE POLICY merchant_category_mappings_insert ON public.merchant_category_mappings
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.household_id());

CREATE POLICY merchant_category_mappings_update ON public.merchant_category_mappings
  FOR UPDATE TO authenticated
  USING (household_id = public.household_id())
  WITH CHECK (household_id = public.household_id());

CREATE POLICY merchant_category_mappings_delete ON public.merchant_category_mappings
  FOR DELETE TO authenticated
  USING (household_id = public.household_id());
