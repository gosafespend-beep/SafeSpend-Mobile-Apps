/**
 * "Needs attention" — the rules, in one place. MIRROR of the web app's
 * src/lib/attention.ts. Edit both, or neither.
 *
 * The things a user should act on: bills overdue or due soon, categories over
 * budget, goal deadlines closing in, an unverified email. Mobile has had this
 * since launch, surfaced as a bell with a count; web had nothing, which is the
 * difference between a product that tells you something is wrong and one that
 * waits for you to notice.
 *
 * This file is the RULES only — no fetching, no currency conversion, no
 * platform. Both surfaces get their own data their own way and hand the same
 * shape in, because the alternative is two definitions of "overdue" that
 * disagree in a way nobody sees. That is the same reasoning behind
 * availableToSpend, and it is mirrored the same way: an identical file in the
 * web repo, a version constant, and the same tests either side.
 *
 * Currency is deliberately NOT handled here. Budgets are denominated in their
 * own column and expenses in their account's currency, so summing them raw
 * produced phantom "over budget" alerts. Callers must normalise to one
 * currency before calling — mobile through FxContext, web through useFxRates.
 */

/** Bump when a rule changes. The mobile mirror must match. */
export const ATTENTION_RULES_VERSION = 1;

/** How many days ahead a bill counts as "due soon". */
export const DUE_SOON_DAYS = 3;

/** How many days ahead a goal deadline starts being worth mentioning. */
export const GOAL_HORIZON_DAYS = 21;


/** "1st", "22nd". The 11–13 exception is the whole reason this exists. */
function nth(d) {
  if (d % 100 >= 11 && d % 100 <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] || 'th';
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildAttention(input) {
  const now = input.today || new Date();
  const today = now.getDate();
  const out = [];

  // Bills. Unpaid only — a paid bill is not a problem regardless of its date.
  for (const b of input.bills) {
    if (b.isPaid) continue;
    if (b.dueDay < today) {
      out.push({
        id: `bill-od-${b.id}`, type: 'overdue', priority: 0, tone: 'expense', icon: 'alertTriangle',
        title: `${b.name} is overdue`,
        subtitle: `Due on the ${b.dueDay}${nth(b.dueDay)} · tap to pay`,
        nav: 'bills',
      });
    } else if (b.dueDay <= today + DUE_SOON_DAYS) {
      out.push({
        id: `bill-soon-${b.id}`, type: 'due', priority: 2, tone: 'warning', icon: 'calendar',
        title: `${b.name} due soon`,
        subtitle: b.dueDay === today ? 'Due today' : `Due in ${plural(b.dueDay - today, 'day')}`,
        nav: 'bills',
      });
    }
  }

  // Over-budget categories. Strictly over: spending exactly the limit is
  // landing on target, not failing.
  for (const b of input.budgets) {
    if (b.limit > 0 && b.spent > b.limit) {
      out.push({
        id: `budget-${b.category}`, type: 'budget', priority: 1, tone: 'expense', icon: 'scale',
        title: `Over budget on ${b.category}`,
        subtitle: 'Tap to review your budget',
        nav: 'budget',
      });
    }
  }

  // Goals with a deadline in sight that are not already met.
  input.goals.forEach((g, i) => {
    if (g.target > 0 && g.current >= g.target) return;
    if (!g.deadline) return;
    const days = Math.ceil((new Date(`${g.deadline}T00:00:00`).getTime() - now.getTime()) / 86400000);
    if (days >= 0 && days <= GOAL_HORIZON_DAYS) {
      out.push({
        id: `goal-${i}`, type: 'goal', priority: 3, tone: 'primary', icon: 'target',
        title: `“${g.name}” deadline near`,
        subtitle: days === 0 ? 'Due today' : `${plural(days, 'day')} left to hit your target`,
        nav: 'goals',
      });
    }
  });

  if (!input.emailVerified) {
    out.push({
      id: 'email', type: 'email', priority: 4, tone: 'warning', icon: 'bell',
      title: 'Verify your email',
      subtitle: 'Confirm your address to secure your account',
      nav: 'profile',
    });
  }

  // Stable sort by priority. Within a priority the input order is kept, which
  // for bills means the order the caller fetched them — deterministic enough
  // that the list does not reshuffle between refreshes.
  return out.sort((a, b) => a.priority - b.priority);
}
