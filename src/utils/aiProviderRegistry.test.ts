import { describe, expect, it } from 'vitest';
import { identifyC2paProvider, identifyMetadataProvider, providerDatabaseVersion } from './aiProviderRegistry';

describe('AI provider registry', () => {
  it('identifies Tongyi Yunqi by exact and future service-prefixed producer codes', () => {
    expect(identifyMetadataProvider('001191330106MA2CFLDG4R10001')?.id).toBe('provider.cn.tongyi-yunqi');
    expect(identifyMetadataProvider('001191330106MA2CFLDG4R19999')?.id).toBe('provider.cn.tongyi-yunqi');
  });

  it('identifies Google from bounded C2PA implementation or signer signals', () => {
    expect(identifyC2paProvider(['Google C2PA Core Generator Library'])?.id).toBe('provider.google');
    expect(identifyC2paProvider(['Google LLC'])?.id).toBe('provider.google');
  });

  it('does not guess unknown providers', () => {
    expect(identifyMetadataProvider('Example Provider')).toBeUndefined();
    expect(identifyC2paProvider(['Unrelated Generator'])).toBeUndefined();
    expect(providerDatabaseVersion()).toBe(1);
  });
});
