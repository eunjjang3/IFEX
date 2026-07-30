import { describe, expect, it, vi } from 'vitest';
import { createNominatimClient } from './nominatim';

describe('createNominatimClient', () => {
  it('serializes requests with at least one second between starts', async () => {
    let clock = 0;
    const starts: number[] = [];
    const waits: number[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      starts.push(clock);
      return new Response(JSON.stringify({ display_name: 'Seoul' }), { status: 200 });
    });
    const client = createNominatimClient({
      fetchImpl,
      now: () => clock,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        clock += milliseconds;
      },
    });

    const first = client(37.5665, 126.978);
    const second = client(35.1796, 129.0756);

    await expect(first).resolves.toBe('Seoul');
    await expect(second).resolves.toBe('Seoul');
    expect(starts).toEqual([0, 1_000]);
    expect(waits).toEqual([1_000]);
  });

  it('sends an identifying browser referrer policy and bounded response data', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      display_name: `  ${'x'.repeat(5_000)}  `,
    }), { status: 200 }));
    const client = createNominatimClient({ fetchImpl });

    const address = await client(37.5, 127);

    expect(address).toHaveLength(4_096);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('format=jsonv2');
    expect(String(url)).toContain('addressdetails=0');
    expect(init).toMatchObject({
      headers: { Accept: 'application/json' },
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
  });

  it('rejects non-finite coordinates before using the network', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response());
    const client = createNominatimClient({ fetchImpl });

    await expect(client(Number.NaN, 127)).rejects.toThrow('finite numbers');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
