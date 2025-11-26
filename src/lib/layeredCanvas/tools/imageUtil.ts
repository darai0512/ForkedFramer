export function makePlainCanvas(w: number, h: number, color?: string | null): HTMLCanvasElement {
  console.log("makeWhiteImage", w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  if (color) {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

export async function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  await image.decode();
  URL.revokeObjectURL(url);
  return image;
}

export function createCanvasFromImage(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  return canvas;
}

export async function createImageFromCanvas(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = canvas.toDataURL("image/webp", 1.0);
  await image.decode();
  return image;
}

export async function createCanvasFromBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const image = await createImageFromBlob(blob);
  return createCanvasFromImage(image);
}

export function copyCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const newCanvas = document.createElement("canvas");
  newCanvas.width = canvas.width;
  newCanvas.height = canvas.height;
  const ctx = newCanvas.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  return newCanvas;
}

export function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/webp", 1.0);
}

export function imageToBase64(imgElement: HTMLImageElement) {
  let canvas = document.createElement("canvas");
  canvas.width = imgElement.naturalWidth;
  canvas.height = imgElement.naturalHeight;
  canvas.getContext("2d")!.drawImage(imgElement, 0, 0);

  let base64Image = canvas.toDataURL("image/webp", 1.0);
  return base64Image;
}

export async function canvasToBlob(canvas: HTMLCanvasElement, format: string = "image/webp"): Promise<Blob> {
  // 0x0のキャンバスの場合、1x1の透明なblobを返す
  if (canvas.width === 0 || canvas.height === 0) {
    console.log("canvasToBlob: canvas is 0x0, return 1x1 transparent blob");
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 1;
    tempCanvas.height = 1;
    return new Promise((resolve) => {
      tempCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          throw new Error(`Failed to convert 1x1 canvas to blob`);
        }
      }, format, 1.0);
    });
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        throw new Error(`Failed to convert canvas to blob, ${canvas.width}x${canvas.height}`);
      }
    }, format, 1.0);
  });
}

export async function getFirstFrameOfVideo(video: HTMLVideoElement): Promise<HTMLCanvasElement> {
  // iOS Safariでフルスクリーン化を避けインライン再生させるための下準備
  video.muted = true; // 自動再生用のサイレント設定（初期フレーム取得時）
  try {
    // playsinline/webkit-playsinline は属性・プロパティ両方を立てる
    (video as any).playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    // 不要なUIやピクチャインピクチャを抑止（念のため）
    video.controls = false;
    (video as any).disablePictureInPicture = true;
    // データの事前取得を促す
    video.preload = 'auto';
  } catch {}

  // 安定した初期フレーム取得のためのユーティリティ
  const waitEvent = (target: EventTarget, type: string, timeoutMs: number) =>
    new Promise<void>((resolve, reject) => {
      let finished = false;
      const onResolve = () => {
        if (finished) return;
        finished = true;
        target.removeEventListener(type, onResolve as any);
        target.removeEventListener('error', onError as any);
        clearTimeout(timer);
        resolve();
      };
      const onError = () => {
        if (finished) return;
        finished = true;
        target.removeEventListener(type, onResolve as any);
        target.removeEventListener('error', onError as any);
        clearTimeout(timer);
        reject(new Error(`Video ${type} event error`));
      };
      // error も拾う
      target.addEventListener('error', onError as any, { once: true });
      target.addEventListener(type, onResolve as any, { once: true });
      const timer = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        target.removeEventListener(type, onResolve as any);
        target.removeEventListener('error', onError as any);
        resolve(); // タイムアウト時も先へ進む（後段で readyState を再確認）
      }, timeoutMs);
    });

  // メタデータ（寸法）を待つ
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    try { video.load(); } catch {}
    await waitEvent(video, 'loadedmetadata', 15000);
  }

  // 可能なら最初のフレームのデータが利用可能になるまで待つ
  const hasCurrentFrame = () =>
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;

  if (!hasCurrentFrame()) {
    // シークでデコーダを起こす（0 だとイベントが来ない環境があるため微小値）
    try {
      const t = Math.max(0, Math.min(video.duration || 0, 0.000001));
      if (!Number.isNaN(t)) {
        video.currentTime = t;
      }
    } catch {}
    // loadeddata/seeked/canplay のいずれかで十分
    const waitAny = Promise.race([
      waitEvent(video, 'loadeddata', 10000),
      waitEvent(video, 'seeked', 10000),
      waitEvent(video, 'canplay', 10000),
    ]);
    try { await waitAny; } catch {}
  }

  // それでも用意できていなければ、最後の手段として軽く play→pause を試みる（失敗は無視）
  if (!hasCurrentFrame()) {
    try { await (video as any).play?.(); } catch {}
    try { (video as any).pause?.(); } catch {}
  }

  // キャンバスへ描画
  const w = video.videoWidth || 1;
  const h = video.videoHeight || 1;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  try {
    ctx.drawImage(video, 0, 0, w, h);
  } catch {
    // まれに描画に失敗する環境では 1x1 を返す
    canvas.width = 1; canvas.height = 1;
  }
  return canvas;
}

