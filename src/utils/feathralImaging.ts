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
import { analyticsEvent } from "../utils/analyticsEvent";
import { FunctionsHttpError } from '@supabase/supabase-js'
// import { captureConsoleIntegration } from '@sentry/svelte';
import { calculateImagingCost } from './edgeFunctions/calculateCost';
import { textEdit } from '../supabase';

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

async function generateImage_Flux(prompt: string, image_size: {width: number, height: number}, mode: ImagingMode, num_images: number): Promise<HTMLCanvasElement[]> {
  console.log("running feathral");
  try {
    let imageRequest: TextToImageRequest = {
      provider: "flux",
      prompt, 
      imageSize: image_size,
      numImages: num_images,
      mode, 
      background: "opaque", // 無意味
    };
    console.log(imageRequest);
    const { requestId } = await text2Image(imageRequest);

    await saveRequest(get(mainBookFileSystem)!, "image", mode, requestId);

    const perf = performance.now();
    const { mediaResources } = await pollMediaStatus({ mediaType: "image", mode, requestId });

    console.log("generateImage_Flux", performance.now() - perf);

    analyticsEvent('generate_flux');

    return mediaResources as HTMLCanvasElement[];
  }
  catch(error: any) {
    if (isContentsPolicyViolationError(error)) {
      toastStore.trigger({ message: `画像生成エラー: ジェネレータに拒否されました。<br/>おそらくコンテントポリシー違反です。`, timeout: 5000});
    } else {
      toastStore.trigger({ message: `画像生成エラー: ${error.context.statusText}`, timeout: 3000});
    }
    throw error;
  }
}

async function generateImage_Gpt1(prompt: string, image_size: {width: number, height: number}, mode: ImagingMode, num_images: number, background: ImagingBackground): Promise<HTMLCanvasElement[]> {
  console.log("running feathral");
  try {
    let imageRequest: TextToImageRequest = {
      provider: "gpt-image-1",
      prompt, 
      imageSize: image_size,
      numImages: num_images,
      mode, 
      background,
    };
    console.log(imageRequest);
    const { requestId } = await text2Image(imageRequest);

    await saveRequest(get(mainBookFileSystem)!, "image", mode, requestId);

    const perf = performance.now();
    const { mediaResources } = await pollMediaStatus({ mediaType: "image", mode, requestId });

    console.log("generateImage_Gpt1", performance.now() - perf);

    analyticsEvent('generate_gpt1');

    return mediaResources as HTMLCanvasElement[];
  }
  catch(error: any) {
    if (isContentsPolicyViolationError(error)) {
      toastStore.trigger({ message: `画像生成エラー: ジェネレータに拒否されました。<br/>おそらくコンテントポリシー違反です。`, timeout: 5000});
    } else {
      toastStore.trigger({ message: `画像生成エラー: ${error.context.statusText}`, timeout: 3000});
    }
    throw error;
  }
}

async function generateImage_Qwen(prompt: string, image_size: {width: number, height: number}, mode: ImagingMode, num_images: number): Promise<HTMLCanvasElement[]> {
  console.log("running feathral");
  try {
    let imageRequest: TextToImageRequest = {
      provider: "qwen",
      prompt, 
      imageSize: image_size,
      numImages: num_images,
      mode, 
      background: "opaque", // 無意味
    };
    console.log(imageRequest);
    const { requestId } = await text2Image(imageRequest);

    await saveRequest(get(mainBookFileSystem)!, "image", mode, requestId);

    const perf = performance.now();
    const { mediaResources } = await pollMediaStatus({ mediaType: "image", mode, requestId });

    console.log("generateImage_Qwen", performance.now() - perf);

    analyticsEvent('generate_qwen');

    return mediaResources as HTMLCanvasElement[];
  }
  catch(error: any) {
    if (isContentsPolicyViolationError(error)) {
      toastStore.trigger({ message: `画像生成エラー: ジェネレータに拒否されました。<br/>おそらくコンテントポリシー違反です。`, timeout: 5000});
    } else {
      toastStore.trigger({ message: `画像生成エラー: ${error.context.statusText}`, timeout: 3000});
    }
    throw error;
  }
}

export async function generateImage(prompt: string, image_size: {width: number, height: number}, mode: ImagingMode, num_images: number, background: ImagingBackground): Promise<HTMLCanvasElement[]> {
  if (mode.startsWith("gpt-image-1")) {
    return generateImage_Gpt1(prompt, image_size, mode, num_images, background);
  } else if (mode === "qwen-image") {
    return generateImage_Qwen(prompt, image_size, mode, num_images);
  } else {
    return generateImage_Flux(prompt, image_size, mode, num_images);
  }
}

