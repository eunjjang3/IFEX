import { lazy, Suspense, useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import { Navbar } from './components/Navbar';
import { Dropzone } from './components/Dropzone';
import { PhotoPreviewPanel } from './components/PhotoPreviewPanel';
import { LeakageReport } from './components/LeakageReport';
import { CameraSpecs } from './components/CameraSpecs';
import { AdvancedMetadata } from './components/AdvancedMetadata';
import { RawTagTable } from './components/RawTagTable';
import { FileOriginReport } from './components/FileOriginReport';
import { PixelLab } from './components/PixelLab';
import { Footer } from './components/Footer';
import type { ParsedPhotoData } from './types/exif';
import { usePixelOverlay } from './hooks/usePixelOverlay';
import type { PixelOverlayMode } from './types/pixelForensics';
import { fileIdentity, validateImageFiles, type FileIntakeResult } from './utils/fileIntake';
import { mapSettledWithConcurrency } from './utils/asyncPool';
import { disposeParsedPhoto, disposeParsedPhotos } from './utils/photoResources';
import { securityConfig } from './utils/securityConfig';
import { AlertTriangle, Camera, Fingerprint, MapPin, ScanLine, ScanSearch, Table, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type AnalysisTab = 'origin' | 'pixel' | 'leakage' | 'camera' | 'map' | 'advanced' | 'raw';

const MapLocation = lazy(() => import('./components/MapLocation').then((module) => ({ default: module.MapLocation })));

interface AnalysisIssue {
  id: string;
  fileName?: string;
  message: string;
}

const MAX_VISIBLE_ISSUES = 8;
let issueSequence = 0;

function nextIssueId() {
  issueSequence += 1;
  return `issue-${Date.now().toString(36)}-${issueSequence.toString(36)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The file could not be analyzed.';
}

function scrollTabsWithWheel(event: WheelEvent<HTMLElement>) {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  const tabList = event.currentTarget;
  const maxScroll = tabList.scrollWidth - tabList.clientWidth;
  if (maxScroll <= 0) return;

  const nextScroll = Math.max(0, Math.min(maxScroll, tabList.scrollLeft + event.deltaY));
  if (nextScroll === tabList.scrollLeft) return;

  tabList.scrollLeft = nextScroll;
  event.preventDefault();
}

export function App() {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<ParsedPhotoData[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('origin');
  const [pendingFileCount, setPendingFileCount] = useState(0);
  const [issues, setIssues] = useState<AnalysisIssue[]>([]);
  const [overlayMode, setOverlayMode] = useState<PixelOverlayMode>('none');
  const [overlayOpacity, setOverlayOpacity] = useState(0.72);
  const photosRef = useRef<ParsedPhotoData[]>([]);
  const scheduledFilesRef = useRef(new Map<string, File>());
  const intakeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      disposeParsedPhotos(photosRef.current);
      photosRef.current = [];
    };
  }, []);

  const appendIssues = useCallback((incoming: Array<Omit<AnalysisIssue, 'id'>>) => {
    if (incoming.length === 0 || !mountedRef.current) return;
    const stamped = incoming.map((issue) => ({ ...issue, id: nextIssueId() }));
    setIssues((previous) => [...stamped, ...previous].slice(0, MAX_VISIBLE_ISSUES));
  }, []);

  const handleFilesSelect = useCallback(async (files: File[]) => {
    let releaseIntake!: () => void;
    const previousIntake = intakeQueueRef.current;
    intakeQueueRef.current = new Promise<void>((resolve) => { releaseIntake = resolve; });
    await previousIntake;

    let intake: FileIntakeResult | undefined;
    let scheduledKeys: string[] = [];
    const generation = generationRef.current;
    try {
      const loadedFiles = photosRef.current.map((photo) => photo.file);
      const scheduledFiles = Array.from(scheduledFilesRef.current.values());
      const existingKeys = new Set([
        ...loadedFiles.map(fileIdentity),
        ...scheduledFilesRef.current.keys(),
      ]);
      intake = await validateImageFiles(files, {
        existingKeys,
        activeFileCount: loadedFiles.length + scheduledFiles.length,
        activeBytes: [...loadedFiles, ...scheduledFiles].reduce((total, file) => total + file.size, 0),
      });

      appendIssues(intake.rejected.map((rejection) => ({ fileName: rejection.file.name, message: rejection.reason })));
      if (intake.accepted.length === 0) return;

      scheduledKeys = intake.accepted.map(fileIdentity);
      intake.accepted.forEach((file, index) => scheduledFilesRef.current.set(scheduledKeys[index], file));
      const acceptedCount = intake.accepted.length;
      setPendingFileCount((count) => count + acceptedCount);
    } finally {
      releaseIntake();
    }

    if (!intake || intake.accepted.length === 0) return;

    try {
      const { parsePhotoFile } = await import('./utils/exifParser');
      const results = await mapSettledWithConcurrency(
        intake.accepted,
        securityConfig.parseConcurrency,
        (file) => parsePhotoFile(file),
      );
      const parsed: ParsedPhotoData[] = [];
      const failures: Array<Omit<AnalysisIssue, 'id'>> = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') parsed.push(result.value);
        else failures.push({ fileName: intake.accepted[index].name, message: errorMessage(result.reason) });
      });

      if (!mountedRef.current || generation !== generationRef.current) {
        disposeParsedPhotos(parsed);
        return;
      }

      const loadedKeys = new Set(photosRef.current.map((photo) => fileIdentity(photo.file)));
      const additions: ParsedPhotoData[] = [];
      for (const photo of parsed) {
        const key = fileIdentity(photo.file);
        if (loadedKeys.has(key)) {
          disposeParsedPhoto(photo);
          failures.push({ fileName: photo.file.name, message: 'This exact file completed in another analysis batch first.' });
          continue;
        }
        loadedKeys.add(key);
        additions.push(photo);
      }

      if (additions.length > 0) {
        const nextPhotos = [...photosRef.current, ...additions];
        photosRef.current = nextPhotos;
        setPhotos(nextPhotos);
      }
      appendIssues(failures);
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) {
        appendIssues([{ message: errorMessage(error) }]);
      }
    } finally {
      scheduledKeys.forEach((key) => scheduledFilesRef.current.delete(key));
      if (mountedRef.current) {
        setPendingFileCount((count) => Math.max(0, count - intake.accepted.length));
      }
    }
  }, [appendIssues]);

  const handleReset = useCallback(() => {
    generationRef.current += 1;
    disposeParsedPhotos(photosRef.current);
    photosRef.current = [];
    setPhotos([]);
    setActiveIndex(0);
    setActiveTab('origin');
    setOverlayMode('none');
    setIssues([]);
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    const index = photosRef.current.findIndex((photo) => photo.id === photoId);
    if (index < 0) return;

    const removed = photosRef.current[index];
    const nextPhotos = photosRef.current.filter((photo) => photo.id !== photoId);
    disposeParsedPhoto(removed);
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    setActiveIndex((current) => {
      if (nextPhotos.length === 0) return 0;
      if (current > index) return current - 1;
      if (current === index) return Math.min(index, nextPhotos.length - 1);
      return current;
    });
    setOverlayMode('none');
    if (nextPhotos.length === 0) setActiveTab('origin');
  }, []);

  const selectPhoto = useCallback((index: number) => {
    if (index < 0 || index >= photosRef.current.length) return;
    setActiveIndex(index);
    setOverlayMode('none');
  }, []);

  const currentPhoto = photos[activeIndex];
  const overlayState = usePixelOverlay(currentPhoto?.file, currentPhoto?.fileOrigin.fileType.actualMime, overlayMode);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <Navbar
        photos={photos}
        activeIndex={activeIndex}
        onSelectPhoto={selectPhoto}
        onRemovePhoto={removePhoto}
        onFilesSelect={handleFilesSelect}
        onReset={handleReset}
      />

      <main
        className={`mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 sm:px-6 ${
          photos.length === 0 ? 'overflow-y-auto py-0' : 'overflow-y-auto py-0 lg:overflow-hidden'
        }`}
      >
          {pendingFileCount > 0 && (
            <div role="status" className="mb-6 rounded-xl border border-gold/40 bg-gold/10 p-4 text-center font-sans text-xs text-gold animate-pulse">
              {t(pendingFileCount === 1 ? 'analysis.analyzingFiles_one' : 'analysis.analyzingFiles_other', { count: pendingFileCount })}
            </div>
          )}

          {issues.length > 0 && (
            <section role="alert" className="mb-6 border border-amber-500/40 bg-amber-500/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 font-sans text-xs font-semibold text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  {t('analysis.attention')}
                </div>
                <button type="button" onClick={() => setIssues([])} className="font-sans text-[11px] text-muted-foreground hover:text-foreground">
                  {t('analysis.dismiss')}
                </button>
              </div>
              <div className="mt-3 space-y-1.5">
                {issues.map((issue) => (
                  <p key={issue.id} className="font-sans text-xs leading-relaxed text-muted-foreground">
                    {issue.fileName && <strong className="text-foreground">{issue.fileName}: </strong>}
                    {issue.message}
                  </p>
                ))}
              </div>
            </section>
          )}

          {photos.length === 0 ? (
            <Dropzone onFilesSelect={handleFilesSelect} />
          ) : (
            <div className="space-y-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-0 lg:space-y-0">
              {currentPhoto && (
                <div className="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:pt-4">
                  <div className="lg:col-span-5 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
                    <PhotoPreviewPanel
                      photo={currentPhoto}
                      overlayMode={overlayMode}
                      overlayOpacity={overlayOpacity}
                      overlayState={overlayState}
                    />
                  </div>

                  <div className="space-y-6 lg:col-span-7 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0">
                    <div className="sticky top-0 z-20 shrink-0 border-b border-border/80 bg-background lg:static">
                      <nav
                        className="flex space-x-1 overflow-x-auto pb-px"
                        aria-label={t('analysis.views')}
                        onWheel={scrollTabsWithWheel}
                      >
                        {[
                          { id: 'origin', label: t('analysis.tabs.origin'), icon: Fingerprint },
                          { id: 'pixel', label: t('analysis.tabs.pixel'), icon: ScanLine },
                          { id: 'leakage', label: t('analysis.tabs.leakage'), icon: ScanSearch },
                          { id: 'camera', label: t('analysis.tabs.camera'), icon: Camera },
                          { id: 'map', label: t('analysis.tabs.map'), icon: MapPin },
                          { id: 'advanced', label: t('analysis.tabs.advanced'), icon: Tag },
                          { id: 'raw', label: t('analysis.tabs.raw'), icon: Table },
                        ].map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              type="button"
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id as AnalysisTab)}
                              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 font-sans text-xs font-medium whitespace-nowrap transition-all ${
                                isActive
                                  ? 'border-gold text-gold font-bold bg-gold/5'
                                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </nav>
                    </div>

                    <div className="pt-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pt-4 lg:pr-2">
                      {activeTab === 'origin' && <FileOriginReport photo={currentPhoto} />}
                      {activeTab === 'pixel' && (
                        <PixelLab
                          photo={currentPhoto}
                          mode={overlayMode}
                          opacity={overlayOpacity}
                          state={overlayState}
                          onModeChange={setOverlayMode}
                          onOpacityChange={setOverlayOpacity}
                        />
                      )}
                      {activeTab === 'leakage' && <LeakageReport photo={currentPhoto} />}
                      {activeTab === 'camera' && <CameraSpecs photo={currentPhoto} />}
                      {activeTab === 'map' && (
                        <Suspense fallback={<div role="status" className="border border-border p-5 font-sans text-xs text-muted-foreground">{t('analysis.loadingMap')}</div>}>
                          <MapLocation location={currentPhoto.location} />
                        </Suspense>
                      )}
                      {activeTab === 'advanced' && <AdvancedMetadata photo={currentPhoto} />}
                      {activeTab === 'raw' && <RawTagTable photo={currentPhoto} />}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
      </main>

      <Footer />
    </div>
  );
}

export default App;