export async function imageToBlob(image: HTMLImageElement): Promise<Blob> {
  const canvas = createCanvasFromImage(image);
  return await canvasToBlob(canvas);
}

export async function createVideoFromDataUrl(dataUrl: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  // iOSでインライン再生させるための属性セット
  try {
    (video as any).playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    (video as any).disablePictureInPicture = true;
  } catch {}
  video.muted = true;
  video.preload = 'auto';
  video.src = dataUrl;
  try { video.load(); } catch {}
  await getFirstFrameOfVideo(video);
  return video;
}

export async function createVideoFromBlob(blob: Blob): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  const video = await createVideoFromDataUrl(url);
  // URL.revokeObjectURL(url); ダウンロードできるようにrevokeしない
  return video;
}

export function fitCanvasToRange(canvas: HTMLCanvasElement, options: { min?: number; max?: number } = {}): HTMLCanvasElement {
  const { min = 0, max = Infinity } = options;
  const outputCanvas = document.createElement('canvas');
  let width = canvas.width;
  let height = canvas.height;
  const longerSide = Math.max(width, height);

  let scale = 1;
  if (min > 0 && longerSide < min) {
    // 長辺が最小サイズ未満の場合は拡大
    scale = min / longerSide;
  } else if (max < Infinity && longerSide > max) {
    // 長辺が最大サイズを超える場合は縮小
    scale = max / longerSide;
  }

  if (scale !== 1) {
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');
  ctx?.drawImage(canvas, 0, 0, width, height);

  return outputCanvas;
}

export function computeAspectFitSize(r: DOMRect, [w,h]: [number, number]): { width: number, height: number } {
  const aspect = w / h;
  const rectAspect = r.width / r.height;
  if (aspect > rectAspect) {
    return { width: r.width, height: r.width / aspect };
  } else {
    return { width: r.height * aspect, height: r.height };
  }
}

/**
 * DataURLから画像オブジェクトを作成する
 * @param dataUrl Data URL形式の画像データ
 * @returns Promise<HTMLImageElement> 画像オブジェクト
 */
export async function createImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('画像の読み込みに失敗しました'));
    img.src = dataUrl;
  });
}

/**
 * DataURLからキャンバスを作成する
 * @param dataUrl Data URL形式の画像データ
 * @returns Promise<HTMLCanvasElement> キャンバスオブジェクト
 */
export async function createCanvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  const image = await createImageFromDataUrl(dataUrl);
  return createCanvasFromImage(image);
}

/**
 * キャンバスを指定サイズにリサイズする
 * @param canvas 元のキャンバス
 * @param targetWidth 目標幅
 * @param targetHeight 目標高さ
 * @returns リサイズされたキャンバス
 */
export function resizeCanvas(canvas: HTMLCanvasElement, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = targetWidth;
  outputCanvas.height = targetHeight;
  const ctx = outputCanvas.getContext('2d');
  ctx?.drawImage(canvas, 0, 0, targetWidth, targetHeight);
  return outputCanvas;
}

