import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readStoredLanguage, type SupportedLanguage, writeStoredLanguage } from '../i18n';

const languages = [
  { code: 'ko', nameKey: 'language.korean', glyph: '한' },
  { code: 'ja', nameKey: 'language.japanese', glyph: 'あ' },
  { code: 'en', nameKey: 'language.english', glyph: 'A' },
] as const;

function languageIndex(language: SupportedLanguage): number {
  return languages.findIndex((item) => item.code === language);
}

export function LanguageButton() {
  const { t, i18n } = useTranslation();
  const [hasPreference, setHasPreference] = useState(() => readStoredLanguage() !== null);
  const currentCode = (i18n.resolvedLanguage ?? i18n.language) as SupportedLanguage;
  const currentIndex = Math.max(0, languageIndex(currentCode));
  const language = languages[currentIndex];
  const nextLanguageIndex = hasPreference ? (currentIndex + 1) % languages.length : 0;
  const nextLanguage = languages[nextLanguageIndex];
  const currentName = hasPreference ? t(language.nameKey) : t('language.languages');
  const nextName = t(nextLanguage.nameKey);

  useEffect(() => {
    document.documentElement.lang = currentCode;
  }, [currentCode]);

  return (
    <button
      type="button"
      onClick={() => {
        writeStoredLanguage(nextLanguage.code);
        setHasPreference(true);
        void i18n.changeLanguage(nextLanguage.code);
      }}
      aria-label={t('language.switchLabel', { current: currentName, next: nextName })}
      title={t('language.switchTitle', { current: currentName, next: nextName })}
      className="flex h-6 w-6 items-center justify-center border border-border font-serif text-[11px] font-bold text-foreground transition-colors hover:border-gold hover:text-gold focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {hasPreference ? language.glyph : '文'}
    </button>
  );
}
