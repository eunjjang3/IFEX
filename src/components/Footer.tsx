import React from 'react';
import { useTranslation } from 'react-i18next';

export const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer className="app-chrome shrink-0 border-t border-border/80 bg-card/20 py-4 font-sans text-xs text-muted-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-3 text-[11px] sm:flex-row">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <span className="font-serif text-sm font-bold text-foreground">IFEX</span>
            <span className="hidden text-border sm:inline">|</span>
            <p className="text-center text-[11px] text-muted-foreground/80 sm:text-left">
              {t('footer.disclaimer')}
            </p>
          </div>
          <span className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>© {new Date().getFullYear()} IFEX. </span>
            <a className="underline underline-offset-2 hover:text-foreground" href={`${import.meta.env.BASE_URL}third-party-notices.txt`}>
              Third-party notices
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
};
