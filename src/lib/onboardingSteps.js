/**
 * The onboarding sequence — mobile.
 *
 * Mirrors the web app's src/components/onboarding/steps.ts, same ids in the
 * same order, plus `alerts` which is mobile-only. The Mobbin study of 986 apps
 * found web onboarding runs 21% shorter than iOS precisely because mobile
 * carries permission screens web has no counterpart for, so that difference is
 * recorded here rather than left to drift.
 *
 * The rule for adding a screen: it must change the output. Every id below
 * writes a row, seeds a category or moves the Safe-to-Spend figure. A question
 * the product does not use is worse than no question.
 */

export const STEP_DEFS = [
  { id: 'intro', kind: 'statement', title: 'Let’s find your safe number', subtitle: 'A few quick questions. No bank login, ever.', fromWelcome: false },
  { id: 'currency', kind: 'choice', title: 'Which currency do you think in?', fromWelcome: false },
  { id: 'account-type', kind: 'choice', title: 'Where does your money sit?', subtitle: 'The account you actually spend from.' },
  { id: 'balance', kind: 'amount', title: 'Roughly how much is in there?', subtitle: 'An estimate is fine. You can correct it later.' },
  { id: 'income', kind: 'amount', title: 'What lands each month?', subtitle: 'Take-home, after tax.' },
  { id: 'pay-frequency', kind: 'choice', title: 'How often does it arrive?' },
  { id: 'payday', kind: 'day', title: 'Which day?', subtitle: 'So we know what’s landed and what’s still coming.' },
  { id: 'has-bill', kind: 'fork', title: 'Got a big fixed bill?', subtitle: 'Rent, a loan, anything on the same day each month.' },
  { id: 'bill-name', kind: 'text', title: 'What is it?', requires: 'has-bill' },
  { id: 'bill-amount', kind: 'amount', title: 'How much?', requires: 'has-bill' },
  { id: 'bill-day', kind: 'day', title: 'Due on which day?', requires: 'has-bill' },
  { id: 'overspend', kind: 'multi', title: 'Where does it usually go?', subtitle: 'Pick the ones that catch you out.' },
  { id: 'saving-for', kind: 'fork', title: 'Saving toward something?' },
  { id: 'goal-detail', kind: 'amount', title: 'How much are you aiming for?', requires: 'saving-for' },
  { id: 'has-debt', kind: 'fork', title: 'Anything you’re paying off?', subtitle: 'A card, a loan. It helps to see it beside everything else.' },
  { id: 'debt-detail', kind: 'amount', title: 'Roughly how much is left?', requires: 'has-debt' },
  { id: 'building', kind: 'compute', title: 'Working it out' },
  { id: 'reveal', kind: 'reveal', title: 'Here’s what’s safe to spend' },
  // Mobile only, and deliberately AFTER the reveal: asking for notification
  // permission before the user has anything to be notified about is the
  // weakest moment to ask. An in-app screen before the OS prompt measurably
  // lifts accept rates, because the system dialog gives no reason to say yes.
  { id: 'alerts', kind: 'fork', title: 'Want a nudge before a bill lands?', subtitle: 'Only what’s useful — a bill due, a budget slipping.', platform: 'mobile' },
  { id: 'first-amount', kind: 'amount', title: 'Log one thing you spent', subtitle: 'A coffee will do. This is the habit the whole app runs on.' },
  { id: 'first-what', kind: 'text', title: 'What was it?' },
];

/** The sequence for a given route in, with unanswered forks pruned. */
export function stepsFor(fromWelcome, forks) {
  return STEP_DEFS.filter((s) => {
    if (fromWelcome && s.fromWelcome === false) return false;
    if (s.requires) return forks[s.requires] === true;
    return true;
  });
}

/** Discretionary categories — the ones someone can actually move. */
export const OVERSPEND_CATEGORIES = [
  { id: 'dining-out', label: 'Dining out' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'transport', label: 'Transport' },
  { id: 'food', label: 'Groceries' },
  { id: 'personal-care', label: 'Personal care' },
  { id: 'gifts', label: 'Gifts' },
];

export const ACCOUNT_OPTIONS = [
  { id: 'bank', label: 'A bank account', hint: 'Where your salary lands', icon: 'landmark', tone: '200 70% 50%' },
  { id: 'cash', label: 'Cash', hint: 'Notes and coins you spend from', icon: 'banknote', tone: '158 64% 45%' },
  { id: 'savings', label: 'A savings account', hint: 'Set aside, not for spending', icon: 'piggy', tone: '262 52% 56%' },
  { id: 'credit', label: 'A credit card', hint: 'Money you owe, not money you have', icon: 'creditCard', tone: '350 70% 55%' },
];

export const FREQUENCY_OPTIONS = [
  { id: 'monthly', label: 'Once a month' },
  { id: 'biweekly', label: 'Every two weeks' },
  { id: 'weekly', label: 'Every week' },
];

/**
 * What the app says back.
 *
 * Identical in intent to the web copy. Three rules: say nothing when there is
 * nothing to say, reflect arithmetic the user has not done, and never
 * congratulate a bad position.
 */
const daysLeft = (now = new Date()) =>
  Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1);

export function reflect(id, { value = 0, income = 0, count = 0, money }) {
  switch (id) {
    case 'balance':
      return value > 0 ? `${money(value / daysLeft())} a day for the rest of the month, before anything else arrives.` : '';
    case 'income':
      return value > 0 ? `That's about ${money(value / 30)} a day, before bills.` : '';
    case 'bill-amount': {
      if (value <= 0) return '';
      if (income <= 0) return `${money(value)} out, every month.`;
      const share = Math.round((value / income) * 100);
      if (share >= 50) return `That's ${share}% of what comes in. We'll keep it front and centre.`;
      if (share >= 30) return `That's ${share}% of your income, reserved before anything else.`;
      return `${share}% of what comes in. The rest is yours to plan with.`;
    }
    case 'overspend':
      if (count === 0) return '';
      if (count === 1) return 'We’ll watch that one closely.';
      return `${count} to keep an eye on. They’ll be on your dashboard from day one.`;
    case 'goal-detail':
      return value > 0 ? `${money(value / 6)} a month, set aside before you spend.` : '';
    case 'debt-detail':
      return value > 0 ? `Tracked at ${money(value)}. It'll show up in your net worth.` : '';
    default:
      return '';
  }
}

export function reflectDay(day) {
  if (!day) return '';
  const today = new Date().getDate();
  if (day === today) return 'That’s today.';
  const total = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const away = day > today ? day - today : total - today + day;
  return away === 1 ? 'Tomorrow.' : `${away} days away.`;
}

export const BUILDING_LINES = [
  'Reading what comes in…',
  'Setting aside what’s already spoken for…',
  'Working out what’s left…',
];
