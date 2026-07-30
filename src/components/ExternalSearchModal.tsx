import { useEffect, useState } from 'react';
import { Check, Download, ExternalLink, Search, ShieldCheck, X } from 'lucide-react';
import type { ParsedPhotoData } from '../types/exif';
import { createSearchCopy, type SearchCopyResult } from '../utils/searchCopy';
import { securityConfig } from '../utils/securityConfig';
import { useTranslation } from 'react-i18next';

interface ExternalSearchModalProps {
  photo: ParsedPhotoData;
  onClose: () => void;
}

const services = [
  { name: 'Google Lens', url: 'https://lens.google.com/' },
  { name: 'TinEye', url: 'https://tineye.com/' },
];

function downloadSearchCopy(result: SearchCopyResult) {
  const link = document.createElement('a');
  link.href = result.url;
  link.download = result.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function ExternalSearchModal({ photo, onClose }: ExternalSearchModalProps) {
  const { t } = useTranslation();
  const [searchCopy, setSearchCopy] = useState<SearchCopyResult | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [consented, setConsented] = useState(false);
  const [preparedFor, setPreparedFor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!photo.previewUrl) {
      setPreparing(false);
      return () => { active = false; };
    }
    const image = new Image();
    image.src = photo.previewUrl;
    image.onload = async () => {
      try {
        const result = await createSearchCopy(image, photo.file);
        if (active) setSearchCopy(result);
        else URL.revokeObjectURL(result.url);
      } finally {
        if (active) setPreparing(false);
      }
    };
    image.onerror = () => setPreparing(false);
    return () => { active = false; };
  }, [photo]);

  useEffect(() => () => {
    if (searchCopy) URL.revokeObjectURL(searchCopy.url);
  }, [searchCopy]);

  const openService = (name: string, url: string) => {
    if (!consented || !searchCopy) return;
    downloadSearchCopy(searchCopy);
    window.open(url, '_blank', 'noopener,noreferrer');
    setPreparedFor(name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="external-search-title">
      <div className="w-full max-w-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-gold">
              <Search className="h-5 w-5" />
              <h2 id="external-search-title" className="font-serif text-lg font-bold text-foreground">{t('search.title')}</h2>
            </div>
            <p className="mt-1 font-sans text-xs leading-relaxed text-muted-foreground">
              {t('search.description')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground" aria-label={t('search.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 border-b border-border font-sans text-xs">
          <div className="border-r border-border py-4 pr-4">
            <span className="block text-[10px] uppercase text-muted-foreground">{t('search.original')}</span>
            <strong className="mt-1 block font-mono text-foreground">{photo.fileMetrics.sizeFormatted}</strong>
            <span className="mt-1 block text-muted-foreground">{t('search.originalNote')}</span>
          </div>
          <div className="py-4 pl-4">
            <span className="block text-[10px] uppercase text-muted-foreground">{t('search.copy')}</span>
            <strong className="mt-1 block font-mono text-foreground">
              {preparing ? t('search.preparing') : searchCopy ? `${(searchCopy.sizeBytes / 1024).toFixed(0)} KB JPEG` : t('search.unavailable')}
            </strong>
            <span className="mt-1 block text-emerald-400">
              {t('search.copyDetails', { dimension: securityConfig.maxSearchCopyDimension, quality: securityConfig.searchCopyJpegQualityPercent })}
            </span>
          </div>
        </div>

        <div className="my-4 flex gap-3 border border-amber-500/30 bg-amber-500/5 p-3 font-sans text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p>
            {t('search.localNote')}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 border-b border-border pb-4 font-sans text-xs text-foreground">
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          <span>{t('search.consent')}</span>
        </label>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <button
              key={service.name}
              onClick={() => openService(service.name, service.url)}
              disabled={!consented || !searchCopy}
              className="flex min-h-11 items-center justify-between border border-border bg-background px-3 py-2 font-sans text-xs font-semibold text-foreground transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex items-center gap-2">
                {preparedFor === service.name ? <Check className="h-4 w-4 text-emerald-400" /> : <Download className="h-4 w-4" />}
                {preparedFor === service.name ? t('search.downloaded') : t('search.prepareFor', { service: service.name })}
              </span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
