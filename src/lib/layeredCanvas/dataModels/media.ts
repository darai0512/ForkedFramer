import type { Vector } from "../tools/geometry/geometry";
import type {
  TextToImageRequest,
  ImageToVideoRequest,
  OutPaintRequest,
  InPaintRequest,
  EraserRequest,
  UpscaleRequest,
  TextEraserRequest,
  RemoveBgRequest,
  ImagingAction
} from "../../../utils/edgeFunctions/types/imagingTypes";

export type MediaType = 'image' | 'video';
export type RemoteMediaMode = 'beforeRequest' | 'afterRequest' | 'failure';

// beforeRequest: リクエスト情報を保持（API未呼び出し）
// afterRequest: requestIdを保持（API呼び出し済み、ポーリング待ち）
// failure: 失敗状態
export type FitParams = {
  frameSize: Vector;   // フレームのサイズ
  paperSize: Vector;   // ページのサイズ
};

export type RemoteMediaReferenceBeforeRequest = {
  mediaType: 'image';
  mode: 'beforeRequest';
  action: 'texttoimage';
  request: TextToImageRequest;
  fitParams?: FitParams;
} | {
  mediaType: 'image';
  mode: 'beforeRequest';
  action: 'outpaint';
  request: OutPaintRequest;
  fitParams?: FitParams;
} | {
  mediaType: 'image';
  mode: 'beforeRequest';
  action: 'inpaint';
  request: InPaintRequest;
  fitParams?: FitParams;
} | {
  mediaType: 'image';
  mode: 'beforeRequest';
  action: 'eraser';
  request: EraserRequest;
  fitParams?: FitParams;
} | {
  mediaType: 'image';
  mode: 'beforeRequest';
  action: 'upscale';
  request: UpscaleRequest;
  fitParams?: FitParams;
} | {
  mediaType: 'image';
  mode: 'beforeRequest';
  action: 'texteraser';
  request: TextEraserRequest;
  fitParams?: FitParams;
} | {
  mediaType: 'image';
  mode: 'beforeRequest';
  action: 'removebg';
  request: RemoveBgRequest;
  fitParams?: FitParams;
} | {
  mediaType: 'video';
  mode: 'beforeRequest';
  action: 'imagetovideo';
  request: ImageToVideoRequest;
  fitParams?: FitParams;
};

export type RemoteMediaReferenceAfterRequest = {
  mediaType: MediaType;
  mode: 'afterRequest';
  action: ImagingAction;
  requestId: string;
  model: string;
};

export type RemoteMediaReferenceFailure = {
  mediaType: MediaType;
  mode: 'failure';
  requestId: string;
  model: string;
};

export type RemoteMediaReference =
  | RemoteMediaReferenceBeforeRequest
  | RemoteMediaReferenceAfterRequest
  | RemoteMediaReferenceFailure;

export type MaterializedType = HTMLCanvasElement | HTMLVideoElement;
export type MediaResource = MaterializedType | RemoteMediaReference;

export interface Media {
  readonly player: Player | null;
  readonly drawSource: MaterializedType;
  readonly drawSourceCanvas: HTMLCanvasElement;
  readonly persistentSource: MediaResource; 
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly type: MediaType;
  readonly size: Vector;
  readonly fileId: { [key: string]: string };
  readonly isLoaded: boolean;
  readonly isFailed: boolean;
  readonly isFailure: boolean;
  setMedia(media: MaterializedType): void;
  fail(): void;
}

export interface Player {
  play(): void;
  pause(): void;
  seek(time: number): Promise<void>;
}

export abstract class MediaBase implements Media {
  fileId: { [key: string]: string }; // filesystemId => fileId
  protected _isLoaded: boolean = false;
  protected _isFailed: boolean = false;
  // ローディング表示用（簡易スピナー）
  private static loadingCanvas: HTMLCanvasElement;
  private static loadingAngle = 0; // rad
  private static lastTs = 0; // ms
  private static loadingPlayer: Player = {
    play: () => {},
    pause: () => {},
    seek: async () => {},
  };
  // 失敗表示用（簡易の壊れた画像/ビデオ風）
  private static failureCanvas: HTMLCanvasElement;
  static {
    // 画像サイズはフィット側で調整されるため、キャンバスサイズは既定のまま保持
    MediaBase.loadingCanvas = MediaBase.createLoadingCanvas(512, 512);
    MediaBase.failureCanvas = MediaBase.createFailureCanvas(512, 512);
  }