export async function generateMarkedPageImages(imagingContext: ImagingContext, postfix: string, mode: ModeChoice, onProgress: (progress: number) => void) {
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
    if (mode.type === 'imaging') {
      await generatePageImages(imagingContext, postfix, mode.value, page, false, onProgress2);
    } else {
      await textEditPageImages(imagingContext, postfix, mode.value, page, onProgress2);
    }
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
    const canvases = await generateImage(`${postfix}\n${frame.prompt}`, {width:1024,height:1024}, mode, 1, "opaque");

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

async function textEditFrameImage(
  imagingContext: ImagingContext,
  postfix: string,
  model: ImagingMode,
  leafLayout: Layout,
  paperSize: Vector
) {
  try {
    const frame = leafLayout.element;
    const imageDataUrls: string[] = [];

    // 参考画像の追加: プロンプト中の [ref:####] を抽出して対応する refImages を添付
    if (Object.keys(imagingContext.refImages).length > 0) {
      const refTagRegex = /\[ref:([^\]]+)\]/g;
      const refKeys: string[] = [];
      let m: RegExpExecArray | null;
      const composedPrompt = `${postfix}\n${frame.prompt}`;
      while ((m = refTagRegex.exec(composedPrompt)) !== null) {
        const key = m[1].trim();
        if (key && !refKeys.includes(key)) {
          refKeys.push(key);
        }
      }
      for (const key of refKeys) {
        const canvas = imagingContext.refImages[key];
        if (canvas) {
          imageDataUrls.push(canvas.toDataURL('image/png'));
        }
      }
    }

    const prompt = `${postfix}\n${frame.prompt}`;
    // TextToImageRequest を構築
    const inferProvider = (m: ImagingMode): ImagingProvider => {
      return m.startsWith('gpt-image-1/') ? 'gpt-image-1' : 'flux';
    };
    const size = { width: Math.max(1, Math.round(leafLayout.size[0])), height: Math.max(1, Math.round(leafLayout.size[1])) };
    const req: TextToImageRequest = {
      provider: inferProvider(model),
      prompt,
      imageSize: size,
      numImages: 1,
      mode: model,
      background: 'opaque',
      imageDataUrls,
    };
    const { requestId } = await textEdit(req);
    const modeStr = `textedit:${model}`;
    await saveRequest(get(mainBookFileSystem)!, 'image', modeStr, requestId);

    const perf = performance.now();
    const { mediaResources } = await pollMediaStatus({ mediaType: 'image', mode: modeStr, requestId });
    console.log('textEditFrameImage', performance.now() - perf);

    const media = new ImageMedia(mediaResources[0] as HTMLCanvasElement);
    const film = new Film(media);
    frame.filmStack.films.push(film);
    frame.gallery.push(media);

    const transformer = new FilmStackTransformer(paperSize, frame.filmStack.films);
    transformer.scale(0.01);
    console.log('scaled');
    constraintLeaf(paperSize, leafLayout);
    redrawToken.set(true);

    imagingContext.succeeded++;
  } catch (error) {
    imagingContext.failed++;
    throw error;
  }
}

async function textEditPageImages(
  imagingContext: ImagingContext,
  postfix: string,
  model: ImagingMode,
  page: Page,
  onProgress: () => void
) {
  const leaves = collectLeaves(page.frameTree);
  const pageLayout = calculatePhysicalLayout(page.frameTree, page.paperSize, [0, 0]);
  const promises: Promise<void>[] = [];
  for (const leaf of leaves) {
    const leafLayout = findLayoutOf(pageLayout, leaf)!;
    promises.push((async () => {
      await textEditFrameImage(imagingContext, postfix, model, leafLayout, page.paperSize);
      const transformer = new FilmStackTransformer(page.paperSize, leaf.filmStack.films);
      transformer.scale(0.01);
      console.log('scaled');
      constraintLeaf(page.paperSize, leafLayout);
      onProgress();
    })());
  }
  imagingContext.total = promises.length;
  imagingContext.succeeded = 0;
  imagingContext.failed = 0;
  await Promise.all(promises);
  updateToken.set(true);
}

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

export const textToImageModeOptions: Array<{value: ImagingMode, name: string, cost: number, uiType: ImagingProvider}> = [
  { value: 'qwen-image', name: 'Qwen Image', cost: 4, uiType: "flux" },
  { value: 'gpt-image-1/low', name: 'GPT-image-1 low', cost: 2, uiType: "gpt-image-1" },
  { value: 'gpt-image-1/medium', name: 'GPT-image-1 medium', cost: 7, uiType: "gpt-image-1" },
  { value: 'gpt-image-1/high', name: 'GPT-image-1 high', cost: 30, uiType: "gpt-image-1" },
  { value: 'schnell', name: 'FLUX Schnell', cost: 1, uiType: "flux" },
  { value: 'pro', name: 'FLUX Pro', cost: 8, uiType: "flux" },
  { value: 'chibi', name: 'FLUX ちび', cost: 7, uiType: "flux" },
  { value: 'manga', name: 'FLUX まんが', cost: 7, uiType: "flux" },
  { value: 'comibg', name: 'シンプル背景', cost: 7, uiType: "flux" },
];

// Text edit model options (moved from TextEditModels.svelte)
export const textEditModeOptions: Array<{ value: ImagingMode; name: string, t2i: boolean }> = [
  { value: 'kontext/pro', name: 'Flux Kontext [Pro]', t2i: false },
  { value: 'kontext/max', name: 'Flux Kontext [Max]', t2i: false },
  { value: 'kontext/inscene', name: 'Flux Kontext [InScene]', t2i: false },
  // { value: 'gpt-image-1/low', name: 'GPT-IMAGE-1 low', t2i: true },
  // { value: 'gpt-image-1/medium', name: 'GPT-IMAGE-1 medium', t2i: true },
  { value: 'gpt-image-1/high', name: 'GPT-IMAGE-1 high', t2i: true },
  { value: 'nano-banana', name: 'Nano Banana', t2i: true },
];

type ImagingModeChoice = { type: "imaging", value: ImagingMode };
type TextEditModeChoice = { type: "textEdit", value: ImagingMode };
export type ModeChoice = ImagingModeChoice | TextEditModeChoice;

// ModeChoice のコスト計算（TextEditModes を参考に）
export function calculateModeChoiceCost(size: { width: number; height: number }, choice: ModeChoice): number {
  return calculateImagingCost(choice.value, size);
}
