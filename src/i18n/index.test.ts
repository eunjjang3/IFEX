import { describe, expect, it } from 'vitest';
import { isSupportedLanguage, languageStorageKey, readStoredLanguage, writeStoredLanguage } from './index';

describe('language preference', () => {
  it('accepts only supported language codes', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('ko')).toBe(true);
    expect(isSupportedLanguage('ja')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
  });

  it('reads and writes the shared storage key', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeStoredLanguage('ja', storage);
    expect(values.get(languageStorageKey)).toBe('ja');
    expect(readStoredLanguage(storage)).toBe('ja');
  });

  it('ignores invalid values and unavailable storage', () => {
    expect(readStoredLanguage({ getItem: () => 'de' })).toBeNull();
    expect(readStoredLanguage({ getItem: () => { throw new Error('blocked'); } })).toBeNull();
    expect(() => writeStoredLanguage('ko', { setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});
