import { describe, expect, it } from 'vitest';
import { mapSettledWithConcurrency } from './asyncPool';

describe('mapSettledWithConcurrency', () => {
  it('limits concurrent work and preserves result order', async () => {
    let active = 0;
    let peak = 0;
    const results = await mapSettledWithConcurrency([30, 5, 10, 1], 2, async (delay, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index * 2;
    });

    expect(peak).toBe(2);
    expect(results).toEqual([
      { status: 'fulfilled', value: 0 },
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 4 },
      { status: 'fulfilled', value: 6 },
    ]);
  });

  it('contains per-item failures instead of rejecting the whole batch', async () => {
    const results = await mapSettledWithConcurrency(['ok', 'bad', 'still-ok'], 2, async (value) => {
      if (value === 'bad') throw new Error('broken');
      return value.toUpperCase();
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 'OK' });
    expect(results[1]).toEqual(expect.objectContaining({ status: 'rejected' }));
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'STILL-OK' });
  });
});
