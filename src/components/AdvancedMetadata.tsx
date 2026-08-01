import React from 'react';
import type { ParsedPhotoData } from '../types/exif';
import { FileCode, Tag, Palette, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AdvancedMetadataProps {
  photo: ParsedPhotoData;
}

export const AdvancedMetadata: React.FC<AdvancedMetadataProps> = ({ photo }) => {
  const { t } = useTranslation();
  const { advanced } = photo;
  const iptc = advanced.iptc;
  const xmp = advanced.xmp;
  const icc = advanced.iccProfile;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-serif text-xl font-bold tracking-tight text-foreground">
          {t('advanced.title')}
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* IPTC Segment */}
        <div className="rounded-xl border border-border bg-card/50 p-4 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-serif text-sm font-bold text-foreground">{t('advanced.iptcTitle')}</h4>
              <span className="font-mono text-[10px] text-muted-foreground">{t('advanced.iptcSubtitle')}</span>
            </div>
          </div>

          <div className="mt-3 space-y-2.5 font-sans text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('advanced.photographer')}</span>
              <span className="font-mono font-medium text-foreground">{iptc?.byline || t('advanced.notSet')}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('advanced.copyright')}</span>
              <span className="font-mono font-medium text-foreground">{iptc?.copyright || t('advanced.notSet')}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('advanced.caption')}</span>
              <span className="font-mono text-muted-foreground italic">{iptc?.caption || t('advanced.noCaption')}</span>
            </div>
            {iptc?.keywords && iptc.keywords.length > 0 && (
              <div>
                <span className="text-muted-foreground block text-[11px] mb-1">{t('advanced.keywords')}</span>
                <div className="flex flex-wrap gap-1">
                  {iptc.keywords.map((kw, i) => (
                    <span key={i} className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-gold">
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* XMP Segment */}
        <div className="rounded-xl border border-border bg-card/50 p-4 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <FileCode className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-serif text-sm font-bold text-foreground">{t('advanced.xmpTitle')}</h4>
              <span className="font-mono text-[10px] text-muted-foreground">{t('advanced.xmpSubtitle')}</span>
            </div>
          </div>

          <div className="mt-3 space-y-2.5 font-sans text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('advanced.creatorSoftware')}</span>
              <span className="font-mono font-medium text-cyan-300">{xmp?.creatorTool || photo.rawTags.Software || t('advanced.directExport')}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('advanced.userRating')}</span>
              <span className="font-mono font-medium text-foreground">{xmp?.rating ? t('advanced.stars', { count: xmp.rating }) : t('advanced.unrated')}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">{t('advanced.adobeFootprint')}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {xmp?.creatorTool?.toLowerCase().includes('lightroom') || xmp?.creatorTool?.toLowerCase().includes('photoshop')
                  ? t('advanced.adobeDetected')
                  : t('advanced.adobeNotDetected')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Color Profile & Embedded Thumbnail Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ICC Color Profile */}
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-serif text-sm font-bold text-foreground">{t('advanced.iccTitle')}</h4>
              <span className="font-mono text-[10px] text-muted-foreground">{t('advanced.iccSubtitle')}</span>
            </div>
          </div>

          <div className="mt-3 space-y-2 font-sans text-xs">
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">{t('advanced.colorSpace')}</span>
              <span className="font-mono text-gold font-bold">{photo.fileMetrics.colorSpace}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span className="text-muted-foreground">{t('advanced.bitDepth')}</span>
              <span className="font-mono text-foreground font-semibold">
                {photo.fileMetrics.bitDepth !== undefined ? t('advanced.bitsPerChannel', { value: photo.fileMetrics.bitDepth }) : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">{t('advanced.profileDescriptor')}</span>
              <span className="font-mono text-foreground">{icc?.profileName || 'sRGB IEC61966-2.1'}</span>
            </div>
          </div>
        </div>

        {/* Embedded Thumbnail preview */}
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-serif text-sm font-bold text-foreground">{t('advanced.thumbnailTitle')}</h4>
              <span className="font-mono text-[10px] text-muted-foreground">{t('advanced.thumbnailSubtitle')}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4">
            {advanced.embeddedThumbnailUrl ? (
              <>
                <img
                  src={advanced.embeddedThumbnailUrl}
                  alt={t('advanced.thumbnailAlt')}
                  className="h-20 w-auto rounded border border-border object-contain bg-black"
                />
                <div className="font-sans text-xs text-muted-foreground">
                  <span className="text-emerald-400 font-semibold block">{t('advanced.embeddedPreview')}</span>
                  <span>{t('advanced.extractedPreview')}</span>
                </div>
              </>
            ) : (
              <div className="font-sans text-xs text-muted-foreground">
                <span>{t('advanced.noThumbnail')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
