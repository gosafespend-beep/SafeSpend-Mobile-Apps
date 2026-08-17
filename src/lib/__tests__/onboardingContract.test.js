const fs = require('fs');
const path = require('path');

/**
 * Asserts the mobile implementation matches the onboarding contract.
 *
 * Mirror of the web app's src/test/onboarding-contract.test.ts. Both sides run
 * the same assertions against their own flow, which is what stops the two
 * drifting apart the way they already did once — web never asked for income,
 * fired no analytics, and used a different name for every shared event.
 *
 * Reads source as text rather than rendering the screen. The questions are
 * structural (does this step exist, is this event fired, is the abandon effect
 * written the way it has to be), and rendering a multi-step RN flow to answer
 * them would test the mock harness more than the flow.
 */

const contract = require('../onboardingContract');

const src = (rel) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');
const screen = src('screens/OnboardingScreen.js');
const welcome = src('screens/WelcomeScreen.js');
const navigator = src('navigation/RootNavigator.js');

describe('onboarding contract — steps', () => {
  it('declares the same step list the screen uses', () => {
    const declared = screen.match(/const STEPS_FULL = \[(.*?)\];/s)[1];
    contract.STEPS_FULL.forEach((step) => {
      expect(declared).toContain(`'${step}'`);
    });
  });

  it('ends on the first expense, not on a congratulation', () => {
    // Both flows used to hand over a dashboard and hope. 34 of 37 accounts
    // have never recorded a transaction.
    const last = contract.STEPS_FULL[contract.STEPS_FULL.length - 1];
    expect(last).toBe('First expense');
    expect(contract.STEPS_FROM_WELCOME[contract.STEPS_FROM_WELCOME.length - 1]).toBe('First expense');
    expect(screen).toContain("name === 'First expense'");
  });

  it('keeps Alerts after the Reveal', () => {
    // Asking for notification permission before the user has anything to be
    // notified about is the weakest possible moment to ask.
    const steps = contract.STEPS_FULL;
    expect(steps.indexOf('Alerts')).toBeGreaterThan(steps.indexOf('Reveal'));
  });

  it('asks for income, which is what the product computes from', () => {
    expect(contract.REQUIRED_FIELDS.map((f) => f.field)).toContain('income');
    expect(screen).toContain('Monthly income');
  });
});

describe('onboarding contract — telemetry', () => {
  const fired = new Set(
    [...screen.matchAll(/track\('([a-z_]+)'/g), ...welcome.matchAll(/track\('([a-z_]+)'/g)]
      .map((m) => m[1]),
  );

  it('fires every required event', () => {
    contract.REQUIRED_EVENTS.forEach((event) => {
      expect(fired.has(event)).toBe(true);
    });
  });

  it('reports steps on enter, so drop-off is attributable', () => {
    expect(screen).toMatch(/useEffect\(\(\) => \{[\s\S]{0,200}track\('onboarding_step'/);
  });

  it('reads the abandoned step from a ref, not from effect deps', () => {
    const abandon = screen.slice(
      screen.indexOf('const stepRef'),
      screen.indexOf("track('onboarding_abandon'") + 200,
    );
    expect(abandon).toContain('stepRef.current');
  });

  it('marks activation when onboarding seeds the first expense', () => {
    // Without this, onFirstSaveCheck fires first_transaction again on the next
    // save and double-counts the metric this change exists to move.
    expect(navigator).toContain("AsyncStorage.setItem('first_txn_logged', 'true')");
  });
});

describe('onboarding contract — handoff', () => {
  it('uses the storage keys web uses', () => {
    expect(welcome).toContain(`'${contract.HANDOFF_KEYS.seen}'`);
    expect(welcome).toContain(`'${contract.HANDOFF_KEYS.intent}'`);
    expect(welcome).toContain(`'${contract.HANDOFF_KEYS.currency}'`);
  });

  it('offers the same four intents as web', () => {
    contract.INTENTS.forEach((intent) => {
      expect(welcome).toContain(`'${intent}'`);
    });
  });
});

describe('onboarding contract — versioning', () => {
  it('pins the version both repos must agree on', () => {
    // The tripwire for the gap a mirrored contract cannot close on its own:
    // two repos, two toolchains, no shared package. A different number on the
    // other side means one was edited alone.
    expect(contract.CONTRACT_VERSION).toBe(1);
  });
});
