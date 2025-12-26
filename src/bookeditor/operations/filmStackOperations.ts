import { get } from "svelte/store";
import { Film } from "../../lib/layeredCanvas/dataModels/film";
import { ImageMedia } from "../../lib/layeredCanvas/dataModels/media";
import type { Page } from '../../lib/book/book';
import { toastStore } from '@skeletonlabs/skeleton';
import { punchFilm } from '../../utils/punchImage';
import { upscaleFilm } from '../../utils/upscaleImage';
import { onlineStatus } from "../../utils/accountStore";
import { loading } from '../../utils/loadingStore';
import { toolTipRequest } from '../../utils/passiveToolTipStore';
import { commit, delayedCommiter } from './commitOperations';
import { generateMovie } from '../../utils/generateMovie';
import { makePlainCanvas } from "../../lib/layeredCanvas/tools/imageUtil";
import { eraserFilm } from "../../utils/eraserFilm";
import { inpaintFilm } from "../../utils/inpaintFilm";
import { textEditFilm } from "../../utils/textEditFilm";
import { angleEditFilm } from "../../utils/angleEditFilm";
import { mainBook } from '../workspaceStore'; // デバッグ用
import { textLiftFilm } from "../../utils/textLiftFilm";
import { layerizeFilm } from "../../utils/layerizeFilm";
import type { GeneratedFilmResult } from "../../generator/imageGeneratorStore";
import type { FrameElement } from "../../lib/layeredCanvas/dataModels/frameTree";

// 共通インターフェース - フィルムオペレーション対象
export interface FilmOperationTarget {
  page: Page;
  commandTargetFilm: Film | null;
  filmStack: { films: Film[] };
  prompt?: string;
}

// コマンド処理のサブスクリプション設定関数
export function setupCommandSubscription<T extends FilmOperationTarget>(
  targetStore: { subscribe: (callback: (target: T | null) => void) => Function },
  commandHandler: (target: T | null) => void,
  unsubscribeRef: { value: Function | null }
): void {
  // 既存のサブスクリプションを解除
  if (unsubscribeRef.value) {
    unsubscribeRef.value();
  }
  
  // 新しいサブスクリプションを開始
  unsubscribeRef.value = targetStore.subscribe(commandHandler);
}

// 描画モーダルの共通処理
export async function handleScribbleCommand<T extends FilmOperationTarget>(
  target: T,
  painterRun: (page: Page, element: any, film: Film) => Promise<void>,
  element: any
): Promise<void> {
  if (!painterRun) return;
  console.log("handleScribbleCommand", target, target.page?.id, get(mainBook)?.pages.map(p => p.id));
  
  toolTipRequest.set(null);
  const film = target.commandTargetFilm!;
  await painterRun(target.page, element, film);
  if (film.content.kind === 'media') {
    const media = film.content.media;
    if (media instanceof ImageMedia) {
      const canvas = media.drawSource;
      (canvas as any)["clean"] = {};
    }
  }
  commit(null);
}

// 画像生成の共通処理
export async function handleGenerateCommand<T extends FilmOperationTarget>(
  target: T,
  inputPrompt: string,
  runImageGenerator: (prompt: string, filmStack: any, gallery: any) => Promise<GeneratedFilmResult | null>,
  calculateScale: (film: Film, target: T) => number,
  targetStore: any,
  element: any
): Promise<void> {
  if (!runImageGenerator) return;

  toolTipRequest.set(null);
  
  const r = await runImageGenerator(inputPrompt, target.filmStack, element.gallery);
  if (!r) { return; }

  let film: Film;
  let outputPrompt: string | null = null;

  if (r.kind === 'media') {
    film = Film.fromMedia(r.media);
    outputPrompt = r.prompt;
  } else {
    film = Film.fromProcedural(r.effect);
    outputPrompt = r.prompt ?? null;
  }

  if (outputPrompt != null) {
    film.prompt = outputPrompt;
  }

  const scale = calculateScale(film, target);
  film.setShiftedScale(target.page.paperSize, scale);

  target.filmStack.films.push(film);
  if (element.prompt !== undefined) {
    element.prompt = outputPrompt;
  }
  
  targetStore.set(get(targetStore));
  commit(null);
}

// パンチ処理の共通処理
export async function handlePunchCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  if (get(onlineStatus) !== 'signed-in') {
    toastStore.trigger({ message: `ログインしていないと使えません`, timeout: 3000});
    return;
  }

  const film = target.commandTargetFilm!;
  if (film.content.kind !== 'media') { return; }
  if (!(film.content.media instanceof ImageMedia)) { return; }

  loading.set(true);
  await punchFilm(film);
  commit(null);
  loading.set(false);
}

