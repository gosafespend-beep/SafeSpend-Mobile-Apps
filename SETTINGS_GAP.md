# Settings — Web vs Mobile gap report

> **Status (2026-06-25):** parity build done. Implemented: budget period, start of
> week, email verification + resend, Google link/unlink, provider label, data import,
> avatar upload, delete account. Deferred: full light/dark theme system and product
> tour (each is a standalone feature, not a settings fix). The **delete-account edge
> function** is written but must be **deployed** (see bottom).


Structural note: the **web** has a dedicated **Settings tab** + a separate **Profile**
area. **Mobile** splits settings across the **Profile screen** and a separate
**Notifications screen** (both via More) — there is no single "Settings" hub.

## Parity matrix

| Web setting | Web location | Mobile status |
|---|---|---|
| Currency | Currency & Display | ✅ Profile → Preferences |
| Show cents | Currency & Display | ✅ Profile → Preferences |
| Date format | Date Format | ✅ Profile → Preferences |
| Start of week (Sun/Mon) | Date Format | ❌ Missing |
| Budget start month | Budget Period | ❌ Missing |
| Budget start year | Budget Period | ❌ Missing |
| Current budget-period label | Budget Period | ❌ Missing |
| Recurring transactions | Settings (inline) | 🟡 Separate More → Recurring screen |
| Weekly email summary | Notifications | ✅ Notifications screen |
| Bill reminders | Notifications | ✅ Notifications screen |
| Budget alerts | Notifications | ✅ Notifications screen |
| Export JSON backup | Data Management | ✅ Profile → Data |
| Export transactions CSV | Data Management | ✅ Profile → Data |
| Import data (JSON, merge/replace + preview) | Data Management | ❌ Missing |
| Clear / delete all data | Data Management | ✅ Profile → Data |
| Replay product tour | Product Tour | ❌ Missing (no tour exists) |
| Avatar / photo upload | Profile | ❌ Missing (initials only) |
| Display name edit | Profile | ✅ Profile |
| Email + verification + resend | Profile | 🟡 Email only; no verify/resend |
| Sign-in provider label | Profile | ❌ Missing (minor) |
| Change password | Profile | ✅ Profile → Account |
| Two-factor (MFA) setup | Profile | ✅ Profile → Security |
| Active sessions / revoke | Profile | ✅ Profile → Security |
| Social accounts (Google link/unlink) | Profile | ❌ Missing |
| Delete account (auth account) | Profile | ❌ Missing (data-delete only) |
| Theme (light/dark/system) | settings model | ❌ Missing both; mobile dark-only |
| Biometric app-lock | — | ✅ Mobile-only (not in web) |

## Work list (prioritized)

### High value
1. **Data import** — JSON restore with merge/replace modes + validation preview
   (web: `utils/dataImport.ts` `validateImportData`/`importJSON`). Mobile has export, no import.
2. **Delete account** — real auth-account deletion. Needs a Supabase **edge function**
   (service-role `auth.admin.deleteUser`) — client can't delete its own auth user.
   Mobile currently only offers "delete all data".
3. **Social account linking** — Google connect/disconnect (`AuthContext.linkIdentity`/`unlinkIdentity`).
4. **Email verification** — show verified/unverified + "resend verification" (`auth.resend`).

### Medium value
5. **Budget period** — start month + start year + current-period label
   (`user_settings.budget_start_month/year` columns already exist).
6. **Start of week** (Sunday/Monday) — client pref; affects calendar/week grouping.
7. **Avatar upload** — profile photo. Needs a Supabase Storage `avatars` bucket +
   `profiles.avatar_url` (the web `avatars` bucket policies exist in migrations).
8. **Replay product tour** — requires first building a product/onboarding tour (none on mobile).

### Structural / polish
9. **Unified Settings hub** — fold Preferences + Notifications + Recurring + Data under
   one "Settings" entry to match the web's model (currently scattered Profile/Notifications).
10. **Theme toggle** (light/dark/system) — needs light-theme support first (mobile is dark-only;
    everything reads dark tokens directly).
11. **Provider label** — "Signed in with Google/Email".

## Already at parity (no work)
Currency, show-cents, date format, change password, MFA setup, active sessions,
export JSON/CSV, delete-all-data, the 3 notification toggles. Mobile additionally has
**biometric app-lock**, which the web lacks.
