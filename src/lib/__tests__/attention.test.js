const { buildAttention, ATTENTION_RULES_VERSION, DUE_SOON_DAYS, GOAL_HORIZON_DAYS } = require('../attention');

/**
 * The needs-attention rules.
 *
 * These matter more than most tests here because the feed is the only thing in
 * the product that speaks first. A rule that is subtly wrong does not throw —
 * it just tells someone their rent is fine when it is not, or nags them about
 * a bill they already paid until they stop trusting the bell.
 *
 * The web repo runs these same assertions against its copy of the rules.
 */

const on = (day) => new Date(2026, 5, day); // June 2026, mid-month work

const base = {
  bills: [],
  budgets: [],
  goals: [],
  emailVerified: true,
};

describe('attention — bills', () => {
  it('flags an unpaid bill whose day has passed', () => {
    const items = buildAttention({ ...base, today: on(15), bills: [{ id: 'b', name: 'Rent', dueDay: 10, isPaid: false }] });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('overdue');
    expect(items[0].title).toBe('Rent is overdue');
  });

  it('says nothing about a bill that is already paid', () => {
    // The bug this prevents is the worst kind: nagging someone about a thing
    // they have done, which teaches them the bell lies.
    const items = buildAttention({ ...base, today: on(15), bills: [{ id: 'b', name: 'Rent', dueDay: 10, isPaid: true }] });
    expect(items).toHaveLength(0);
  });

  it('warns about a bill due within the window but not beyond it', () => {
    const soon = buildAttention({ ...base, today: on(10), bills: [{ id: 'b', name: 'Rent', dueDay: 10 + DUE_SOON_DAYS, isPaid: false }] });
    expect(soon[0].type).toBe('due');

    const later = buildAttention({ ...base, today: on(10), bills: [{ id: 'b', name: 'Rent', dueDay: 10 + DUE_SOON_DAYS + 1, isPaid: false }] });
    expect(later).toHaveLength(0);
  });

  it('says "Due today" rather than "in 0 days"', () => {
    const items = buildAttention({ ...base, today: on(12), bills: [{ id: 'b', name: 'Rent', dueDay: 12, isPaid: false }] });
    expect(items[0].subtitle).toBe('Due today');
  });

  it('gets the ordinal right on the teens', () => {
    // 11th/12th/13th are the reason the helper exists at all.
    const items = buildAttention({ ...base, today: on(20), bills: [{ id: 'b', name: 'Rent', dueDay: 12, isPaid: false }] });
    expect(items[0].subtitle).toContain('the 12th');
  });
});

describe('attention — budgets', () => {
  it('flags a category over its limit', () => {
    const items = buildAttention({ ...base, budgets: [{ category: 'Dining', limit: 100, spent: 140 }] });
    expect(items[0].title).toBe('Over budget on Dining');
  });

  it('does not flag spending exactly to the limit', () => {
    // Landing on target is success, not a problem.
    const items = buildAttention({ ...base, budgets: [{ category: 'Dining', limit: 100, spent: 100 }] });
    expect(items).toHaveLength(0);
  });

  it('ignores categories with no budget set', () => {
    const items = buildAttention({ ...base, budgets: [{ category: 'Dining', limit: 0, spent: 500 }] });
    expect(items).toHaveLength(0);
  });
});

describe('attention — goals', () => {
  it('mentions a deadline inside the horizon', () => {
    const items = buildAttention({
      ...base, today: on(1),
      goals: [{ name: 'Trip', target: 1000, current: 200, deadline: '2026-06-10' }],
    });
    expect(items[0].type).toBe('goal');
  });

  it('stays quiet about a goal already met', () => {
    const items = buildAttention({
      ...base, today: on(1),
      goals: [{ name: 'Trip', target: 1000, current: 1000, deadline: '2026-06-10' }],
    });
    expect(items).toHaveLength(0);
  });

  it('stays quiet about a deadline beyond the horizon, and about goals with none', () => {
    const far = buildAttention({
      ...base, today: on(1),
      goals: [{ name: 'Trip', target: 1000, current: 0, deadline: `2026-07-${String(1 + GOAL_HORIZON_DAYS).padStart(2, '0')}` }],
    });
    expect(far).toHaveLength(0);

    const undated = buildAttention({ ...base, goals: [{ name: 'Trip', target: 1000, current: 0, deadline: null }] });
    expect(undated).toHaveLength(0);
  });
});

describe('attention — ordering', () => {
  it('puts overdue money above everything else and email last', () => {
    const items = buildAttention({
      today: on(15),
      bills: [
        { id: 'a', name: 'Soon', dueDay: 16, isPaid: false },
        { id: 'b', name: 'Late', dueDay: 2, isPaid: false },
      ],
      budgets: [{ category: 'Dining', limit: 10, spent: 99 }],
      goals: [{ name: 'Trip', target: 100, current: 0, deadline: '2026-06-20' }],
      emailVerified: false,
    });
    expect(items.map(i => i.type)).toEqual(['overdue', 'budget', 'due', 'goal', 'email']);
  });

  it('is empty when nothing is wrong', () => {
    expect(buildAttention({ ...base })).toHaveLength(0);
  });
});

describe('attention — contract', () => {
  it('pins a version the web mirror must match', () => {
    // Same tripwire as the onboarding contract: two repos, no shared package.
    expect(ATTENTION_RULES_VERSION).toBe(1);
  });

  it('gives every item somewhere to go', () => {
    // A feed that names a problem without offering the screen that fixes it is
    // a nag, not a feature.
    const items = buildAttention({
      today: on(15),
      bills: [{ id: 'b', name: 'Rent', dueDay: 2, isPaid: false }],
      budgets: [{ category: 'Dining', limit: 10, spent: 99 }],
      goals: [{ name: 'Trip', target: 100, current: 0, deadline: '2026-06-20' }],
      emailVerified: false,
    });
    for (const item of items) {
      // Fails loudly enough without a message: the item type is in the loop.
      expect(item.nav).toBeTruthy();
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.subtitle.length).toBeGreaterThan(0);
    }
  });
});
