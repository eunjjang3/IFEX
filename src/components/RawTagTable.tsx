import React, { useState, useMemo } from 'react';
import type { ParsedPhotoData } from '../types/exif';
import { Search, Download, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RawTagTableProps {
  photo: ParsedPhotoData;
}

export const RawTagTable: React.FC<RawTagTableProps> = ({ photo }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const rawTags = photo.rawTags;

  const tagEntries = useMemo(() => {
    return Object.entries(rawTags).map(([key, val]) => {
      let formattedVal = '';
      if (val instanceof Date) {
        formattedVal = val.toISOString();
      } else if (typeof val === 'object' && val !== null) {
        try {
          formattedVal = JSON.stringify(val);
        } catch {
          formattedVal = String(val);
        }
      } else {
        formattedVal = String(val);
      }
      return { key, val, formattedVal };
    });
  }, [rawTags]);

  const filteredTags = useMemo(() => {
    if (!searchTerm.trim()) return tagEntries;
    const term = searchTerm.toLowerCase();
    return tagEntries.filter(
      (tag) => tag.key.toLowerCase().includes(term) || tag.formattedVal.toLowerCase().includes(term)
    );
  }, [tagEntries, searchTerm]);

  const handleCopyTag = (key: string, val: string) => {
    navigator.clipboard.writeText(`${key}: ${val}`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(rawTags, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${photo.fileMetrics.name}_EXIF_Metadata.json`;
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-serif text-xl font-bold tracking-tight text-foreground">
            {t('raw.title')}
          </h3>
          <p className="font-sans text-xs text-muted-foreground">
            {t('raw.count', { count: tagEntries.length })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 font-sans text-xs font-semibold text-gold hover:bg-gold/20"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('raw.exportJson')}</span>
          </button>
        </div>
      </div>

      {photo.metadataLimit.truncated && (
        <div role="status" className="border border-amber-500/35 bg-amber-500/5 p-3 font-sans text-xs text-amber-200">
          {t('raw.limits', {
            count: photo.metadataLimit.retainedTagCount,
            omitted: photo.metadataLimit.omittedTagCount,
            truncated: photo.metadataLimit.truncatedValueCount,
            binary: photo.metadataLimit.summarizedBinaryValueCount,
          })}
        </div>
      )}

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('raw.searchPlaceholder')}
          className="w-full rounded-xl border border-border bg-card/60 py-2.5 pl-10 pr-4 font-sans text-xs text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none"
        />
      </div>

      {/* Tags Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card/40 shadow-sm">
        <div className="max-h-[500px] overflow-x-hidden overflow-y-auto">
          <table className="w-full table-fixed text-left font-sans text-xs">
            <colgroup>
              <col className="w-[32%]" />
              <col />
              <col className="w-12" />
            </colgroup>
            <thead className="sticky top-0 border-b border-border bg-card font-serif text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">{t('raw.key')}</th>
                <th className="px-4 py-3">{t('raw.value')}</th>
                <th className="px-2 py-3 text-right" aria-label={t('raw.actions')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {filteredTags.length > 0 ? (
                filteredTags.map((tag) => (
                  <tr key={tag.key} className="group hover:bg-background/40 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-gold [overflow-wrap:anywhere]">
                      {tag.key}
                    </td>
                    <td className="whitespace-pre-wrap px-4 py-2.5 text-foreground [overflow-wrap:anywhere]" title={tag.formattedVal}>
                      {tag.formattedVal}
                    </td>
                    <td className="px-2 py-2.5 text-right align-top">
                      <button
                        onClick={() => handleCopyTag(tag.key, tag.formattedVal)}
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        title={t('raw.copyTag')}
                      >
                        {copiedKey === tag.key ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground font-sans text-xs">
                    {t('raw.noMatch', { term: searchTerm })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
