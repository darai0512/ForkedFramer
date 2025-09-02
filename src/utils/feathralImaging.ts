import { get } from 'svelte/store';
import { mainBookFileSystem } from '../filemanager/fileManagerStore';
import { text2Image, pollMediaStatus } from '../supabase';
import { toastStore } from '@skeletonlabs/skeleton';
import type { Page } from '../lib/book/book';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import type { Vector } from '../lib/layeredCanvas/tools/geometry/geometry';
import { type Layout, collectLeaves, calculatePhysicalLayout, findLayoutOf, constraintLeaf } from '../lib/layeredCanvas/dataModels/frameTree';
import { Film, FilmStackTransformer } from '../lib/layeredCanvas/dataModels/film';
import { bookOperators, mainBook, redrawToken } from '../bookeditor/workspaceStore'
import { updateToken } from "../utils/accountStore";
import type { TextToImageRequest, ImagingBackground, ImagingMode, ImagingProvider } from './edgeFunctions/types/imagingTypes';
import { saveRequest } from '../filemanager/warehouse';
import { FunctionsHttpError } from '@supabase/supabase-js'
// import { captureConsoleIntegration } from '@sentry/svelte';
import { calculateImagingCost } from './edgeFunctions/calculateCost';

export type ImagingContext = {
  awakeWarningToken: boolean;
  errorToken: boolean;
  total: number;
  succeeded: number;
  failed: number;
  refImages: Record<string, HTMLCanvasElement>;
}

export function isContentsPolicyViolationError(error: any): boolean {
  if (error instanceof FunctionsHttpError) {
    return error.context.status === 422;
  }
  return false;
}

function inferProvider(m: ImagingMode): ImagingProvider {
  if (m.startsWith('gpt-image-1/')) return 'gpt-image-1';
  if (m === 'qwen-image') return 'qwen';
  return 'flux';
}

async function submitImagingRequest(req: TextToImageRequest): Promise<HTMLCanvasElement[]> {
  try {
    const { requestId, model } = await text2Image(req);
    await saveRequest(get(mainBookFileSystem)!, 'image', req.mode, requestId, model);

    const perf = performance.now();
    const { mediaResources } = await pollMediaStatus({ mediaType: 'image', mode: req.mode, requestId, model });
    console.log('submitImagingRequest', performance.now() - perf);
    return mediaResources as HTMLCanvasElement[];
  } catch (error: any) {
    if (isContentsPolicyViolationError(error)) {
      toastStore.trigger({ message: `画像生成エラー: ジェネレータに拒否されました。<br/>おそらくコンテントポリシー違反です。`, timeout: 5000});
    } else {
      toastStore.trigger({ message: `画像生成エラー: ${error.context?.statusText ?? error?.message}`, timeout: 3000});
    }
    throw error;
  }
}

// 旧個別実装は廃止し、単一の submitImagingRequest に統合

export async function generateImage(prompt: string, image_size: {width: number, height: number}, mode: ImagingMode, num_images: number, background: ImagingBackground, imageDataUrls?: string[]): Promise<HTMLCanvasElement[]> {
  const req: TextToImageRequest = {
    provider: inferProvider(mode),
    prompt,
    imageSize: image_size,
    numImages: num_images,
    mode,
    background,
    imageDataUrls,
  };
  return submitImagingRequest(req);
}

export async function generateMarkedPageImages(imagingContext: ImagingContext, postfix: string, mode: ImagingMode, onProgress: (progress: number) => void) {
  const marks = get(bookOperators)!.getMarks();
  const newPages = get(mainBook)!.pages.filter((p, i) => marks[i]);
  if (newPages.length == 0) {
    console.log("no marks");
    toastStore.trigger({ message: `マークされたページが存在しません`, timeout: 3000});
    return;
  }

  let sum = 0;
  for (let i = 0; i < newPages.length; i++) {
    const page = newPages[i];      
    const leaves = collectLeaves(page.frameTree);
    sum += leaves.length;
  }

  let progress = 0;
  function onProgress2() {
    progress++;
    onProgress(progress / sum);
  }

  for (let i = 0; i < newPages.length; i++) {
    const page = newPages[i];
    imagingContext.total = 1;
    imagingContext.succeeded = 0;
    imagingContext.failed = 0;
    onProgress(progress / sum);
    await generatePageImages(imagingContext, postfix, mode, page, false, onProgress2);
  }
}

