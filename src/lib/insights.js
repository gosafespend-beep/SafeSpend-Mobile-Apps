// Generates plain-language money insights from the dashboard aggregate. Beyond
// the basics (savings rate, over-budget, dominance) it now uses trailing history
// and the pace signal for genuinely useful, personal callouts: on-pace-to-
// overspend, month-over-month trend, and category spikes vs. the user's own norm.
export function generateInsights(d) {
  if (!d) return [];
  const out = [];
  const {
    totalIncome = 0, totalExpenses = 0, net = 0, categories = [],
    prevMonthExpenses = 0, categoryBaselines = {}, available,
  } = d;

  // Pace / cash-flow — the most actionable, so it leads.
  if (available && available.onPaceToOverspend) {
    out.push({ type: 'warning', title: 'On pace to overspend', message: 'At your usual rate you’ll run short before month-end — ease off a little.' });
  }

  // Spent more than earned this period.
  if (totalIncome > 0 && net < 0) {
    out.push({ type: 'warning', title: 'Overspending', message: 'You spent more than you earned this period.' });
  }

  // Month-over-month spending trend.
  if (prevMonthExpenses > 0 && totalExpenses > 0) {
    const chg = ((totalExpenses - prevMonthExpenses) / prevMonthExpenses) * 100;
    if (chg >= 15) out.push({ type: 'info', title: 'Spending up', message: `You’re spending ${Math.round(chg)}% more than last month so far.` });
    else if (chg <= -15) out.push({ type: 'success', title: 'Spending down', message: `You’re spending ${Math.abs(Math.round(chg))}% less than last month — nice.` });
  }

  // Category spike vs the user's own trailing average.
  categories.forEach((cat) => {
    const base = categoryBaselines[cat.name];
    if (base && base > 5 && cat.total > base * 1.5) {
      const over = Math.round(((cat.total - base) / base) * 100);
      out.push({ type: 'info', title: `${cat.name} spike`, message: `${cat.name} is ${over}% above your usual monthly average.` });
    }
  });

  // Budgets.
  categories.forEach((cat) => {
    if (cat.budget > 0) {
      if (cat.total > cat.budget) out.push({ type: 'warning', title: `${cat.name} over budget`, message: `Spent over your ${cat.name} limit.` });
      else if (cat.total > 0.8 * cat.budget) out.push({ type: 'info', title: `${cat.name} near limit`, message: `You’re at ${Math.round((cat.total / cat.budget) * 100)}% of your ${cat.name} budget.` });
    }
  });

  // Savings rate.
  if (totalIncome > 0) {
    const rate = (net / totalIncome) * 100;
    if (rate >= 20) out.push({ type: 'success', title: 'Healthy savings', message: `You saved ${Math.round(rate)}% of your income — great work.` });
    else if (rate >= 0 && rate < 10) out.push({ type: 'info', title: 'Low savings', message: 'Aim to keep at least 10% of your income.' });
  } else if (totalExpenses > 0) {
    out.push({ type: 'tip', title: 'Log your income', message: 'Add income to see your true savings rate.' });
  }

  // Category dominance.
  if (totalExpenses > 0 && categories.length) {
    const top = categories[0];
    const share = (top.total / totalExpenses) * 100;
    if (share >= 40) out.push({ type: 'info', title: `${top.name} dominates`, message: `${top.name} is ${Math.round(share)}% of your spending.` });
  }

  // Dedup by title, surface warnings first, cap at 4.
  const seen = new Set();
  const rank = { warning: 0, info: 1, success: 2, tip: 3 };
  return out
    .filter((o) => (seen.has(o.title) ? false : (seen.add(o.title), true)))
    .sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9))
    .slice(0, 4);
}
