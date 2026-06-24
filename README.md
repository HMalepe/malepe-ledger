# Malepe Ledger

Household finance ledger for a married couple — **not** a generic budgeting app. Built multi-tenant from day one (`household_id` on every table, RLS everywhere) even though only one household is seeded today.

**Repo:** https://github.com/HMalepe/malepe-ledger (private)

## Core domain rules

| Concept | Behaviour |
|--------|-----------|
| **Internal transfers** | Money between the household's own accounts (`is_internal_transfer` / `tx_type = internal_transfer`) — excluded from income and spend totals |
| **Pass-through loans** | `debts.debt_type = 'pass_through'` with linked inflow/outflow transactions — nets to zero real spending, tracked separately |
| **Billing errors** | `is_billing_error` flag — excluded from spend calculations, recoverable |
| **Household viewing month** | `households.viewing_month` — both users always see the same period on Dashboard, Transactions, and Insights |

All arithmetic runs in application code. Anthropic is used **only** for narrative insights.

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- Supabase (Postgres + Auth + RLS)
- Anthropic API (monthly insights, category fallback)
- Vercel (deploy + daily insights cron)

## Routes

| Route | Purpose |
|-------|---------|
| `/login` | Sign in (no public signup) |
| `/dashboard` | Household overview for viewing month |
| `/dashboard/[profileId]` | Per-person dashboard |
| `/transactions` | CRUD, CSV import, filters |
| `/debt` | Standard debts + pass-through loans |
| `/insights` | AI monthly insights, chat, deep history |
| `/settings` | Accounts, categories, month export (CSV/PDF) |
| `/account` | Change password |
| `/api/cron/generate-insights` | Daily cron (Bearer `CRON_SECRET`) |

## Database migrations

Apply in order via Supabase SQL editor or CLI:

| File | Contents |
|------|----------|
| `20250624100000_initial_schema.sql` | Full schema: households, profiles, accounts, transactions, categories, debts (`debt_type`: `standard` \| `pass_through`), pass-through transaction links, import batches, monthly_insights, audit triggers, RLS on all tables, seed data (Malepe Household, Holiday + Desiree, 4 accounts) |
| `20250624110000_bank_profiles_and_row_hash.sql` | Bank CSV profiles, `transactions.row_hash` for duplicate detection |
| `20250624120000_account_salary_fields.sql` | `salary_day_of_month`, `salary_amount`, `low_balance_threshold` on accounts |
| `20250624130000_debt_repaid_at.sql` | `debts.repaid_at` timestamp |
| `20250624140000_insights_cost_tracking.sql` | Household AI cost ceiling, insight context JSON |
| `20250624150000_merchant_category_mappings.sql` | Learned merchant → category mappings |
| `20250624160000_household_viewing_month.sql` | `households.viewing_month` (shared period selector) |

### RLS pattern

Every table scopes by `household_id` via `public.household_id()` — resolved from the authenticated user's profile. **Never** hardcode household IDs in app code.

### Key schema highlights

- **Transactions:** `tx_type` in (`expense`, `income`, `debt_in`, `debt_out`, `internal_transfer`); soft delete via `deleted_at`
- **Debts:** `debt_type` `standard` | `pass_through`; pass-through links to transaction rows
- **Accounts:** one `owner_profile_id` per account (no joint accounts in v1)
- **Categories:** `scope` `shared` | `individual`, unique per household name

## Project structure

```
app/
  (main)/          # Authenticated shell (sidebar layout)
    dashboard/     # Household + per-person views
    transactions/
    debt/
    insights/
    settings/
    account/
  login/
  api/cron/        # Scheduled insight generation
components/        # UI + page clients
lib/
  actions/         # Server actions (transactions, dashboard, debts, insights, settings)
  dashboard/       # Stat/chart calculations (all math here)
  insights/        # Summary builder + Anthropic integration
  categories/      # Merchant learning + AI suggestion fallback
  household/       # Viewing month helpers
  supabase/        # Client, server, admin
supabase/migrations/
00_Appendix_A_AI_System_Prompt.md   # Loaded verbatim for insights
```

## Setup

1. Clone and install:

```bash
git clone https://github.com/HMalepe/malepe-ledger.git
cd malepe-ledger
npm install
```

2. Copy env and fill in values:

```bash
cp .env.local.example .env.local
```

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`

3. Run all migrations in `supabase/migrations/` against your Supabase project.

4. Create two auth users in Supabase matching the seeded profiles (or update seed).

5. Dev server:

```bash
npm run build   # verify
npm run dev
```

## Features implemented

- [x] Auth (login, middleware, change password)
- [x] Transaction CRUD + soft delete
- [x] CSV bulk import with bank profiles + duplicate detection
- [x] Dashboard: stat cards, category comparison, running balance, days-to-zero
- [x] Debt tracker: standard + pass-through, repaid checkbox
- [x] AI insights: monthly generation, cache, refresh, ask chat, deep history, cost ceiling
- [x] Category auto-suggestion (merchant history → AI Haiku fallback)
- [x] Settings: account/category CRUD, shared month selector, CSV/PDF export
- [x] Vercel cron for daily insight generation

## Currency

South African Rand — formatted as `R 1,234.56` via `lib/transactions/currency.ts`.

## License

Private — household use.
