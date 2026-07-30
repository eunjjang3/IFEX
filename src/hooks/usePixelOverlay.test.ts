// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PixelOverlayMode, PixelOverlayState, PixelOverlayWorkerRequest, PixelOverlayWorkerResponse } from '../types/pixelForensics';
import { usePixelOverlay } from './usePixelOverlay';

interface HarnessProps {
  file?: File;
  mimeType?: string;
  mode: PixelOverlayMode;
}

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<PixelOverlayWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  request?: PixelOverlayWorkerRequest;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: PixelOverlayWorkerRequest) {
    this.request = request;
  }

  terminate() {
    this.terminated = true;
  }

  respond(response: Omit<PixelOverlayWorkerResponse, 'requestId'>) {
    if (!this.request) throw new Error('Worker received no request.');
    this.onmessage?.({ data: { requestId: this.request.requestId, ...response } } as MessageEvent<PixelOverlayWorkerResponse>);
  }
}

function Harness({ file, mimeType, mode }: HarnessProps) {
  const state = usePixelOverlay(file, mimeType, mode);
  return createElement('output', { 'data-testid': 'state' }, JSON.stringify(state));
}

function readState(container: HTMLElement): PixelOverlayState {
  const text = container.querySelector('[data-testid="state"]')?.textContent;
  if (!text) throw new Error('Hook state was not rendered.');
  return JSON.parse(text) as PixelOverlayState;
}

async function renderHarness(props: HarnessProps) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(createElement(Harness, props)); });
  return {
    container,
    root,
    rerender: async (nextProps: HarnessProps) => {
      await act(async () => { root.render(createElement(Harness, nextProps)); });
    },
  };
}

async function unmount(root: Root) {
  await act(async () => { root.unmount(); });
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('OffscreenCanvas', class { convertToBlob() { return Promise.resolve(new Blob()); } });
  vi.stubGlobal('createImageBitmap', vi.fn());
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: vi.fn(() => 'blob:overlay') },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('usePixelOverlay', () => {
  it('rejects JPEG-only modes before starting a Worker for other formats', async () => {
    const file = new File(['png'], 'image.png', { type: 'image/png' });
    const view = await renderHarness({ file, mimeType: 'image/png', mode: 'ela' });

    expect(readState(view.container)).toEqual({
      status: 'unsupported',
      metrics: [],
      error: 'ELA is available only for JPEG files.',
    });
    expect(FakeWorker.instances).toHaveLength(0);

    await unmount(view.root);
  });

  it('publishes a matching Worker result and revokes its object URL on cleanup', async () => {
    const file = new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' });
    const view = await renderHarness({ file, mimeType: 'image/jpeg', mode: 'gradient' });
    const worker = FakeWorker.instances[0];

    expect(readState(view.container).status).toBe('analyzing');
    expect(worker.request).toMatchObject({ file, mimeType: 'image/jpeg', mode: 'gradient', maxDimension: 2_048 });

    await act(async () => {
      worker.respond({
        ok: true,
        blob: new Blob(['overlay'], { type: 'image/png' }),
        metrics: [{ label: 'Mean gradient', value: '12.4 Sobel units' }],
      });
    });

    expect(readState(view.container)).toEqual({
      status: 'ready',
      url: 'blob:overlay',
      metrics: [{ label: 'Mean gradient', value: '12.4 Sobel units' }],
    });
    expect(worker.terminated).toBe(true);

    await unmount(view.root);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:overlay');
  });

  it('terminates superseded work and ignores its late response', async () => {
    const file = new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' });
    const view = await renderHarness({ file, mimeType: 'image/jpeg', mode: 'gradient' });
    const staleWorker = FakeWorker.instances[0];

    await view.rerender({ file, mimeType: 'image/jpeg', mode: 'median' });
    const currentWorker = FakeWorker.instances[1];
    expect(staleWorker.terminated).toBe(true);

    await act(async () => {
      staleWorker.respond({ ok: true, blob: new Blob(['stale']), metrics: [{ label: 'stale', value: '1' }] });
    });
    expect(readState(view.container).status).toBe('analyzing');
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      currentWorker.respond({ ok: true, blob: new Blob(['current']), metrics: [{ label: 'current', value: '2' }] });
    });
    expect(readState(view.container)).toMatchObject({
      status: 'ready',
      metrics: [{ label: 'current', value: '2' }],
    });

    await unmount(view.root);
  });

  it('terminates work and reports an error when pixel analysis times out', async () => {
    vi.useFakeTimers();
    const file = new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' });
    const view = await renderHarness({ file, mimeType: 'image/jpeg', mode: 'gradient' });
    const worker = FakeWorker.instances[0];

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

    expect(readState(view.container)).toEqual({
      status: 'error',
      metrics: [],
      error: 'Pixel analysis timed out (20000 ms).',
    });
    expect(worker.terminated).toBe(true);

    await unmount(view.root);
  });
});
