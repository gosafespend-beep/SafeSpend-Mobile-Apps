/**
 * The onboarding contract — mobile mirror.
 *
 * Canonical copy lives in the web app repo at src/lib/onboardingContract.ts.
 * This file must stay identical in meaning; CONTRACT_VERSION is the tripwire
 * for one side being edited alone.
 *
 * Why it exists: the two flows were implemented independently and came apart in
 * ways neither side could see. Web never asked for income, so Safe-to-Spend had
 * nothing to compute from; web fired no analytics at all; and the same funnel
 * was recorded under two sets of event names, so even the events both apps
 * fired could not be added together. Nothing forced them to agree, so they
 * didn't — the same root cause as the schema split across four repos and the
 * two divergent copies of parse-statement.
 *
 * The honest limitation: separate repos and toolchains mean this is a mirrored
 * definition with a test on each side, not one imported module. That catches an
 * implementation drifting from its contract. It does not catch the contract
 * itself being changed in one repo only — the version does, and only when both
 * suites run.
 */

export const CONTRACT_VERSION = 3;

/**
 * Steps by id. Names became ids in v3, when the flow went from seven screens to
 * twenty-one. Ids survive copy changes, which matters because analytics keys
 * off them -- renaming a title should not orphan a funnel.
 *
 * The canonical sequence lives in lib/onboardingSteps.js.
 */
export const STEPS_FULL = [
  'intro', 'currency', 'account-type', 'balance', 'income', 'pay-frequency',
  'payday', 'has-bill', 'bill-name', 'bill-amount', 'bill-day', 'overspend',
  'saving-for', 'goal-detail', 'has-debt', 'debt-detail', 'building', 'reveal',
  'alerts', 'first-amount', 'first-what',
];

export const STEPS_FROM_WELCOME = STEPS_FULL.filter(
  (s) => s !== 'intro' && s !== 'currency',
);

/*
 * Two permitted divergences from web, listed so they stay decisions rather
 * than becoming oversights:
 *
 *   Alerts     mobile only. Push permission and app lock have no web
 *              equivalent. It sits AFTER Reveal deliberately — asking for
 *              notification permission before the user has anything to be
 *              notified about is the weakest possible moment to ask.
 *
 *   Account /  mobile says 'Account' (it creates one), web says 'Accounts'
 *   Accounts   (it offers a multi-select of presets). Same stage, same
 *              captured field; the contract tracks the field, not the label.
 */
export const PLATFORM_ONLY_STEPS = {
  mobile: [{ step: 'Alerts', reason: 'Push permission and app lock have no web equivalent' }],
  web: [],
};

export const REQUIRED_FIELDS = [
  { field: 'currency', step: 'Currency', why: 'Denominates every amount and every seeded row' },
  { field: 'account', step: 'Account', why: 'Account type drives liquidity and credit-sign handling' },
  { field: 'income', step: 'Money', why: 'Safe-to-Spend, the forecast and the coach all derive from it' },
  { field: 'payday', step: 'Money', why: 'Determines when expected income lands this month' },
];

export const OPTIONAL_FIELDS = [
  { field: 'bill', step: 'Money', why: 'One fixed bill makes the first projection non-trivial' },
  { field: 'firstExpense', step: 'First expense', why: 'Activation: 34 of 37 accounts have never recorded one' },
];

export const SEEDED_TABLES = ['accounts', 'recurring_transactions', 'bills', 'expenses'];

export const REQUIRED_EVENTS = [
  'welcome_start',
  'welcome_step',
  'welcome_complete',
  'onboarding_step',
  'onboarding_abandon',
  'onboarding_skip',
  'onboarding_complete',
  'first_transaction',
];

export const EVENT_RULES = [
  {
    rule: 'step-events-fire-on-enter',
    why: 'Firing on exit makes "reached it and gave up" indistinguishable from "never got there"',
  },
  {
    rule: 'abandon-reads-step-from-a-ref',
    why: 'With the step in the effect deps, cleanup runs per step change and reports one walk-away as several',
  },
];

export const HANDOFF_KEYS = {
  seen: 'pref_welcome_seen',
  intent: 'pref_intent',
  currency: 'pref_pre_currency',
};

export const INTENTS = ['overspend', 'save', 'debt', 'track'];

// --- Feel, not just structure ---------------------------------------------
//
// The flows agreed on steps and copy and still landed differently, because
// nothing said what onboarding should sound or move like. This repo owned a
// whole motion and celebration system -- AnimatedNumber, useAnimatedProgress,
// Reveal, Confetti, haptics, and a duration token literally named `celebrate`
// -- and the peak moment of the flow used none of it.

export const MOTION_DURATIONS = { fast: 120, base: 220, slow: 420, celebrate: 700 };

export const REQUIRED_MOTION = [
  { at: 'Reveal', what: 'the Safe-to-Spend figure counts up', why: 'A number that lands instantly reads as a receipt' },
  { at: 'every step', what: 'the progress bar fills', why: 'Jumping tells you a step changed; filling tells you how far you are' },
  { at: 'every step', what: 'content rises in, directionally', why: 'Six hard cuts is what makes a flow feel like a form' },
];

export const REQUIRED_FEEDBACK = [
  { at: 'Reveal', haptic: 'impact', why: 'The figure arriving deserves a beat; impact, not success' },
  { at: 'First expense saved', haptic: 'success', celebrate: true, why: 'The habit the product depends on' },
];

// The one rule that is not a preference: when the number is negative, nothing
// celebrates. No confetti, no success haptic, no glow, no bounce.
export const NO_CELEBRATION_ON = 'danger';