// アップスケール処理の共通処理
export async function handleUpscaleCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  if (get(onlineStatus) !== 'signed-in') {
    toastStore.trigger({ message: `ログインしていないと使えません`, timeout: 3000});
    return;
  }

  const film = target.commandTargetFilm!;
  if (film.content.kind !== 'media') { return; }
  if (!(film.content.media instanceof ImageMedia)) { return; }

  await upscaleFilm(film);
  commit(null);
  toastStore.trigger({ message: `アップスケールしました`, timeout: 3000});
}

// 動画生成の共通処理
export async function handleVideoCommand<T extends FilmOperationTarget & { bubble?: any, frame?: any }>(
  target: T,
): Promise<void> {
  // frameまたはbubbleに実際のFilmStackオブジェクトが含まれている
  const actualFilmStack = target.frame?.filmStack || target.bubble?.filmStack;
  if (!actualFilmStack) {
    console.error("No valid filmStack found in target");
    return;
  }
  
  if (target.commandTargetFilm?.content.kind !== 'media') { return; }
  await generateMovie(actualFilmStack, target.commandTargetFilm!);
  commit(null);
}

export async function handleCoverCommand<T extends FilmOperationTarget>(
  target: T,
  calculateSize: () => [number, number],
  targetStore: any
): Promise<void> {
  const size = calculateSize();
  size[0] = Math.max(size[0], 256);
  size[1] = Math.max(size[1], 256);
  console.log("handleCoverCommand", size);
  const media = new ImageMedia(makePlainCanvas(size[0], size[1], "#ffffff00"));
  const film = Film.fromMedia(media);
  film.setShiftedScale(target.page.paperSize, 1.0);
  
  target.filmStack.films.push(film);
  commit(null);
}

export async function handleEraserCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  await eraserFilm(target.commandTargetFilm!);
  commit(null);
  loading.set(false);
}

export async function handleInpaintCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  await inpaintFilm(target.commandTargetFilm!);
  commit(null);
  loading.set(false);
}

export async function handleTextEditCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  const newFilm = await textEditFilm(target.commandTargetFilm!);
  if (newFilm) {
    const index = target.filmStack.films.indexOf(target.commandTargetFilm!);
    target.filmStack.films.splice(index + 1, 0, newFilm);
  }
  commit(null);
  loading.set(false);
}

export async function handleAngleEditCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  const newFilm = await angleEditFilm(target.commandTargetFilm!);
  if (newFilm) {
    const index = target.filmStack.films.indexOf(target.commandTargetFilm!);
    target.filmStack.films.splice(index + 1, 0, newFilm);
  }
  commit(null);
  loading.set(false);
}

export async function handleSendToMaterialCollectionCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  const { sendMediaToMaterialCollection } = await import('../../materialBucket/materialOperations');
  
  if (target.commandTargetFilm?.content.kind !== 'media') { return; }
  const result = await sendMediaToMaterialCollection(target.commandTargetFilm.content.media);
  
  toastStore.trigger({ 
    message: result.message, 
    timeout: 3000 
  });
}

export async function handleTextLiftCommand<T extends FilmOperationTarget & { frame?: FrameElement }>(
  target: T
): Promise<void> {
  const result = await textLiftFilm(target.page, target.commandTargetFilm!, target.frame);
  if (result?.erasedFilm) {
    const index = target.filmStack.films.indexOf(target.commandTargetFilm!);
    const insertIndex = index >= 0 ? index + 1 : target.filmStack.films.length;
    target.filmStack.films.splice(insertIndex, 0, result.erasedFilm);
  }
  if (result?.committed) {
    commit(null);
  }
  loading.set(false);
}

export async function handleLayerizeCommand<T extends FilmOperationTarget>(
  target: T
): Promise<void> {
  const film = target.commandTargetFilm!;

  try {
    const newFilms = await layerizeFilm(film);
    if (newFilms.length > 0) {
      const index = target.filmStack.films.indexOf(film);
      const insertIndex = index >= 0 ? index + 1 : target.filmStack.films.length;
      target.filmStack.films.splice(insertIndex, 0, ...newFilms);
      commit(null);
      toastStore.trigger({ message: `${newFilms.length}枚のレイヤーに分解しました`, timeout: 3000});
    }
  } catch (e) {
    console.error(e);
    toastStore.trigger({ message: `レイヤー化に失敗しました`, timeout: 3000});
  } finally {
    loading.set(false);
  }
}

// コマンド処理の共通フロー
export function processCommand<T extends FilmOperationTarget & { command: string | null }>(
  target: T | null,
  targetStore: any,
  handlers: Record<string, (target: T) => Promise<void>>
): Promise<void> | undefined {
  if (!target || target.command === null) return;

  delayedCommiter.force();

  // commandを保存してnullにリセット
  const command = target.command;
  targetStore.set({ ...target, command: null });

  // コマンドハンドラを実行
  const handler = handlers[command];
  if (handler) {
    return handler(target);
  }
  
  return undefined;
}
