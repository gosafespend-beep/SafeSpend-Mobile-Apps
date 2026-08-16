// Assembles a compact, privacy-conscious snapshot of the user's finances to send
// to the AI coach. Only aggregates leave the device — never raw transactions.
// Everything is already in the user's display currency.
export function buildCoachContext(d, { currency = 'USD', country = null, goals = [], debts = [] } = {}) {
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  if (!d) return { currency, country };
  const a = d.available || {};
  return {
    currency,
    country,
    safeToSpend: round(a.availableToSpend),
    dailySafe: round(a.dailySafe),
    daysLeftInMonth: a.daysRemaining ?? null,
    onPaceToOverspend: !!a.onPaceToOverspend,
    liquidBalance: round(a.liquidBalance),
    netWorth: round(d.balance),
    thisMonth: {
      income: round(d.totalIncome),
      expenses: round(d.totalExpenses),
      net: round(d.net),
      savingsRate: d.totalIncome > 0 ? Math.round((d.net / d.totalIncome) * 100) : null,
      lastMonthExpenses: round(d.prevMonthExpenses),
    },
    unpaidBillsTotal: round(a.unpaidBillsThisMonth),
    expectedIncome: round(a.expectedIncomeThisMonth),
    monthlyGoalContributions: round(a.goalContributions),
    topCategories: (d.categories || []).slice(0, 6).map((c) => ({ name: c.name, spent: round(c.total), budget: round(c.budget) })),
    upcomingBills: (a.unpaidBillsList || []).slice(0, 8).map((b) => ({ name: b.name, amount: round(b.amount) })),
    goals: (goals || []).slice(0, 6).map((g) => ({ name: g.name, saved: round(g.current), target: round(g.target), deadline: g.deadline || null })),
    debts: (debts || []).slice(0, 6).map((dt) => ({ name: dt.name, balance: round(dt.current) })),
  };
}

// Starter prompts shown before the first question.
export const COACH_SUGGESTIONS = [
  'Where did my money go this month?',
  'Can I afford a big purchase right now?',
  'How can I save more each month?',
  'Am I on track with my goals?',
];
