import { lazy, Suspense, useState } from 'react';
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, Copy, Cpu, ExternalLink,
  FileCheck2, FileCode2, Fingerprint, History, Search, ShieldCheck,
} from 'lucide-react';
import type { ParsedPhotoData } from '../types/exif';
import type { FindingState, ForensicFinding } from '../types/forensics';
import { useTranslation } from 'react-i18next';

interface FileOriginReportProps { photo: ParsedPhotoData; }

const ExternalSearchModal = lazy(() => import('./ExternalSearchModal').then((module) => ({ default: module.ExternalSearchModal })));

const stateColors: Record<FindingState, string> = {
  observed: 'text-cyan-300',
  consistent: 'text-emerald-400',
  suspicious: 'text-amber-400',
  inconclusive: 'text-muted-foreground',
  unsupported: 'text-muted-foreground',
};

function FindingIcon({ state }: { state: FindingState }) {
  if (state === 'consistent') return <ShieldCheck className="h-4 w-4 text-emerald-400" />;
  if (state === 'suspicious') return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <FileCheck2 className="h-4 w-4 text-gold" />;
}

function FindingRow({ finding }: { finding: ForensicFinding }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hasObservableEvidence = finding.state !== 'inconclusive' && finding.state !== 'unsupported' && finding.evidence.length > 0;
  return (
    <div className="border-b border-border/70 py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5"><FindingIcon state={finding.state} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-sans text-sm font-semibold text-foreground">{finding.title}</h4>
            <span className={`font-mono text-[10px] uppercase ${stateColors[finding.state]}`}>{t(`origin.state.${finding.state}`)}</span>
          </div>
          <p className="mt-1 font-sans text-xs leading-relaxed text-muted-foreground">{finding.summary}</p>
          {hasObservableEvidence && (
            <button onClick={() => setExpanded((value) => !value)} className="mt-2 flex items-center gap-1 font-sans text-[11px] text-gold hover:text-foreground">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? t('origin.hideEvidence') : t('origin.showEvidence')}
            </button>
          )}
          {hasObservableEvidence && expanded && (
            <div className="mt-3 border-l border-border pl-3 font-sans text-[11px] leading-relaxed">
              <span className="font-semibold text-foreground">{t('origin.evidence')}</span>
              {finding.evidence.map((item) => <p key={item} className="mt-1 break-all text-muted-foreground">{item}</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileOriginReport({ photo }: FileOriginReportProps) {
  const { t } = useTranslation();
  const { fileOrigin } = photo;
  const [copied, setCopied] = useState(false);
  const [expertMode, setExpertMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const aiDetected = fileOrigin.c2pa.aiGenerated || fileOrigin.c2pa.aiEdited || fileOrigin.aiMetadataDetected;

  const copyHash = async () => {
    await navigator.clipboard.writeText(fileOrigin.sha256);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-gold" />
            <h3 className="font-serif text-xl font-bold text-foreground">{t('origin.title')}</h3>
          </div>
        </div>
        <button onClick={() => setSearchOpen(true)} className="flex shrink-0 items-center justify-center gap-2 border-b border-gold/40 py-1 font-sans text-xs font-semibold text-gold hover:border-gold hover:text-foreground">
          <Search className="h-4 w-4" /> {t('origin.reverseSearch')}
        </button>
      </div>

      <div className="grid grid-cols-1 border-y border-border sm:grid-cols-3">
        <div className="border-b border-border p-3 sm:border-b-0 sm:border-r">
          <span className="font-sans text-[10px] uppercase text-muted-foreground">{t('origin.binaryFormat')}</span>
          <strong className="mt-1 block font-mono text-sm text-foreground">{fileOrigin.fileType.formatName}</strong>
          <span className={`mt-1 block font-sans text-[11px] ${fileOrigin.fileType.extensionMatches && fileOrigin.fileType.mimeMatches ? 'text-emerald-400' : 'text-amber-400'}`}>
            {fileOrigin.fileType.extensionMatches && fileOrigin.fileType.mimeMatches ? t('origin.signatureMatches') : t('origin.identityMismatch')}
          </span>
        </div>
        <div className="border-b border-border p-3 sm:border-b-0 sm:border-r">
          <span className="font-sans text-[10px] uppercase text-muted-foreground">{t('origin.contentCredentials')}</span>
          <strong className="mt-1 block font-mono text-sm uppercase text-foreground">{fileOrigin.c2pa.state}</strong>
          <span className="mt-1 block truncate font-sans text-[11px] text-muted-foreground" title={fileOrigin.c2pa.claimGenerator}>{fileOrigin.c2pa.claimGenerator || t('origin.noVerifiedGenerator')}</span>
        </div>
        <div className="p-3">
          <span className="font-sans text-[10px] uppercase text-muted-foreground">{t('origin.aiProvenance')}</span>
          <strong className={`mt-1 block font-mono text-sm ${aiDetected ? 'text-amber-400' : 'text-foreground'}`}>
            {fileOrigin.c2pa.aiGenerated
              ? t('origin.declaredGenerated')
              : fileOrigin.c2pa.aiEdited
                ? t('origin.declaredAssisted')
                : fileOrigin.aiMetadataDetected
                  ? t('origin.metadataGenerated', { generator: fileOrigin.aiMetadataGenerator || 'AI generator' })
                  : t('origin.noSignal')}
          </strong>
        </div>
      </div>

      <div className="border-y border-border py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="font-sans text-[10px] uppercase text-muted-foreground">{t('origin.fileIdentity')}</span>
            <p className="mt-1 truncate font-mono text-xs text-foreground" title={fileOrigin.sha256}>{fileOrigin.sha256}</p>
          </div>
          <button onClick={copyHash} className="shrink-0 p-2 text-muted-foreground hover:text-gold" title={t('origin.copySha')}>
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <section>
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <History className="h-4 w-4 text-gold" />
          <h4 className="font-serif text-base font-bold text-foreground">{t('origin.findings')}</h4>
        </div>
        {fileOrigin.findings.map((finding) => <FindingRow key={finding.id} finding={finding} />)}
      </section>

      <section>
        <button onClick={() => setExpertMode((value) => !value)} className="flex w-full items-center justify-between border-y border-border py-3 text-left">
          <span className="flex items-center gap-2 font-sans text-xs font-semibold text-foreground"><Cpu className="h-4 w-4 text-gold" /> {t('origin.expertData')}</span>
          {expertMode ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {expertMode && (
          <div className="space-y-5 pt-4">
            <div>
              <h5 className="font-sans text-xs font-semibold text-foreground">{t('origin.metadataNamespaces')}</h5>
              <div className="mt-2 grid grid-cols-4 border border-border font-mono text-xs">
                {(['exif', 'iptc', 'xmp', 'icc'] as const).map((name) => (
                  <div key={name} className="border-r border-border p-2 text-center last:border-r-0">
                    <span className="block uppercase text-muted-foreground">{name}</span>
                    <strong className="mt-1 block text-foreground">{fileOrigin.metadata[name]}</strong>
                  </div>
                ))}
              </div>
            </div>

            {fileOrigin.jpeg && (
              <>
                <div>
                  <h5 className="flex items-center gap-2 font-sans text-xs font-semibold text-foreground"><FileCode2 className="h-4 w-4 text-gold" /> {t('origin.jpegMarkerMap')}</h5>
                  <div className="mt-2 max-h-56 overflow-auto border border-border">
                    <table className="w-full text-left font-mono text-[10px]">
                      <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2">{t('origin.offset')}</th><th className="p-2">{t('origin.marker')}</th><th className="p-2">{t('origin.segment')}</th><th className="p-2 text-right">{t('origin.bytes')}</th></tr></thead>
                      <tbody className="divide-y divide-border/60">
                        {fileOrigin.jpeg.segments.map((segment) => (
                          <tr key={`${segment.offset}-${segment.marker}`}><td className="p-2">0x{segment.offset.toString(16)}</td><td className="p-2 text-gold">{segment.marker}</td><td className="p-2 text-foreground">{segment.identifier || segment.name}</td><td className="p-2 text-right">{segment.length}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h5 className="font-sans text-xs font-semibold text-foreground">{t('origin.quantizationTables')}</h5>
                  <div className="mt-2 space-y-3">
                    {fileOrigin.jpeg.quantizationTables.map((table) => (
                      <div key={table.id}>
                        <span className="font-mono text-[10px] text-muted-foreground">{t('origin.table', { id: table.id, precision: table.precision })}</span>
                        <div className="mt-1 grid grid-cols-8 border-l border-t border-border font-mono text-[9px] text-foreground">
                          {table.values.map((value, index) => <span key={index} className="border-b border-r border-border p-1 text-center">{value}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <a href="https://c2pa.org/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-sans text-[11px] text-muted-foreground hover:text-gold">
        {t('origin.aboutCredentials')} <ExternalLink className="h-3 w-3" />
      </a>

      {searchOpen && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/85 font-sans text-xs text-muted-foreground">{t('origin.preparingSearch')}</div>}>
          <ExternalSearchModal photo={photo} onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
