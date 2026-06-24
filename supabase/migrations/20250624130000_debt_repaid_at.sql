-- Track when a debt was marked repaid

ALTER TABLE public.debts
  ADD COLUMN repaid_at timestamptz;

COMMENT ON COLUMN public.debts.repaid_at IS
  'Timestamp when the debt was marked repaid; cleared when unmarked.';
