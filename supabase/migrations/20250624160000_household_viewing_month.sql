-- Household-level viewing month (first of month) shared by all members

ALTER TABLE public.households
  ADD COLUMN viewing_month date;

COMMENT ON COLUMN public.households.viewing_month IS
  'First day of the month both household members view across Dashboard, Transactions, and Insights. NULL = current calendar month.';