  constructor() {
    this.fileId = {};
  }

  get size(): Vector {
    return [this.naturalWidth, this.naturalHeight];
  }

  abstract get player(): Player | null;
  abstract get drawSource(): MaterializedType;
  abstract get drawSourceCanvas(): HTMLCanvasElement;
  abstract get persistentSource(): MediaResource;
  abstract get naturalWidth(): number;
  abstract get naturalHeight(): number;
  abstract get type(): MediaType;

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  abstract setMedia(media: MaterializedType): void;
  abstract fail(): void;

  setLoaded(isLoaded: boolean): void {
    this._isLoaded = isLoaded;
  }

  setFailed(isFailed: boolean): void {
    this._isFailed = isFailed;
  }

  get isFailed(): boolean {
    return this._isFailed;
  }

  get isFailure(): boolean {
    return this._isFailed;
  }

  getFileId(fileSystemId: string): string {
    return this.fileId[fileSystemId];
  }

  setFileId(fileSystemId: string, fileId: string): void {
    this.fileId[fileSystemId] = fileId;
  }

  private static drawLoadingSpinner(canvas: HTMLCanvasElement, ts: number) {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;

    // 時間差分から角度更新（1回の描画で最大進行を制限）
    const dt = Math.min(50, MediaBase.lastTs ? (ts - MediaBase.lastTs) : 16);
    MediaBase.lastTs = ts;
    MediaBase.loadingAngle = (MediaBase.loadingAngle + (dt / 1000) * Math.PI * 2 * 0.5) % (Math.PI * 2);

    // 背景は透明のまま（clear のみ）
    ctx.clearRect(0, 0, w, h);

    // スピナー（ドーナツ）: 見た目サイズを半分に（定数のみ調整）
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.075; // 0.15 -> 0.075 に縮小
    const lw = Math.max(4, Math.round(r * 0.12));
    ctx.save();
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    // 薄い全周（半透明）
    ctx.strokeStyle = 'rgba(120, 120, 120, 0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // 強調セグメント
    const seg = Math.PI * 0.9;
    ctx.strokeStyle = 'rgba(80, 80, 80, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, MediaBase.loadingAngle, MediaBase.loadingAngle + seg);
    ctx.stroke();
    ctx.restore();

    // テキストは描かず、全体を透明寄りに
  }

