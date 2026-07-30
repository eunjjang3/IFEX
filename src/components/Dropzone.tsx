import React, { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { createSamplePhotoFile } from '../utils/samplePhotos';

interface DropzoneProps {
  onFilesSelect: (files: File[]) => void | Promise<void>;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submitFiles = (files: File[]) => {
    if (files.length > 0) void onFilesSelect(files);
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    submitFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
    event.currentTarget.value = '';
    submitFiles(files);
  };

  const handleSampleClick = async (type: 'iphone_gps' | 'dslr_portrait' | 'clean_landscape') => {
    setLoadingSample(type);
    setSampleError(null);
    try {
      const file = await createSamplePhotoFile(type);
      await onFilesSelect([file]);
    } catch (error) {
      if (mountedRef.current) {
        setSampleError(error instanceof Error ? error.message : 'The local sample could not be created.');
      }
    } finally {
      if (mountedRef.current) setLoadingSample(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center py-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose image files"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`group relative flex min-h-[380px] cursor-pointer flex-col items-start justify-end border border-dashed p-6 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-gold/60 sm:p-10 ${
          isDragging ? 'border-gold bg-gold/5' : 'border-border hover:border-gold/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.jpe,.png,.webp,.avif,.heic,.heif,.tiff,.tif,.dng,.raw,.cr2,.nef"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="mb-auto flex h-10 w-10 items-center justify-center border border-border text-muted-foreground transition-colors group-hover:border-gold group-hover:text-gold">
          <Upload className="h-5 w-5" />
        </div>

        <h2 className="max-w-xl font-serif text-2xl font-bold text-foreground sm:text-3xl">Inspect a photo</h2>
        <p className="mt-2 max-w-md font-sans text-sm text-muted-foreground">
          Drop files here or select files.
        </p>

      </div>

      <button
        type="button"
        onClick={() => void handleSampleClick('iphone_gps')}
        disabled={loadingSample !== null}
        className="mt-3 font-sans text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-gold disabled:opacity-50"
      >
        {loadingSample ? 'Loading sample…' : 'Use a local sample'}
      </button>
      {sampleError && <p role="alert" className="mt-2 font-sans text-xs text-rose-400">{sampleError}</p>}
    </div>
  );
};
