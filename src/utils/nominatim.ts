const MIN_REQUEST_INTERVAL_MS = 1_000;
const MAX_DISPLAY_NAME_CHARS = 4_096;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface NominatimClientDependencies {
  fetchImpl?: FetchLike;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

interface NominatimResponse {
  display_name?: unknown;
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createNominatimClient({
  fetchImpl = globalThis.fetch.bind(globalThis),
  now = Date.now,
  wait = defaultWait,
}: NominatimClientDependencies = {}) {
  let queue: Promise<void> = Promise.resolve();
  let nextRequestAt = 0;

  return async (latitude: number, longitude: number): Promise<string | undefined> => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Nominatim coordinates must be finite numbers.');
    }

    const request = queue.then(async () => {
      const delay = Math.max(0, nextRequestAt - now());
      if (delay > 0) await wait(delay);
      nextRequestAt = now() + MIN_REQUEST_INTERVAL_MS;

      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.search = new URLSearchParams({
        format: 'jsonv2',
        lat: String(latitude),
        lon: String(longitude),
        addressdetails: '0',
      }).toString();
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        referrerPolicy: 'strict-origin-when-cross-origin',
      });
      if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);

      const body = await response.json() as NominatimResponse;
      if (typeof body.display_name !== 'string') return undefined;
      const displayName = body.display_name.trim();
      return displayName ? displayName.slice(0, MAX_DISPLAY_NAME_CHARS) : undefined;
    });

    queue = request.then(() => undefined, () => undefined);
    return request;
  };
}

export const fetchNominatimAddress = createNominatimClient();
