import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

export const supportedLanguages = ['en', 'ko', 'ja'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];
export const languageStorageKey = 'ifex.preferredLanguage';

export function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value !== null && supportedLanguages.some((language) => language === value);
}

function browserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readStoredLanguage(storage: Pick<Storage, 'getItem'> | undefined = browserStorage()): SupportedLanguage | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(languageStorageKey);
    return isSupportedLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLanguage(language: SupportedLanguage, storage: Pick<Storage, 'setItem'> | undefined = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(languageStorageKey, language);
  } catch {
    // Language switching still works in memory when storage is unavailable.
  }
}

const initialLanguage = readStoredLanguage() ?? 'en';
if (typeof document !== 'undefined') document.documentElement.lang = initialLanguage;

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;
