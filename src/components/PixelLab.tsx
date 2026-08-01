import { Activity, Binary, CircleOff, Copy, Ghost, Grid2X2, Grid3X3, Palette, ScanLine, SunMedium, Waves } from 'lucide-react';
import type { ParsedPhotoData } from '../types/exif';
import type { PixelOverlayMode, PixelOverlayState } from '../types/pixelForensics';
import { useTranslation } from 'react-i18next';

interface PixelLabProps {
  photo: ParsedPhotoData;
  mode: PixelOverlayMode;
  opacity: number;
  state: PixelOverlayState;
  onModeChange: (mode: PixelOverlayMode) => void;
  onOpacityChange: (opacity: number) => void;
}

const analyses = {
  none: {
    icon: CircleOff, evidenceKey: 'pixel.evidence.none',
  },
  clipping: {
    icon: SunMedium, evidenceKey: 'pixel.evidence.observed',
  },
  ela: {
    icon: ScanLine, evidenceKey: 'pixel.evidence.heuristic',
  },
  noise: {
    icon: Waves, evidenceKey: 'pixel.evidence.heuristic',
  },
  gradient: {
    icon: Activity, evidenceKey: 'pixel.evidence.heuristic',
  },
  median: {
    icon: Grid3X3, evidenceKey: 'pixel.evidence.heuristic',
  },
  copyMove: {
    icon: Copy, evidenceKey: 'pixel.evidence.heuristic',
  },
  cfa: {
    icon: Grid2X2, evidenceKey: 'pixel.evidence.heuristic',
  },
  chromaCb: {
    icon: Palette, evidenceKey: 'pixel.evidence.derived',
  },
  chromaCr: {
    icon: Palette, evidenceKey: 'pixel.evidence.derived',
  },
  jpegGhost: {
    icon: Ghost, evidenceKey: 'pixel.evidence.heuristic',
  },
  dct: {
    icon: Binary, evidenceKey: 'pixel.evidence.heuristic',
  },
} as const satisfies Record<PixelOverlayMode, { icon: typeof CircleOff; evidenceKey: string }>;

export function PixelLab({ photo, mode, opacity, state, onModeChange, onOpacityChange }: PixelLabProps) {
  const { t } = useTranslation();
  const active = analyses[mode];
  const overlayLabel = (item: PixelOverlayMode) => t(`preview.overlay.${item}`);
  const elaSupported = photo.fileOrigin.fileType.actualMime === 'image/jpeg';

  return (
    <div>
      <div className="border-b border-border pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-serif text-xl font-bold text-foreground">{t('pixel.title')}</h3>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{t(active.evidenceKey)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
        {(Object.keys(analyses) as PixelOverlayMode[]).map((item) => {
          const config = analyses[item];
          const Icon = config.icon;
          const jpegOnly = item === 'ela' || item === 'jpegGhost';
          const disabled = jpegOnly && !elaSupported;
          return (
            <button
              key={item}
              onClick={() => onModeChange(item)}
              disabled={disabled}
              title={disabled ? t('pixel.jpegRequired', { name: overlayLabel(item) }) : overlayLabel(item)}
              className={`flex min-h-16 flex-col items-start justify-center gap-1 border-r border-border px-3 py-2 text-left last:border-r-0 disabled:cursor-not-allowed disabled:opacity-35 ${mode === item ? 'bg-gold/5 text-gold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" />
              <span className="font-sans text-xs font-semibold">{overlayLabel(item)}</span>
            </button>
          );
        })}
      </div>

      <div className="border-b border-border py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-sans text-sm font-semibold text-foreground">{overlayLabel(mode)}</h4>
          {mode !== 'none' && (
            <span className={`font-mono text-[10px] uppercase ${state.status === 'ready' ? 'text-emerald-400' : state.status === 'analyzing' ? 'text-gold' : 'text-muted-foreground'}`}>
              {t(`pixel.status.${state.status}`)}
            </span>
          )}
        </div>
        <p className="mt-1 font-sans text-xs leading-relaxed text-muted-foreground">{t(`pixel.summary.${mode}`)}</p>

        {state.error && <p className="mt-3 border-l border-amber-500 pl-3 font-sans text-xs text-amber-300">{state.error}</p>}

        {mode !== 'none' && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between font-sans text-[11px] text-muted-foreground">
              <label htmlFor="overlay-opacity">{t('pixel.overlayOpacity')}</label>
              <span className="font-mono text-foreground">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              id="overlay-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(event) => onOpacityChange(Number(event.target.value))}
              className="w-full cursor-pointer accent-gold"
            />
          </div>
        )}
      </div>

      {state.metrics.length > 0 && (
        <div className="grid grid-cols-1 border-b border-border sm:grid-cols-3">
          {state.metrics.map((metric) => (
            <div key={metric.label} className="border-b border-border p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <span className="block font-sans text-[10px] uppercase text-muted-foreground">{metric.label}</span>
              <strong className="mt-1 block font-mono text-xs text-foreground">{metric.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
