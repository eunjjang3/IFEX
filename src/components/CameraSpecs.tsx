import React from 'react';
import type { ParsedPhotoData } from '../types/exif';
import { Camera, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CameraSpecsProps {
  photo: ParsedPhotoData;
}

export const CameraSpecs: React.FC<CameraSpecsProps> = ({ photo }) => {
  const { t } = useTranslation();
  const { camera, shooting } = photo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-serif text-xl font-bold tracking-tight text-foreground">
          {t('camera.title')}
        </h3>
      </div>

      {/* Hardware Device Summary Banner */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Camera Body */}
        <div className="rounded-xl border border-border bg-card/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t('camera.cameraBody')}</span>
              <h4 className="font-serif text-base font-bold text-foreground">
                {camera.make ? `${camera.make} ${camera.model || ''}` : camera.model || t('camera.unknownCamera')}
              </h4>
            </div>
          </div>
          <div className="mt-3 divide-y divide-border/60 font-sans text-xs">
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.cameraMake')}</span>
              <span className="font-mono text-foreground font-medium">{camera.make || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.cameraModel')}</span>
              <span className="font-mono text-foreground font-medium">{camera.model || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.bodySerial')}</span>
              <span className="font-mono text-foreground font-medium">{camera.serialNumber || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.firmware')}</span>
              <span className="font-mono text-foreground">{camera.firmware || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Lens Hardware */}
        <div className="rounded-xl border border-border bg-card/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t('camera.lensHardware')}</span>
              <h4 className="font-serif text-base font-bold text-foreground">
                {camera.lensModel || camera.lensMake || t('camera.lensInfo')}
              </h4>
            </div>
          </div>
          <div className="mt-3 divide-y divide-border/60 font-sans text-xs">
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.lensModel')}</span>
              <span className="font-mono text-foreground font-medium truncate max-w-[200px]" title={camera.lensModel}>
                {camera.lensModel || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.focalLength')}</span>
              <span className="font-mono text-foreground font-medium">
                {camera.focalLength ? `${camera.focalLength}mm` : 'N/A'}{' '}
                {camera.focalLengthIn35mm ? t('camera.equivalent', { value: camera.focalLengthIn35mm }) : ''}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.lensSerial')}</span>
              <span className="font-mono text-foreground font-medium">{camera.lensSerialNumber || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">{t('camera.maxAperture')}</span>
              <span className="font-mono text-foreground">
                {camera.maxAperture ? `f/${camera.maxAperture.toFixed(1)}` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Exposure Settings Grid */}
      <div>
        <h4 className="mb-3 font-serif text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t('camera.shootingParameters')}
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-sans">
          {/* Aperture */}
          <div className="rounded-xl border border-border bg-card/40 p-3.5">
            <div className="text-xs text-muted-foreground">{t('camera.aperture')}</div>
            <div className="mt-2 font-mono text-xl font-bold text-foreground">
              {shooting.fNumber ? `f/${shooting.fNumber}` : 'N/A'}
            </div>
            <span className="text-[10px] text-muted-foreground">{t('camera.depthOfField')}</span>
          </div>

          {/* Shutter Speed */}
          <div className="rounded-xl border border-border bg-card/40 p-3.5">
            <div className="text-xs text-muted-foreground">{t('camera.shutterSpeed')}</div>
            <div className="mt-2 font-mono text-xl font-bold text-foreground">
              {shooting.exposureTimeString || 'N/A'}
            </div>
            <span className="text-[10px] text-muted-foreground">{t('camera.exposureTime')}</span>
          </div>

          {/* ISO */}
          <div className="rounded-xl border border-border bg-card/40 p-3.5">
            <div className="text-xs text-muted-foreground">{t('camera.isoSpeed')}</div>
            <div className="mt-2 font-mono text-xl font-bold text-foreground">
              {shooting.iso ? `ISO ${shooting.iso}` : 'N/A'}
            </div>
            <span className="text-[10px] text-muted-foreground">{t('camera.sensorGain')}</span>
          </div>

          {/* Exposure Bias */}
          <div className="rounded-xl border border-border bg-card/40 p-3.5">
            <div className="text-xs text-muted-foreground">{t('camera.exposureBias')}</div>
            <div className="mt-2 font-mono text-xl font-bold text-foreground">
              {shooting.exposureBias !== undefined ? `${shooting.exposureBias > 0 ? '+' : ''}${shooting.exposureBias} EV` : '0 EV'}
            </div>
            <span className="text-[10px] text-muted-foreground">{t('camera.exposureComp')}</span>
          </div>
        </div>
      </div>

      {/* Extra Technical Specs */}
      <div className="rounded-xl border border-border bg-card/30 p-4 font-sans text-xs">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">{t('camera.whiteBalance')}</span>
            <div className="mt-0.5 font-mono font-medium text-foreground">{shooting.whiteBalance || 'N/A'}</div>
          </div>
          <div>
            <span className="text-muted-foreground">{t('camera.meteringMode')}</span>
            <div className="mt-0.5 font-mono font-medium text-foreground">{shooting.meteringMode || 'N/A'}</div>
          </div>
          <div>
            <span className="text-muted-foreground">{t('camera.flashMode')}</span>
            <div className="mt-0.5 font-mono font-medium text-foreground">{shooting.flash || 'N/A'}</div>
          </div>
          <div>
            <span className="text-muted-foreground">{t('camera.digitalZoom')}</span>
            <div className="mt-0.5 font-mono font-medium text-foreground">{shooting.digitalZoomRatio ? `${shooting.digitalZoomRatio}x` : t('camera.none')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
