export type PixelOverlayMode =
  | 'none'
  | 'clipping'
  | 'ela'
  | 'noise'
  | 'gradient'
  | 'median'
  | 'copyMove'
  | 'cfa'
  | 'chromaCb'
  | 'chromaCr'
  | 'jpegGhost'
  | 'dct';
export type PixelAnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'unsupported' | 'error';

export interface PixelMetric {
  label: string;
  value: string;
}

export interface PixelOverlayWorkerRequest {
  requestId: string;
  file: File;
  mode: Exclude<PixelOverlayMode, 'none'>;
  mimeType: string;
  maxDimension: number;
}

export interface PixelOverlayWorkerResponse {
  requestId: string;
  ok: boolean;
  blob?: Blob;
  width?: number;
  height?: number;
  metrics?: PixelMetric[];
  error?: string;
}

export interface PixelOverlayState {
  status: PixelAnalysisStatus;
  url?: string;
  metrics: PixelMetric[];
  error?: string;
}