  static createLoadingCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    MediaBase.drawLoadingSpinner(canvas, performance.now());
    return canvas;
  }

  private static drawFailureMark(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 背景: 斜線模様（据え置き）
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 16;
    const step = 28;
    for (let x = -h; x < w + h; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }

    // 内側の描画領域を 1/2 に縮小（定数のみ）
    const pad = Math.round(Math.min(w, h) * 0.12);
    const rx0 = pad, ry0 = pad, rw0 = w - pad * 2, rh0 = h - pad * 2;
    const k = 0.5; // 縮小率（1/2）
    const rw = rw0 * k, rh = rh0 * k;
    const rx = rx0 + (rw0 - rw) / 2;
    const ry = ry0 + (rh0 - rh) / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(120,120,120,0.8)';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(rw, rh) * 0.02));
    ctx.strokeRect(rx, ry, rw, rh);

    // 山と太陽（画像のプレースホルダーっぽい）
    ctx.beginPath();
    const baseY = ry + rh * 0.75;
    ctx.moveTo(rx + rw * 0.12, baseY);
    ctx.lineTo(rx + rw * 0.38, ry + rh * 0.45);
    ctx.lineTo(rx + rw * 0.6, baseY);
    ctx.lineTo(rx + rw * 0.88, ry + rh * 0.55);
    ctx.stroke();

    // 太陽
    ctx.beginPath();
    ctx.arc(rx + rw * 0.78, ry + rh * 0.28, Math.min(rw, rh) * 0.06, 0, Math.PI * 2);
    ctx.stroke();

    // バツ印（失敗を示す）
    ctx.strokeStyle = 'rgba(200,60,60,0.9)';
    ctx.lineWidth = Math.max(3, Math.round(Math.min(rw, rh) * 0.03));
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.2, ry + rh * 0.2);
    ctx.lineTo(rx + rw * 0.8, ry + rh * 0.8);
    ctx.moveTo(rx + rw * 0.8, ry + rh * 0.2);
    ctx.lineTo(rx + rw * 0.2, ry + rh * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  static createFailureCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    MediaBase.drawFailureMark(canvas);
    return canvas;
  }

  protected getLoadingCanvas(): HTMLCanvasElement {
    // 呼び出し毎にアニメーション更新
    try {
      MediaBase.drawLoadingSpinner(MediaBase.loadingCanvas, performance.now());
    } catch {}
    return MediaBase.loadingCanvas;
  }

  protected getFailureCanvas(): HTMLCanvasElement {
    return MediaBase.failureCanvas;
  }

  protected getFallbackCanvas(): HTMLCanvasElement {
    return this.isFailed ? this.getFailureCanvas() : this.getLoadingCanvas();
  }

}

export class ImageMedia extends MediaBase {
  private canvas: HTMLCanvasElement | undefined;
  private remoteMediaReference: RemoteMediaReference | undefined;

  constructor(mediaResource: HTMLCanvasElement | RemoteMediaReference) {
    super();
    if (mediaResource instanceof HTMLCanvasElement) {
      this.setCanvas(mediaResource);
    } else {
      this.remoteMediaReference = mediaResource;
    }
  }

  setMedia(media: HTMLCanvasElement) {
    this.setCanvas(media);
  }

  fail() {
    this.setLoaded(false);
    this.canvas = undefined;
    this.remoteMediaReference = { mediaType: 'image', mode: 'failure', requestId: 'failure', model: 'failure' };
    this.setFailed(true);
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.remoteMediaReference = undefined;
    this.setLoaded(true);
    this.setFailed(false);
  }

  // beforeRequest → afterRequest への遷移
  setRequestResult(action: ImagingAction, requestId: string, model: string): void {
    if (this.remoteMediaReference?.mode === 'beforeRequest') {
      this.remoteMediaReference = {
        mediaType: 'image',
        mode: 'afterRequest',
        action,
        requestId,
        model
      };
    }
  }

  get player(): Player | null { return null; }
  get drawSource(): HTMLCanvasElement { return this.canvas ?? this.getFallbackCanvas(); }
  get drawSourceCanvas(): HTMLCanvasElement { return this.drawSource; }
  get persistentSource(): MediaResource {
    return this.remoteMediaReference ?? this.drawSource;
  }
  get naturalWidth(): number { return this.drawSource.width; }
  get naturalHeight(): number { return this.drawSource.height; }
  get type(): MediaType { return 'image'; }
}

export class VideoMedia extends MediaBase {
  private video: HTMLVideoElement | undefined;
  private remoteMediaReference: RemoteMediaReference | undefined;

  constructor(mediaResource: HTMLVideoElement | RemoteMediaReference) {
    super();
    if (mediaResource instanceof HTMLVideoElement) {
      this.setVideo(mediaResource);
    } else {
      this.remoteMediaReference = mediaResource;
    }
  }

  setMedia(media: HTMLVideoElement) {
    this.setVideo(media);
  }

  fail() {
    this.setLoaded(false);
    this.video = undefined;
    this.remoteMediaReference = { mediaType: 'video', mode: 'failure', requestId: 'failure', model: 'failure' };
    this.setFailed(true);
  }

  setVideo(video: HTMLVideoElement) {
    // iOS Safari でのインライン再生を確実にする
    try {
      (video as any).playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      (video as any).disablePictureInPicture = true;
      // レイヤー内で独自再生するためコントロールは不要
      video.controls = false;
    } catch {}
    this.video = video;
    this.remoteMediaReference = undefined
    this.setLoaded(true);
    this.setFailed(false);
  }

