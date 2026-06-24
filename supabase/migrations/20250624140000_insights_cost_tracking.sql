-- AI insights cost control and generation tracking on households

ALTER TABLE public.households
  ADD COLUMN monthly_ai_cost_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN monthly_ai_usage_month date,
  ADD COLUMN insights_cost_ceiling_cents integer NOT NULL DEFAULT 500,
  ADD COLUMN last_auto_insights_at timestamptz;

COMMENT ON COLUMN public.households.monthly_ai_cost_cents IS
  'Accumulated Anthropic API cost (cents) for the current usage month.';
COMMENT ON COLUMN public.households.monthly_ai_usage_month IS
  'First day of month the monthly_ai_cost_cents counter applies to; reset when month changes.';
COMMENT ON COLUMN public.households.insights_cost_ceiling_cents IS
  'Max AI spend (cents) per household per calendar month before generation is blocked.';
COMMENT ON COLUMN public.households.last_auto_insights_at IS
  'Last automatic (cron) insights generation; enforces at most one auto run per day.';

-- Store pre-computed context JSON for chat reuse and audit
ALTER TABLE public.monthly_insights
  ADD COLUMN context_json jsonb,
  ADD COLUMN generation_status text NOT NULL DEFAULT 'success'
    CHECK (generation_status IN ('success', 'failed')),
  ADD COLUMN generation_error text,
  ADD COLUMN input_tokens integer,
  ADD COLUMN output_tokens integer;
