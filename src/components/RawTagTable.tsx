import React, { useState, useMemo } from 'react';
import type { ParsedPhotoData } from '../types/exif';
import { Search, Download, Copy, Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RawTagTableProps {
  photo: ParsedPhotoData;
}

export const RawTagTable: React.FC<RawTagTableProps> = ({ photo }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const rawTags = photo.rawTags;
  const ai = photo.aiGeneration;

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

      {ai?.detected && (
        <section className="overflow-hidden rounded-xl border border-fuchsia-400/35 bg-fuchsia-500/5" aria-labelledby="ai-metadata-title">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-fuchsia-400/20 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-fuchsia-300" />
                <h4 id="ai-metadata-title" className="font-serif text-base font-bold text-foreground">{t('raw.ai.title')}</h4>
              </div>
              <p className="mt-1 font-sans text-xs text-muted-foreground">{t('raw.ai.unverified')}</p>
            </div>
            <span className="border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-1 font-mono text-[10px] uppercase text-fuchsia-200">
              {ai.generatorLabel}
            </span>
          </div>

          <div className="space-y-4 p-4">
            {ai.positivePrompt && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h5 className="font-sans text-[11px] font-semibold uppercase text-fuchsia-200">{t('raw.ai.positivePrompt')}</h5>
                  <button onClick={() => handleCopyTag('ai-positive', ai.positivePrompt!)} className="p-1 text-muted-foreground hover:text-foreground" title={t('raw.copyTag')}>
                    {copiedKey === 'ai-positive' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="whitespace-pre-wrap border-l border-fuchsia-400/30 pl-3 font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">{ai.positivePrompt}</p>
              </div>
            )}

            {ai.negativePrompt && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h5 className="font-sans text-[11px] font-semibold uppercase text-rose-300">{t('raw.ai.negativePrompt')}</h5>
                  <button onClick={() => handleCopyTag('ai-negative', ai.negativePrompt!)} className="p-1 text-muted-foreground hover:text-foreground" title={t('raw.copyTag')}>
                    {copiedKey === 'ai-negative' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="whitespace-pre-wrap border-l border-rose-400/30 pl-3 font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">{ai.negativePrompt}</p>
              </div>
            )}

            {!ai.positivePrompt && ai.promptTexts.length > 0 && (
              <div>
                <h5 className="mb-2 font-sans text-[11px] font-semibold uppercase text-fuchsia-200">{t('raw.ai.promptTexts')}</h5>
                <div className="space-y-2">
                  {ai.promptTexts.map((prompt, index) => (
                    <p key={`${index}-${prompt}`} className="whitespace-pre-wrap border-l border-fuchsia-400/30 pl-3 font-mono text-xs text-foreground [overflow-wrap:anywhere]">{prompt}</p>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(ai.parameters).length > 0 && (
              <div>
                <h5 className="mb-2 font-sans text-[11px] font-semibold uppercase text-fuchsia-200">{t('raw.ai.parameters')}</h5>
                <dl className="grid grid-cols-1 border-l border-t border-border sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(ai.parameters).map(([key, value]) => (
                    <div key={key} className="border-b border-r border-border p-2">
                      <dt className="font-mono text-[10px] text-muted-foreground">{key}</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-foreground">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {(['promptGraph', 'workflow'] as const).map((key) => ai[key] !== undefined && (
              <details key={key} className="border border-border bg-background/30">
                <summary className="cursor-pointer px-3 py-2 font-sans text-xs font-semibold text-foreground">
                  {key === 'promptGraph' ? t('raw.ai.promptGraph') : t('raw.ai.workflow')}
                </summary>
                <pre className="max-h-72 overflow-auto border-t border-border p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{JSON.stringify(ai[key], null, 2)}</pre>
              </details>
            ))}

            <div className="flex flex-wrap gap-2">
              {ai.sources.map((source) => (
                <span key={`${source.container}-${source.key}`} className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                  {source.container} · {source.key}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

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
