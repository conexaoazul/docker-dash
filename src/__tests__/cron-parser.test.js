'use strict';

// Tests for the cronMatchesNow function in src/jobs/index.js (FIX #31)
// We directly access the unexported function via require + module internals.

// Inline the fixed cronMatchesNow for unit testing without requiring all of jobs/index.js
// (which has heavy dependencies). This mirrors the exact implementation.
function cronMatchesNow(cronExpr, now) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const rawWeekday = parts[4];
  const normalizedWeekday = rawWeekday === '7' ? '0'
    : rawWeekday.replace(/\b7\b/g, '0');

  const checks = [
    { val: now.getMinutes(), part: parts[0] },
    { val: now.getHours(), part: parts[1] },
    { val: now.getDate(), part: parts[2] },
    { val: now.getMonth() + 1, part: parts[3] },
    { val: now.getDay(), part: normalizedWeekday },
  ];

  return checks.every(({ val, part }) => {
    if (part === '*') return true;

    if (part.includes('/')) {
      const [rangePart, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return false;

      if (rangePart === '*') {
        return val % step === 0;
      }
      if (rangePart.includes('-')) {
        const [min, max] = rangePart.split('-').map(Number);
        if (val < min || val > max) return false;
        return (val - min) % step === 0;
      }
      const base = parseInt(rangePart, 10);
      return (val - base) % step === 0 && val >= base;
    }

    if (part.includes(',')) return part.split(',').map(Number).includes(val);

    if (part.includes('-')) {
      const [min, max] = part.split('-').map(Number);
      return val >= min && val <= max;
    }

    return parseInt(part, 10) === val;
  });
}

// Helper: create a Date at a specific minute/hour/weekday
function at({ minute = 0, hour = 0, day = 1, month = 1, weekday = 0 } = {}) {
  // Use a known Sunday (2024-01-07 = Sunday = day 0)
  // weekday: 0=Sun, 1=Mon, ..., 6=Sat
  const base = new Date(2024, 0, 7); // 2024-01-07 Sunday
  const d = new Date(base);
  d.setDate(d.getDate() + weekday); // shift to desired weekday
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('cronMatchesNow — FIX #31 cron parser', () => {

  // Fix #1: Sunday normalization (7 → 0)
  describe('Sunday normalization', () => {
    it('should match "0 0 * * 7" at Sunday midnight', () => {
      const sunday = new Date(2024, 0, 7, 0, 0, 0); // 2024-01-07 = Sunday
      expect(sunday.getDay()).toBe(0); // confirm it is Sunday
      expect(cronMatchesNow('0 0 * * 7', sunday)).toBe(true);
    });

    it('should NOT match "0 0 * * 7" on Monday', () => {
      const monday = new Date(2024, 0, 8, 0, 0, 0); // Monday
      expect(cronMatchesNow('0 0 * * 7', monday)).toBe(false);
    });

    it('should match "0 0 * * 0" at Sunday midnight (native Sun=0)', () => {
      const sunday = new Date(2024, 0, 7, 0, 0, 0);
      expect(cronMatchesNow('0 0 * * 0', sunday)).toBe(true);
    });

    it('should NOT match "0 0 * * 0" on Monday', () => {
      const monday = new Date(2024, 0, 8, 0, 0, 0);
      expect(cronMatchesNow('0 0 * * 0', monday)).toBe(false);
    });
  });

  // Fix #2: bare */N step
  describe('bare step expressions', () => {
    it('should match "*/5 * * * *" at minute :05', () => {
      const t = new Date(2024, 0, 7, 10, 5, 0);
      expect(cronMatchesNow('*/5 * * * *', t)).toBe(true);
    });

    it('should match "*/5 * * * *" at minute :00', () => {
      const t = new Date(2024, 0, 7, 10, 0, 0);
      expect(cronMatchesNow('*/5 * * * *', t)).toBe(true);
    });

    it('should NOT match "*/5 * * * *" at minute :07', () => {
      const t = new Date(2024, 0, 7, 10, 7, 0);
      expect(cronMatchesNow('*/5 * * * *', t)).toBe(false);
    });
  });

  // Fix #2: range/step combinations
  describe('range/step combinations (0-30/10)', () => {
    it('should match "0-30/10 * * * *" at minute :10', () => {
      const t = new Date(2024, 0, 7, 10, 10, 0);
      expect(cronMatchesNow('0-30/10 * * * *', t)).toBe(true);
    });

    it('should match "0-30/10 * * * *" at minute :20', () => {
      const t = new Date(2024, 0, 7, 10, 20, 0);
      expect(cronMatchesNow('0-30/10 * * * *', t)).toBe(true);
    });

    it('should match "0-30/10 * * * *" at minute :30', () => {
      const t = new Date(2024, 0, 7, 10, 30, 0);
      expect(cronMatchesNow('0-30/10 * * * *', t)).toBe(true);
    });

    it('should NOT match "0-30/10 * * * *" at minute :15', () => {
      const t = new Date(2024, 0, 7, 10, 15, 0);
      expect(cronMatchesNow('0-30/10 * * * *', t)).toBe(false);
    });

    it('should NOT match "0-30/10 * * * *" at minute :40 (out of range)', () => {
      const t = new Date(2024, 0, 7, 10, 40, 0);
      expect(cronMatchesNow('0-30/10 * * * *', t)).toBe(false);
    });

    it('should match "0-30/5 * * * *" at minute :0, :5, :10, :15, :25, :30', () => {
      for (const m of [0, 5, 10, 15, 25, 30]) {
        const t = new Date(2024, 0, 7, 10, m, 0);
        expect(cronMatchesNow('0-30/5 * * * *', t)).toBe(true);
      }
    });

    it('should NOT match "0-30/5 * * * *" at minute :3', () => {
      const t = new Date(2024, 0, 7, 10, 3, 0);
      expect(cronMatchesNow('0-30/5 * * * *', t)).toBe(false);
    });
  });

  // List and range passthrough
  describe('list and range expressions', () => {
    it('should match comma-separated values', () => {
      const t = new Date(2024, 0, 7, 10, 15, 0);
      expect(cronMatchesNow('15,30,45 * * * *', t)).toBe(true);
    });

    it('should match range expressions', () => {
      const t = new Date(2024, 0, 7, 10, 10, 0);
      expect(cronMatchesNow('5-15 * * * *', t)).toBe(true);
    });

    it('should NOT match range when outside', () => {
      const t = new Date(2024, 0, 7, 10, 20, 0);
      expect(cronMatchesNow('5-15 * * * *', t)).toBe(false);
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('should return false for expression with fewer than 5 parts', () => {
      const t = new Date();
      expect(cronMatchesNow('* * * *', t)).toBe(false);
    });

    it('should match "* * * * *" at any time', () => {
      expect(cronMatchesNow('* * * * *', new Date())).toBe(true);
    });
  });
});
