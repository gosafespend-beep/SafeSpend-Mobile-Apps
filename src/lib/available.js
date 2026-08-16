// "Available / Safe to Spend" — how much the user can spend now without
// jeopardizing unpaid bills this month, expected savings-goal contributions,
// while crediting expected (not-yet-received) recurring income.
//
// available = liquidBalance + expectedIncome − unpaidBills − goalContributions
//
// Mirrors the web app's useAvailableBalance, simplified for mobile.

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function computeAvailableToSpend({
  liquidBalance = 0,
  bills = [],
  billStatuses = [],
  goals = [],
  recurring = [],
  avgDailySpend = 0, // trailing average daily spend → powers the "pace" intelligence
  now = new Date(),
}) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = new Date(year, month, now.getDate());
  const totalDays = daysInMonth(year, month);
  const daysRemaining = Math.max(1, totalDays - now.getDate() + 1); // includes today

  // 1. Unpaid bills remaining this month.
  const paidByBill = {};
  billStatuses.forEach((s) => { if (s.is_paid) paidByBill[s.bill_id] = true; });
  const unpaidBillsList = [];
  bills
    .filter((b) => b.is_active !== false)
    .forEach((b) => {
      if (paidByBill[b.id]) return;
      const dueDay = Math.min(Number(b.due_day || 1), daysInMonth(year, month));
      unpaidBillsList.push({ name: b.name, amount: Number(b.amount || 0), dueDate: new Date(year, month, dueDay) });
    });
  const unpaidBillsThisMonth = unpaidBillsList.reduce((s, b) => s + b.amount, 0);

  // 2. Expected (future, this-month, not-yet-received) recurring income.
  let expectedIncomeThisMonth = 0;
  const expectedIncomeList = [];
  recurring
    .filter((r) => r.type === 'income' && r.is_active !== false && r.next_due)
    .forEach((r) => {
      const due = new Date(r.next_due + 'T00:00:00');
      // Strictly future days only: income due *today* is auto-posted by
      // processDueRecurring on app open, so counting it as "expected" too would
      // double-count it for that day.
      if (due.getFullYear() === year && due.getMonth() === month && due > today) {
        const amt = Number(r.amount || 0);
        expectedIncomeThisMonth += amt;
        expectedIncomeList.push({ name: r.description || 'Income', amount: amt, dueDate: due });
      }
    });

  // 3. Goal contributions needed this month (amount / months remaining to deadline).
  let goalContributions = 0;
  goals.forEach((g) => {
    const target = Number(g.target_amount || 0);
    const current = Number(g.current_amount || 0);
    if (g.deadline && current < target) {
      const d = new Date(g.deadline + 'T00:00:00');
      const monthsRemaining = Math.max(1, (d.getFullYear() - year) * 12 + (d.getMonth() - month));
      goalContributions += (target - current) / monthsRemaining;
    }
  });

  const availableToSpend = liquidBalance + expectedIncomeThisMonth - unpaidBillsThisMonth - goalContributions;

  // 4. Pace intelligence — how much per day is safe, and whether the user's own
  // trailing spend rate is on track to fit inside what's available.
  const dailySafe = availableToSpend > 0 ? availableToSpend / daysRemaining : 0;
  const projectedVariableSpend = Math.max(0, avgDailySpend) * daysRemaining;
  const projectedLeftover = availableToSpend - projectedVariableSpend;
  const onPaceToOverspend = avgDailySpend > 0 && projectedLeftover < 0 && availableToSpend >= 0;

  // 5. Status — now pace-aware.
  const effective = liquidBalance + expectedIncomeThisMonth;
  const pct = effective > 0 ? (availableToSpend / effective) * 100 : 0;
  let status, statusMessage;
  if (availableToSpend < 0) {
    status = 'danger';
    statusMessage = 'Not enough for upcoming obligations';
  } else if (onPaceToOverspend) {
    status = 'caution';
    statusMessage = 'At your usual pace you’ll run short this month';
  } else if (pct < 20 || availableToSpend < 100) {
    status = 'caution';
    statusMessage = 'Limited room — budget carefully';
  } else {
    status = 'safe';
    statusMessage = expectedIncomeThisMonth > 0 ? 'Healthy, with expected income factored in' : 'Healthy spending room';
  }

  const round = (n) => Math.round(n * 100) / 100;
  return {
    availableToSpend: round(availableToSpend),
    liquidBalance: round(liquidBalance),
    unpaidBillsThisMonth: round(unpaidBillsThisMonth),
    expectedIncomeThisMonth: round(expectedIncomeThisMonth),
    goalContributions: round(goalContributions),
    dailySafe: round(dailySafe),
    daysRemaining,
    projectedVariableSpend: round(projectedVariableSpend),
    projectedLeftover: round(projectedLeftover),
    onPaceToOverspend,
    avgDailySpend: round(avgDailySpend),
    status,
    statusMessage,
    unpaidBillsList,
    expectedIncomeList,
  };
}
