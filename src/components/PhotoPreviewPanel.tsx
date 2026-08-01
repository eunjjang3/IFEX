import React, { useState } from 'react';
import type { ParsedPhotoData } from '../types/exif';
import type { PixelOverlayMode, PixelOverlayState } from '../types/pixelForensics';
import { Maximize2, FileText, Calendar, HardDrive, Image as ImageIcon, Crop, Sparkles, Smartphone, Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PhotoPreviewPanelProps {
  photo: ParsedPhotoData;
  overlayMode: PixelOverlayMode;
  overlayOpacity: number;
  overlayState: PixelOverlayState;
}

export const PhotoPreviewPanel: React.FC<PhotoPreviewPanelProps> = ({ photo, overlayMode, overlayOpacity, overlayState }) => {
  const { t, i18n } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { fileMetrics, resolutionAnalysis, jpegQuality, classification } = photo;

  return (
    <div className="space-y-5">
      <div className="bg-background lg:sticky lg:top-0 lg:z-10 lg:pb-px">
        <div className="group relative flex max-h-[420px] w-full items-center justify-center overflow-hidden border border-border bg-black/40">
          <div className="relative grid min-h-48 max-h-[400px] max-w-full place-items-center">
            {photo.previewUrl ? (
              <img
                src={photo.previewUrl}
                alt={t('preview.imageAlt', { name: fileMetrics.name })}
                className="col-start-1 row-start-1 max-h-[400px] max-w-full object-contain"
              />
            ) : (
              <div className="px-8 text-center font-sans text-xs text-muted-foreground">
                {t('preview.unavailable')}
              </div>
            )}
            {overlayState.url && overlayMode !== 'none' && (
              <img
                src={overlayState.url}
                alt=""
                aria-hidden="true"
                className="pointer-events-none col-start-1 row-start-1 max-h-[400px] max-w-full object-contain"
                style={{ opacity: overlayOpacity }}
              />
            )}
          </div>
          {overlayMode !== 'none' && (
            <div className="absolute bottom-2 left-2 bg-background/85 px-2 py-1 font-mono text-[10px] uppercase text-foreground backdrop-blur-sm">
              {t(`preview.overlay.${overlayMode}`)} · {t(`pixel.status.${overlayState.status}`)}
            </div>
          )}
          <button
            onClick={() => setIsFullscreen(true)}
            disabled={!photo.previewUrl}
            className="absolute right-3 top-3 rounded-lg border border-border bg-background/80 p-2 text-foreground opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 hover:bg-gold hover:text-background disabled:hidden"
            title={t('preview.fullscreen')}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 border-b border-border pb-3 font-sans text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground" title={fileMetrics.name}>
            {fileMetrics.name}
          </span>
          <span className="font-mono">{fileMetrics.sizeFormatted}</span>
          <span className={photo.previewUrl ? 'font-mono text-emerald-400' : 'font-mono text-amber-400'}>
            {photo.previewUrl ? t('preview.available') : t('preview.noPreview')}
          </span>
        </div>
      </div>

      <div className="space-y-0 font-sans text-xs">
        {/* Screenshot vs Photo Type Classification */}
        {classification && (
          <div className="space-y-1.5 border-b border-border py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-serif font-bold text-foreground">
                {classification.type === 'AI Generated Image' ? (
                  <Sparkles className="h-4 w-4 text-fuchsia-400" />
                ) : classification.type === 'Device Screenshot' ? (
                  <Smartphone className="h-4 w-4 text-amber-400" />
                ) : classification.type === 'Camera Photo' ? (
                  <Camera className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-cyan-400" />
                )}
                <span>{t('preview.captureClassification')}</span>
              </div>
              <span className="font-mono text-[11px] font-bold text-gold">
                {classification.type}
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              {classification.summary}
            </p>
            {classification.deviceEstimate && (
              <div className="font-mono text-[10px] text-cyan-300">
                {classification.type === 'AI Generated Image'
                  ? t('preview.estimatedGenerator', { generator: classification.deviceEstimate })
                  : t('preview.estimatedDevice', { device: classification.deviceEstimate })}
              </div>
            )}
          </div>
        )}
        {/* Resolution & Crop Analysis */}
        {resolutionAnalysis && (
          <div className="space-y-1 border-b border-border py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-serif font-bold text-foreground">
                <Crop className="h-4 w-4 text-gold" />
                <span>{t('preview.sensorCrop')}</span>
              </div>
              <span className={`font-mono text-[11px] font-semibold ${resolutionAnalysis.status === 'Cropped / Trimmed' ? 'text-amber-400' :
                  resolutionAnalysis.status === 'Resized / Degraded' ? 'text-rose-400' :
                    resolutionAnalysis.status === 'Unknown' ? 'text-muted-foreground' : 'text-emerald-400'
                }`}>
                {resolutionAnalysis.status}
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              {resolutionAnalysis.details}
            </p>
            {resolutionAnalysis.sensorModelEstimate && (
              <div className="font-mono text-[10px] text-gold pt-1">
                {resolutionAnalysis.sensorModelEstimate}
              </div>
            )}
            {resolutionAnalysis.cropFactor !== undefined && (
              <div className="mt-2 border border-border/70 bg-black/10 p-2">
                <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                  <span className="text-cyan-300">
                    {resolutionAnalysis.sensorWidthMm !== undefined && resolutionAnalysis.sensorHeightMm !== undefined
                      ? `~${resolutionAnalysis.sensorWidthMm.toFixed(1)} × ${resolutionAnalysis.sensorHeightMm.toFixed(1)} mm · `
                      : ''}
                    {t('preview.crop', { value: resolutionAnalysis.cropFactor.toFixed(2) })}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {resolutionAnalysis.sensorEvidence.map((evidence) => (
                    <div key={evidence.source} className="text-[10px] leading-relaxed text-muted-foreground">
                      <span className="font-mono text-foreground">{evidence.source}:</span>{' '}
                      {evidence.cropFactor.toFixed(2)}×
                      {evidence.sensorWidthMm !== undefined && evidence.sensorHeightMm !== undefined
                        ? ` · ~${evidence.sensorWidthMm.toFixed(1)} × ${evidence.sensorHeightMm.toFixed(1)} mm`
                        : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* JPEG Quality & Compression */}
        {jpegQuality && jpegQuality.isJpeg && (
          <div className="space-y-1 border-b border-border py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-serif font-bold text-foreground">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <span>{t('preview.jpegEstimate')}</span>
              </div>
              {jpegQuality.estimatedQuality !== undefined && (
                <span className="font-mono text-gold font-bold text-[12px]">
                  {t('preview.ijgEstimate', { quality: jpegQuality.estimatedQuality })}
                </span>
              )}
            </div>
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              {jpegQuality.qualityDescription || t('preview.jpegFormat')}
            </p>
            {jpegQuality.compressionRatio && (
              <div className="font-mono text-[10px] text-muted-foreground pt-1 flex justify-between">
                <span>{t('preview.ratio')}: <strong className="text-foreground">{jpegQuality.compressionRatio}</strong></span>
                <span>{t('preview.density')}: <strong className="text-foreground">{jpegQuality.rawBytesPerPixel}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Key File Metrics Grid */}
        <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4 lg:grid-cols-2">
          <div className="border-b border-r border-border p-2 sm:border-b-0 lg:border-b">
            <div className="flex items-center gap-1 text-muted-foreground">
              <ImageIcon className="h-3 w-3 text-gold" />
              <span>{t('preview.resolution')}</span>
            </div>
            <div className="mt-1 font-mono font-semibold text-foreground truncate">
              {fileMetrics.width && fileMetrics.height ? `${fileMetrics.width}×${fileMetrics.height}` : 'N/A'}
            </div>
            <div className="text-[10px] text-muted-foreground">{fileMetrics.megapixels} · {fileMetrics.aspectRatio}</div>
          </div>

          <div className="border-b border-border p-2 sm:border-b-0 sm:border-r lg:border-b lg:border-r-0">
            <div className="flex items-center gap-1 text-muted-foreground">
              <HardDrive className="h-3 w-3 text-gold" />
              <span>{t('preview.format')}</span>
            </div>
            <div className="mt-1 font-mono font-semibold text-foreground uppercase">
              {fileMetrics.mimeType.replace('image/', '')}
            </div>
            <div className="text-[10px] text-muted-foreground">{fileMetrics.colorSpace}</div>
          </div>

          <div className="border-r border-border p-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3 text-gold" />
              <span>{t('preview.captured')}</span>
            </div>
            <div className="mt-1 font-mono font-semibold text-foreground truncate">
              {fileMetrics.createDate ? fileMetrics.createDate.toLocaleDateString(i18n.resolvedLanguage) : 'N/A'}
            </div>
          </div>

          <div className="p-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <FileText className="h-3 w-3 text-gold" />
              <span>{t('preview.rawTags')}</span>
            </div>
            <div className="mt-1 font-mono font-semibold text-foreground">
              {t('preview.tags', { count: Object.keys(photo.rawTags).length })}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && photo.previewUrl && (
        <div
          onClick={() => setIsFullscreen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md cursor-zoom-out"
        >
          <div className="grid max-h-[90vh] max-w-[90vw] place-items-center border border-border">
            <img
              src={photo.previewUrl}
              alt={t('preview.imageAlt', { name: fileMetrics.name })}
              className="col-start-1 row-start-1 max-h-[90vh] max-w-[90vw] object-contain"
            />
            {overlayState.url && overlayMode !== 'none' && (
              <img
                src={overlayState.url}
                alt=""
                aria-hidden="true"
                className="pointer-events-none col-start-1 row-start-1 max-h-[90vh] max-w-[90vw] object-contain"
                style={{ opacity: overlayOpacity }}
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
};
