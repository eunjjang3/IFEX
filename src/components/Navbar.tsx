import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ParsedPhotoData } from '../types/exif';
import { LanguageButton } from './LanguageButton';

interface NavbarProps {
  photos: ParsedPhotoData[];
  activeIndex: number;
  onSelectPhoto: (index: number) => void;
  onRemovePhoto: (photoId: string) => void;
  onFilesSelect: (files: File[]) => void | Promise<void>;
  onReset: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  photos,
  activeIndex,
  onSelectPhoto,
  onRemovePhoto,
  onFilesSelect,
  onReset,
}) => {
  const { t } = useTranslation();
  const hasPhotos = photos.length > 0;

  return (
    <header className="app-chrome sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <h1 className="shrink-0 font-serif text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          IFEX
        </h1>

        {hasPhotos && (
          <nav aria-label={t('navbar.loadedPhotos')} className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex w-max items-stretch gap-1.5">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className={`flex shrink-0 items-center border transition-all ${
                    activeIndex === index
                      ? 'border-gold bg-gold/15 text-gold shadow-md'
                      : 'border-border bg-card/40 text-muted-foreground hover:border-gold/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectPhoto(index)}
                    className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-left font-sans text-[11px]"
                    aria-current={activeIndex === index ? 'true' : undefined}
                  >
                    <span className="max-w-[120px] truncate">{photo.fileMetrics.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {t('navbar.traces', { count: photo.leakage.detectedCount })}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(photo.id)}
                    aria-label={t('navbar.removePhoto', { name: photo.fileMetrics.name })}
                    className="self-stretch border-l border-border/80 px-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <label className="flex shrink-0 cursor-pointer items-center gap-1 border border-dashed border-border bg-card/20 px-2 py-1.5 font-sans text-[11px] text-muted-foreground hover:border-gold/50 hover:text-foreground">
                <Plus className="h-3.5 w-3.5" />
                <span>{t('navbar.addPhoto')}</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.jpe,.png,.webp,.avif,.heic,.heif,.tiff,.tif,.dng,.raw,.cr2,.nef"
                  multiple
                  onChange={(event) => {
                    const selected = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
                    event.currentTarget.value = '';
                    if (selected.length > 0) void onFilesSelect(selected);
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </nav>
        )}

        {/* File actions */}
        <div className="flex shrink-0 items-center gap-3">
          {hasPhotos && (
            <button
              type="button"
              onClick={onReset}
              aria-label={t('navbar.clearPhotos')}
              className="flex h-6 w-6 items-center justify-center border border-border bg-card/60 text-muted-foreground transition-colors hover:border-rose-500/50 hover:text-rose-400 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              title={t('navbar.clearPhotos')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <LanguageButton />
        </div>
      </div>
    </header>
  );
};
