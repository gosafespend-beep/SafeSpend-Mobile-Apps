-- Budgets are the only money table without a currency column, so a monthly limit
-- kept its bare number when the display currency changed: a 5,000 KES grocery
-- budget silently became a 5,000 USD one. Every other money table already has
-- `currency text NOT NULL DEFAULT 'USD'`; this brings budgets in line.
--
-- The backfill is the part that matters. Adding the column with a plain 'USD'
-- default would relabel every existing row as USD regardless of what the user
-- actually typed — the same mislabelling that left bills/debts/savings_goals at
-- 100% 'USD'. Existing limits were entered in the user's display currency, so
-- that is what they are stamped with.

alter table public.budgets add column if not exists currency text;

update public.budgets b
   set currency = s.currency
  from public.user_settings s
 where s.user_id = b.user_id
   and b.currency is null
   and s.currency is not null;

-- Users with no settings row fall back to the app default.
update public.budgets set currency = 'USD' where currency is null;

alter table public.budgets alter column currency set default 'USD';
alter table public.budgets alter column currency set not null;
