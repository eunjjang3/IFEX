import { useEffect, useState } from 'react';
import type { PixelOverlayMode, PixelOverlayState, PixelOverlayWorkerRequest, PixelOverlayWorkerResponse } from '../types/pixelForensics';
import { securityConfig } from '../utils/securityConfig';

const idleState: PixelOverlayState = { status: 'idle', metrics: [] };

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function unsupportedReason(): string | undefined {
  if (typeof Worker === 'undefined') return 'Web Workers are unavailable in this browser.';
  if (typeof OffscreenCanvas === 'undefined' || typeof OffscreenCanvas.prototype.convertToBlob !== 'function') {
    return 'Pixel Lab requires OffscreenCanvas support.';
  }
  if (typeof createImageBitmap === 'undefined') return 'Pixel Lab requires createImageBitmap support.';
  return undefined;
}

export function usePixelOverlay(file: File | undefined, mimeType: string | undefined, mode: PixelOverlayMode): PixelOverlayState {
  const [state, setState] = useState<PixelOverlayState>(idleState);

  useEffect(() => {
    if (!file || !mimeType || mode === 'none') {
      setState(idleState);
      return;
    }
    if ((mode === 'ela' || mode === 'jpegGhost') && mimeType !== 'image/jpeg') {
      const label = mode === 'ela' ? 'ELA' : 'JPEG Ghost';
      setState({ status: 'unsupported', metrics: [], error: `${label} is available only for JPEG files.` });
      return;
    }

    const supportError = unsupportedReason();
    if (supportError) {
      setState({ status: 'unsupported', metrics: [], error: supportError });
      return;
    }

    let active = true;
    let worker: Worker | undefined;
    let objectUrl: string | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const requestId = createRequestId();

    const stopWorker = () => {
      worker?.terminate();
      worker = undefined;
    };

    const finish = (nextState: PixelOverlayState) => {
      if (!active) return;
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      timeout = undefined;
      stopWorker();
      setState(nextState);
    };

    setState({ status: 'analyzing', metrics: [] });

    try {
      worker = new Worker(new URL('../workers/pixelForensics.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<PixelOverlayWorkerResponse>) => {
        if (!active || event.data.requestId !== requestId) return;
        if (!event.data.ok || !event.data.blob) {
          finish({ status: 'error', metrics: [], error: event.data.error || 'Pixel analysis failed.' });
          return;
        }

        try {
          objectUrl = URL.createObjectURL(event.data.blob);
          finish({ status: 'ready', url: objectUrl, metrics: event.data.metrics || [] });
        } catch (error) {
          finish({
            status: 'error',
            metrics: [],
            error: error instanceof Error ? error.message : 'The overlay image could not be created.',
          });
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish({ status: 'error', metrics: [], error: event.message || 'The pixel analysis worker stopped unexpectedly.' });
      };
      worker.onmessageerror = () => {
        finish({ status: 'error', metrics: [], error: 'The pixel analysis worker returned an unreadable response.' });
      };

      const request: PixelOverlayWorkerRequest = { requestId, file, mimeType, mode, maxDimension: securityConfig.maxPixelDimension };
      worker.postMessage(request);
      timeout = globalThis.setTimeout(() => {
        finish({ status: 'error', metrics: [], error: `Pixel analysis timed out (${securityConfig.pixelTimeoutMs} ms).` });
      }, securityConfig.pixelTimeoutMs);
    } catch (error) {
      finish({
        status: 'error',
        metrics: [],
        error: error instanceof Error ? error.message : 'Pixel analysis could not start.',
      });
    }

    return () => {
      active = false;
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      stopWorker();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, mimeType, mode]);

  return state;
}
