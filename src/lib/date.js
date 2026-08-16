// Local-time date helpers.
//
// The bug this fixes: `someDate.toISOString().split('T')[0]` yields a UTC
// YYYY-MM-DD. For a user east/west of UTC (e.g. Kenya, UTC+3) that can be the
// wrong calendar day — so month/period boundaries and "today" defaults land in
// the wrong day/month. These helpers format in the device's LOCAL time, which is
// what the user perceives as "today". (Full timestamps sent to timestamptz
// columns should still use toISOString — those are correctly UTC.)

/** Device-local YYYY-MM-DD for a Date (defaults to now). */
export function toLocalISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today, device-local, as YYYY-MM-DD. */
export function todayISO() {
  return toLocalISODate(new Date());
}
