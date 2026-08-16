import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { toLocalISODate } from '../lib/date';

/**
 * Global time period used across Dashboard, Transactions, Budget and Reports.
 * mode: 'month' | 'year' | 'all'. Provides ISO bounds [start, end) for queries,
 * a human label, and prev/next navigation.
 */
const PeriodContext = createContext(undefined);

const iso = toLocalISODate;

export function PeriodProvider({ children }) {
  const now = new Date();
  const [mode, setMode] = useState('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11

  const go = useCallback((dir) => {
    if (mode === 'year') {
      setYear((y) => y + dir);
      return;
    }
    if (mode === 'month') {
      setMonth((m) => {
        let nm = m + dir;
        if (nm < 0) { nm = 11; setYear((y) => y - 1); }
        else if (nm > 11) { nm = 0; setYear((y) => y + 1); }
        return nm;
      });
    }
  }, [mode]);

  const value = useMemo(() => {
    let start;
    let end;
    let label;
    if (mode === 'all') {
      start = new Date(2000, 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
      label = 'All time';
    } else if (mode === 'year') {
      start = new Date(year, 0, 1);
      end = new Date(year + 1, 0, 1);
      label = String(year);
    } else {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 1);
      label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(start);
    }
    const isCurrent = mode === 'month' && year === now.getFullYear() && month === now.getMonth();
    return {
      mode, setMode, year, month,
      start: iso(start), end: iso(end), label,
      next: () => go(1), prev: () => go(-1),
      canGoNext: mode !== 'all',
      isCurrent,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, year, month, go]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (ctx === undefined) throw new Error('usePeriod must be used within a PeriodProvider');
  return ctx;
}
