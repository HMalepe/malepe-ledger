-- Account salary cycle fields for Days-to-Zero dashboard widget

ALTER TABLE public.accounts
  ADD COLUMN salary_day_of_month integer
    CHECK (salary_day_of_month IS NULL OR (salary_day_of_month >= 1 AND salary_day_of_month <= 31)),
  ADD COLUMN salary_amount numeric(12, 2),
  ADD COLUMN low_balance_threshold numeric(12, 2) NOT NULL DEFAULT 200;

COMMENT ON COLUMN public.accounts.salary_day_of_month IS
  'Day of month salary lands (1-31). Used for pay-cycle Days-to-Zero calculation.';
COMMENT ON COLUMN public.accounts.salary_amount IS
  'Expected salary amount per cycle for Days-to-Zero projection.';
COMMENT ON COLUMN public.accounts.low_balance_threshold IS
  'Balance threshold (ZAR) for Days-to-Zero — default R200.';