export async function generatePageImages(imagingContext: ImagingContext, postfix: string, mode: ImagingMode, page: Page, skipFilledFrame: boolean, onProgress: () => void) {
  imagingContext.awakeWarningToken = true;
  imagingContext.errorToken = true;
  const leaves = collectLeaves(page.frameTree);
  const pageLayout = calculatePhysicalLayout(page.frameTree, page.paperSize, [0,0]);
  const promises: Promise<void>[] = [];
  for (const leaf of leaves) {
    if (skipFilledFrame && leaf.filmStack.films.length > 0) {continue;}
    promises.push(
      (async (): Promise<void> => {
        await generateFrameImage(imagingContext, postfix, mode, findLayoutOf(pageLayout, leaf)!, page.paperSize);
        const leafLayout = findLayoutOf(pageLayout, leaf);
        const transformer = new FilmStackTransformer(page.paperSize, leaf.filmStack.films);
        transformer.scale(0.01);
        console.log("scaled");
        constraintLeaf(page.paperSize, leafLayout!);
        onProgress();
      })());
  }
  imagingContext.total = promises.length;
  imagingContext.succeeded = 0;
  imagingContext.failed = 0;
  await Promise.all(promises);

  updateToken.set(true);
}


async function generateFrameImage(imagingContext: ImagingContext, postfix: string, mode: ImagingMode, leafLayout: Layout, paperSize: Vector) {
  try {
    const frame = leafLayout.element;
    const composedPrompt = `${postfix}\n${frame.prompt}`;
    const imageDataUrls: string[] = [];
    if (Object.keys(imagingContext.refImages).length > 0) {
      const refTagRegex = /\[ref:([^\]]+)\]/g;
      const refKeys: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = refTagRegex.exec(composedPrompt)) !== null) {
        const key = m[1].trim();
        if (key && !refKeys.includes(key)) refKeys.push(key);
      }
      for (const key of refKeys) {
        const canvas = imagingContext.refImages[key];
        if (canvas) imageDataUrls.push(canvas.toDataURL('image/png'));
      }
    }
    const canvases = await generateImage(composedPrompt, {width:1024,height:1024}, mode, 1, 'opaque', imageDataUrls.length ? imageDataUrls : undefined);

    const media = new ImageMedia(canvases[0]);
    const film = new Film(media);
    frame.filmStack.films.push(film);
    frame.gallery.push(media);

    const transformer = new FilmStackTransformer(paperSize, frame.filmStack.films);
    transformer.scale(0.01);
    console.log("scaled");
    constraintLeaf(paperSize, leafLayout);
    redrawToken.set(true);

    imagingContext.succeeded++;
  } 
  catch(error) {
    imagingContext.failed++;
    throw error;
  }
}

// textEdit専用の分岐は廃止（generateFrameImage内で参照画像を自動添付）

export function calculateCost(size: {width:number,height:number}, mode: ImagingMode): number {
  console.log("calculateCost", size, mode);
  return calculateImagingCost(mode, size);
}

/*
const gptTokens: Record<string, number> = {
  "low": 272,
  "medium": 1056,
  "high": 4160,
}
const gptoutputCostPerMegaTokens = 40.0;

function calculateGPTCost(mode: Mode): number {
  if (!(mode === "gpt-image-1/low" || mode === "gpt-image-1/medium" || mode === "gpt-image-1/high")) {
    return 0;
  }
  const tokens = gptTokens[mode.split("/")[1]];
  return tokens / 1000000 * gptoutputCostPerMegaTokens;
}
*/

export type ModeOption = { value: ImagingMode; name: string; uiType: ImagingProvider; preferredGroup: 'imaging' | 'textedit' | 'both' };
export const modeOptions: ModeOption[] = [
  // Imaging-oriented
  { value: 'qwen-image', name: 'Qwen Image', uiType: 'flux', preferredGroup: 'imaging' },
  { value: 'gpt-image-1/low', name: 'GPT-image-1 low', uiType: 'gpt-image-1', preferredGroup: 'imaging' },
  { value: 'gpt-image-1/medium', name: 'GPT-image-1 medium', uiType: 'gpt-image-1', preferredGroup: 'imaging' },
  { value: 'schnell', name: 'FLUX Schnell', uiType: 'flux', preferredGroup: 'imaging' },
  { value: 'pro', name: 'FLUX Pro', uiType: 'flux', preferredGroup: 'imaging' },
  { value: 'chibi', name: 'FLUX ちび', uiType: 'flux', preferredGroup: 'imaging' },
  { value: 'manga', name: 'FLUX まんが', uiType: 'flux', preferredGroup: 'imaging' },
  { value: 'comibg', name: 'シンプル背景', uiType: 'flux', preferredGroup: 'imaging' },
  // Both imaging and text-edit friendly
  { value: 'gpt-image-1/high', name: 'GPT-image-1 high', uiType: 'gpt-image-1', preferredGroup: 'both' },
  { value: 'nano-banana', name: 'Nano Banana', uiType: 'flux', preferredGroup: 'both' },
  // Text-edit–oriented
  { value: 'kontext/pro', name: 'Flux Kontext [Pro]', uiType: 'flux', preferredGroup: 'textedit' },
  { value: 'kontext/max', name: 'Flux Kontext [Max]', uiType: 'flux', preferredGroup: 'textedit' },
  { value: 'kontext/inscene', name: 'Flux Kontext [InScene]', uiType: 'flux', preferredGroup: 'textedit' },
];

// ModeChoice は廃止（すべて ImagingMode で扱う）
