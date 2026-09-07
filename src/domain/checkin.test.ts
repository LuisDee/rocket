import { describe, expect, it } from 'vitest';

import { checkInFromForm, recordCheckIn, SORENESS_LOCATIONS } from './checkin';
import { memoryStore } from './store-memory';

/**
 * The `/checkin` form's parsing, and the write path it shares with
 * `rocket_daily_checkin`.
 *
 * The form is the surface a half-asleep person taps at 06:00, so the cases that
 * matter are the ones where they touch almost nothing.
 */

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** The form as rendered: every soreness row defaulted to zero, nothing else. */
function untouched(): FormData {
  return form(
    Object.fromEntries(
      SORENESS_LOCATIONS.map((location) => [`soreness.${location}`, '0']),
    ),
  );
}

describe('parsing the form', () => {
  it('omits a soreness row left on zero rather than storing seven zeroes', () => {
    expect(checkInFromForm(untouched()).soreness).toBeUndefined();
  });

  it('keeps only the places that actually hurt', () => {
    const data = untouched();
    data.set('soreness.calf', '3');
    data.set('soreness.hip', '1');

    expect(checkInFromForm(data).soreness).toEqual([
      { location: 'calf', severity: 3 },
      { location: 'hip', severity: 1 },
    ]);
  });

  it('omits a blank field instead of reading it as zero', () => {
    // A stored zero is the WORST possible reading; an omitted term is neutral.
    // Submitting the form untouched must not record a red morning.
    const parsed = checkInFromForm(form({ sleep: '', rpe_yesterday: '' }));
    expect(parsed.sleep).toBeUndefined();
    expect(parsed.rpe_yesterday).toBeUndefined();
  });

  it('trims a note and drops a whitespace-only one', () => {
    expect(checkInFromForm(form({ note: '  calf tight  ' })).note).toBe(
      'calf tight',
    );
    expect(checkInFromForm(form({ note: '   ' })).note).toBeUndefined();
  });

  it('rejects a value outside its scale rather than clamping it silently', () => {
    expect(() => checkInFromForm(form({ rpe_yesterday: '11' }))).toThrow();
  });

  it('reads a half-hour of sleep', () => {
    expect(checkInFromForm(form({ sleep: '7.5' })).sleep).toBe(7.5);
  });
});

describe('the shared write path', () => {
  it('records the row and scores it in one call', async () => {
    const store = memoryStore();
    const { checkIn, readiness } = await recordCheckIn(
      store,
      checkInFromForm(form({ sleep: '8', motivation: '4' })),
      '2026-09-14',
    );

    expect(store.rows.checkIns).toHaveLength(1);
    expect(checkIn.localDate).toBe('2026-09-14');
    expect(readiness.termsUsed.sort()).toEqual(['motivation', 'sleep']);
  });

  it('scores an untouched form on nothing rather than on seven zeroes', async () => {
    const { readiness } = await recordCheckIn(
      memoryStore(),
      checkInFromForm(untouched()),
      '2026-09-14',
    );

    expect(readiness.termsUsed).toEqual([]);
    expect(readiness.rationale).toContain('nothing to score');
  });
});
