import React, { useState } from 'react';
import type { ParsedPhotoData } from '../types/exif';
import { BarChart2, Palette, Copy, Check } from 'lucide-react';

interface ImageDiagnosticsProps {
  photo: ParsedPhotoData;
}

export const ImageDiagnostics: React.FC<ImageDiagnosticsProps> = ({ photo }) => {
  const [activeChannel, setActiveChannel] = useState<'all' | 'red' | 'green' | 'blue' | 'luminance'>('all');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const { histogram, palette } = photo;

  const handleCopyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  // Find maximum bucket value for normalization
  const maxVal = histogram
    ? Math.max(
        ...histogram.red,
        ...histogram.green,
        ...histogram.blue,
        ...histogram.luminance
      ) || 1
    : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-serif text-xl font-bold tracking-tight text-foreground">
          Color Diagnostics & Histogram
        </h3>
        <p className="font-sans text-xs text-muted-foreground">
          RGB channel tonal distribution and dominant palette breakdown calculated from image pixel data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Histogram Graph (Left - 7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-border bg-card/50 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-gold" />
              <h4 className="font-serif text-sm font-bold text-foreground">Tonal Histogram</h4>
            </div>

            {/* Channel Filters */}
            <div className="flex items-center gap-1 font-mono text-[10px]">
              {(['all', 'red', 'green', 'blue', 'luminance'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveChannel(ch)}
                  className={`rounded px-2 py-0.5 font-semibold capitalize transition-all ${
                    activeChannel === ch
                      ? 'bg-gold text-background'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Histogram SVG Canvas visualization */}
          <div className="relative mt-4 h-48 w-full rounded-lg bg-black/60 p-2 overflow-hidden">
            {histogram ? (
              <svg className="h-full w-full" viewBox="0 0 256 100" preserveAspectRatio="none">
                {(activeChannel === 'all' || activeChannel === 'red') && (
                  <path
                    d={`M 0 100 ${histogram.red.map((val, i) => `L ${i} ${100 - (val / maxVal) * 90}`).join(' ')} L 256 100 Z`}
                    fill="rgba(239, 68, 68, 0.3)"
                    stroke="#ef4444"
                    strokeWidth="0.75"
                  />
                )}
                {(activeChannel === 'all' || activeChannel === 'green') && (
                  <path
                    d={`M 0 100 ${histogram.green.map((val, i) => `L ${i} ${100 - (val / maxVal) * 90}`).join(' ')} L 256 100 Z`}
                    fill="rgba(34, 197, 94, 0.3)"
                    stroke="#22c55e"
                    strokeWidth="0.75"
                  />
                )}
                {(activeChannel === 'all' || activeChannel === 'blue') && (
                  <path
                    d={`M 0 100 ${histogram.blue.map((val, i) => `L ${i} ${100 - (val / maxVal) * 90}`).join(' ')} L 256 100 Z`}
                    fill="rgba(59, 130, 246, 0.3)"
                    stroke="#3b82f6"
                    strokeWidth="0.75"
                  />
                )}
                {activeChannel === 'luminance' && (
                  <path
                    d={`M 0 100 ${histogram.luminance.map((val, i) => `L ${i} ${100 - (val / maxVal) * 90}`).join(' ')} L 256 100 Z`}
                    fill="rgba(234, 179, 8, 0.3)"
                    stroke="#eab308"
                    strokeWidth="0.75"
                  />
                )}
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Calculating histogram...
              </div>
            )}
          </div>

          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>Shadows (0)</span>
            <span>Midtones (128)</span>
            <span>Highlights (255)</span>
          </div>
        </div>

        {/* Color Palette Extraction (Right - 5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-border bg-card/50 p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <Palette className="h-4 w-4 text-cyan-400" />
            <h4 className="font-serif text-sm font-bold text-foreground">Dominant Color Palette</h4>
          </div>

          <div className="mt-4 space-y-2.5 font-sans text-xs">
            {palette && palette.length > 0 ? (
              palette.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleCopyHex(item.hex)}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-background/50 p-2 transition-all hover:border-gold/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-7 w-7 rounded-md border border-border shadow-inner"
                      style={{ backgroundColor: item.hex }}
                    />
                    <div>
                      <span className="font-mono font-bold text-foreground">{item.hex}</span>
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        RGB({item.rgb.join(', ')})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[11px] font-semibold text-gold">{item.percentage}%</span>
                    {copiedHex === item.hex ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Extracting dominant colors...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