  // beforeRequest → afterRequest への遷移
  setRequestResult(action: ImagingAction, requestId: string, model: string): void {
    if (this.remoteMediaReference?.mode === 'beforeRequest') {
      this.remoteMediaReference = {
        mediaType: 'video',
        mode: 'afterRequest',
        action,
        requestId,
        model
      };
    }
  }

  get player(): Player {
    return {
      play: () => this.video?.play(),
      pause: () => this.video?.pause(),
      seek: async (time: number) => {
        const video = this.video;
        if (!video) throw new Error('Video element is not set');

        // メタデータ未読なら待つ（durationがNaNの間はシークしない）
        if (!Number.isFinite(video.duration)) {
          await new Promise<void>((res, rej) => {
            const ok = () => { cleanup(); res(); };
            const ng = () => { cleanup(); rej(new Error('metadata load failed')); };
            const cleanup = () => {
              video.removeEventListener('loadedmetadata', ok);
              video.removeEventListener('error', ng);
            };
            video.addEventListener('loadedmetadata', ok, { once: true });
            video.addEventListener('error', ng, { once: true });
          });
        }

        // 0〜durationにクランプ（範囲外代入の揺れ対策）
        const target = Math.min(Math.max(time, 0), video.duration);

        // ほぼ同位置なら即終了（ブラウザによってseekedが出ない対策）
        if (Math.abs(video.currentTime - target) < 0.001) return;

        // シーク実行（タイムアウトとクリーンアップ付き）
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { off(); reject(new Error('seek timeout')); }, 8000);
          const onSeeked = () => { off(); resolve(); };
          const onError  = () => { off(); reject(new Error('media error')); };
          const off = () => {
            clearTimeout(timeout);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          video.addEventListener('error',  onError,  { once: true });
          video.currentTime = target;
        });
      }
    };
  }
  get drawSource(): MaterializedType { return this.video ?? this.getFallbackCanvas(); }
  get drawSourceCanvas(): HTMLCanvasElement { 
    if (!this.video) { return this.getFallbackCanvas(); }
    const canvas = document.createElement('canvas');
    canvas.width = this.naturalWidth;
    canvas.height = this.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.video!, 0, 0);
    return canvas;
  }
  get persistentSource(): MediaResource { return this.remoteMediaReference ?? this.video!; }
  get naturalWidth(): number { return this.video ? this.video.videoWidth : this.getFallbackCanvas().width; }
  get naturalHeight(): number { return this.video ? this.video.videoHeight : this.getFallbackCanvas().height; }
  get type(): MediaType { return 'video'; }
}

export function buildMedia(mediaResource: MediaResource): Media {
  if (mediaResource instanceof HTMLCanvasElement) {
    return new ImageMedia(mediaResource);
  } else if (mediaResource instanceof HTMLVideoElement) {
    return new VideoMedia(mediaResource);
  } else if (mediaResource.mediaType === 'image') {
    return new ImageMedia(mediaResource);
  } else {
    return new VideoMedia(mediaResource);
  }
}

export function buildNullableMedia(mediaResource: MediaResource | null): Media | null {
  if (mediaResource === null) {
    return null;
  }
  return buildMedia(mediaResource);
}

export function mediaResourceSize(mediaResource: MediaResource): Vector | null {
  if (mediaResource instanceof HTMLCanvasElement) {
    return [mediaResource.width, mediaResource.height];
  } else if (mediaResource instanceof HTMLVideoElement) {
    return [mediaResource.videoWidth, mediaResource.videoHeight];
  } else {
    return null;
  }
}

export function getVideoElementFromMedia(media: Media): HTMLVideoElement | null {
  const persistent = media.persistentSource;
  if (persistent instanceof HTMLVideoElement) {
    return persistent;
  }

  const drawSource = media.drawSource;
  if (drawSource instanceof HTMLVideoElement) {
    return drawSource;
  }

  return null;
}
