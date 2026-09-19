import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromBlob } = vi.hoisted(() => ({ fromBlob: vi.fn() }));
vi.mock('@contentauth/c2pa-web', () => ({
  createC2pa: vi.fn(async () => ({ reader: { fromBlob } })),
}));

import { verifyC2pa } from './c2paVerifier';

const file = new File(['image'], 'sample.jpg', { type: 'image/jpeg' });

beforeEach(() => { fromBlob.mockReset(); });

describe('C2PA reader integration', () => {
  it('reports absent credentials when the SDK returns no reader', async () => {
    fromBlob.mockResolvedValue(null);
    expect(await verifyC2pa(file, file.type)).toMatchObject({ state: 'absent' });
    expect(fromBlob).toHaveBeenCalledWith('image/jpeg', file);
  });

  it('distinguishes unsupported formats from other reader failures', async () => {
    fromBlob.mockRejectedValue(new Error('C2pa(UnsupportedType)'));
    expect(await verifyC2pa(file, 'image/bmp')).toMatchObject({ state: 'unsupported' });
    fromBlob.mockRejectedValue(new Error('corrupt manifest'));
    expect(await verifyC2pa(file, file.type)).toMatchObject({ state: 'error' });
  });

  it('frees readers after reporting credentials, including failed reads', async () => {
    const free = vi.fn();
    const manifestStore = vi.fn().mockResolvedValue({ validation_state: 'Valid', manifests: {} });
    fromBlob.mockResolvedValue({ manifestStore, free });
    expect(await verifyC2pa(file, file.type)).toMatchObject({ state: 'valid' });
    expect(free).toHaveBeenCalledOnce();
    manifestStore.mockRejectedValue(new Error('invalid manifest'));
    expect(await verifyC2pa(file, file.type)).toMatchObject({ state: 'error' });
    expect(free).toHaveBeenCalledTimes(2);
  });
});
