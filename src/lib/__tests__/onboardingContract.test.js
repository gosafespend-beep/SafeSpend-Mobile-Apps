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
const sequence = require('../onboardingSteps');

const src = (rel) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');
const screen = src('screens/OnboardingScreen.js');
const welcome = src('screens/WelcomeScreen.js');
const navigator = src('navigation/RootNavigator.js');

describe('onboarding contract — steps', () => {
  it('implements every step the contract declares', () => {
    // The screen renders by id, so each contract step must have a case.
    contract.STEPS_FULL.forEach((step) => {
      expect(screen).toContain(`case '${step}':`);
    });
  });

  it('defines the same sequence the contract does', () => {
    expect(sequence.STEP_DEFS.map((s) => s.id)).toEqual([...contract.STEPS_FULL]);
  });

  it('ends on the first expense, not on a congratulation', () => {
    // Both flows used to hand over a dashboard and hope. 34 of 37 accounts
    // have never recorded a transaction.
    const last = contract.STEPS_FULL[contract.STEPS_FULL.length - 1];
    expect(last).toBe('first-what');
    expect(contract.STEPS_FULL).toContain('first-amount');
    expect(screen).toContain("case 'first-amount':");
  });

  it('keeps Alerts after the Reveal', () => {
    // Asking for notification permission before the user has anything to be
    // notified about is the weakest possible moment to ask.
    const steps = contract.STEPS_FULL;
    expect(steps.indexOf('alerts')).toBeGreaterThan(steps.indexOf('reveal'));
    // And it is the only mobile-only screen, per the platform split.
    expect(sequence.STEP_DEFS.filter((x) => x.platform).map((x) => x.id)).toEqual(['alerts']);
  });

  it('asks for income, which is what the product computes from', () => {
    expect(contract.REQUIRED_FIELDS.map((f) => f.field)).toContain('income');
    expect(screen).toContain("case 'income':");
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
    expect(contract.CONTRACT_VERSION).toBe(3);
  });
});

describe('onboarding contract — feel', () => {
  it('uses the durations the theme already defines', () => {
    // Same numbers as the web mirror. "slow" must mean 420ms on both surfaces
    // or they cannot converge on feel even once steps and copy agree.
    expect(contract.MOTION_DURATIONS.slow).toBe(420);
    expect(contract.MOTION_DURATIONS.celebrate).toBe(700);
  });

  it('counts the Safe-to-Spend figure up rather than printing it', () => {
    // The peak moment of the flow was static text while AnimatedNumber sat
    // unused in the same repo.
    expect(screen).toContain('<AnimatedNumber');
    expect(screen).toContain('reveal.availableToSpend');
  });

  it('fills the progress bar instead of jumping it', () => {
    expect(screen).toContain('useAnimatedProgress');
  });

  it('is felt at the two moments that matter', () => {
    // impact when the figure arrives; success only for something achieved.
    expect(screen).toContain('haptics.impact()');
    expect(screen).toContain('haptics.success()');
    expect(screen).toContain('celebrate(');
  });

  it('never celebrates a shortfall', () => {
    /*
     * Not a preference. A delight pass adds glow and bounce everywhere without
     * noticing, and sparkling at someone while telling them they cannot cover
     * rent loses them for good. Two mechanisms now carry it: the haptic on the
     * Reveal is impact and never success, and the mascot shown there is chosen
     * from the RESULT rather than the screen.
     */
    expect(contract.NO_CELEBRATION_ON).toBe('danger');
    const revealHaptic = screen.slice(
      screen.indexOf("step.id === 'reveal'"),
      screen.indexOf("step.id === 'reveal'") + 140,
    );
    expect(revealHaptic).toContain('haptics.impact()');
    expect(revealHaptic).not.toContain('haptics.success()');

    // scene-shield is the celebratory render — grinning, coins in orbit. A
    // shortfall must get the steady one instead.
    const variant = screen.split(/\r?\n/).find((l) => l.indexOf('const sceneVariant') === 0 || l.includes('sceneVariant ='));
    expect(variant).toBeTruthy();
    expect(variant).toContain("'danger'");
    expect(variant).toContain("'steady'");
  });
});

describe('onboarding — mascot', () => {
  /*
   * The artwork is PNG here and WebP on web, on purpose: React Native decodes
   * WebP on Android but not on iOS without an extra image library, and there is
   * no expo-image dependency in this project. A WebP set would have looked
   * right in review and rendered nothing on every iPhone — so this test exists
   * to stop someone "unifying" the formats later and shipping a blank flow.
   */
  const scene = src('components/OnboardingScene.js');
  const assetDir = path.resolve(__dirname, '..', '..', '..', 'assets', 'mascot');

  it('ships an image for every screen the flow can reach', () => {
    const referenced = [...scene.matchAll(/mascot\/([a-z-]+)\.png/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(10);
    new Set(referenced).forEach((name) => {
      expect(fs.existsSync(path.join(assetDir, `${name}.png`))).toBe(true);
    });
  });

  it('covers every step id, so no screen silently loses its picture', () => {
    const mapped = new Set([...scene.matchAll(/'?([a-z-]+)'?:\s*require/g)].map((m) => m[1]));
    sequence.STEP_DEFS.forEach((s) => {
      // 'reveal' resolves through the state map instead, by design.
      if (s.id === 'reveal') return;
      expect(mapped.has(s.id)).toBe(true);
    });
  });

  it('uses PNG, not WebP', () => {
    expect(scene).not.toMatch(/\.webp/);
  });
});

describe('onboarding — chapters', () => {
  it('gives every step a chapter, so the progress bar can segment', () => {
    sequence.STEP_DEFS.forEach((s) => {
      expect(typeof s.chapter).toBe('number');
      expect(s.chapter).toBeLessThan(sequence.CHAPTERS.length);
    });
  });

  it('runs the chapters in order and uses all of them', () => {
    const seen = sequence.STEP_DEFS.map((s) => s.chapter);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(sequence.CHAPTERS.length);
  });

  it('gives every question screen a subtitle', () => {
    // Nine screens had none, which left the heading floating and lost the one
    // line that makes a question feel considered rather than interrogative.
    sequence.STEP_DEFS.forEach((s) => {
      if (s.kind === 'compute' || s.kind === 'reveal') return;
      expect(typeof s.subtitle).toBe('string');
      expect(s.subtitle.length).toBeGreaterThan(0);
    });
  });

  it('does not promise a screen count the forks can falsify', () => {
    const intro = sequence.STEP_DEFS.find((s) => s.id === 'intro');
    expect(intro.subtitle).not.toMatch(/\b(six|few|three|five)\b/i);
  });
});
