# Backend lives in the web app repo

This repository holds no migrations and no edge functions. There is one
database and one set of functions, owned by:

    https://github.com/smartvideofy/gosafespend  ->  supabase/

## What was removed from here, and why it matters

**Two migrations.** `budgets_currency` moved there.
`20260710000000_revenuecat_entitlements.sql` was deleted outright rather than
moved: it contradicted the live database, omitting the `created_at` column the
real table has. Because it used `create table if not exists`, running it first
on a fresh project would have produced a table one column short of what every
client expects.

**Three edge functions** — `ai-coach`, `parse-statement`, `revenuecat-webhook`.
These were copies. The web app repo had its own, and they had drifted apart,
which is exactly the failure this consolidation exists to stop:

- `parse-statement` — this repo's copy checked entitlement before calling the AI
  gateway. The other did not. Since only this app calls that function, nothing
  ever exercised the ungated copy, and whichever one was deployed decided
  whether the paywall on the most expensive AI call in the product existed at
  all. The check is now in the canonical copy, wired to the shared
  `user_is_premium()` resolver.

- `revenuecat-webhook` — the two differed only in an import specifier, comments,
  and an `ACTIVE_TYPES` set this copy declared but never used. No behavioural
  difference.

The app itself is unaffected: it calls these functions over HTTP by name and
never referenced these files.

Backend changes for this project go in that repo, not this one.
