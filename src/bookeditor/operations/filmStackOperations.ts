import { get } from "svelte/store";
import { Film } from "../../lib/layeredCanvas/dataModels/film";
import { ImageMedia } from "../../lib/layeredCanvas/dataModels/media";
import type { Page } from '../../lib/book/book';
import { toolTipRequest } from '../../utils/passiveToolTipStore';
import { commit, delayedCommiter } from './commitOperations';
import { makePlainCanvas } from "../../lib/layeredCanvas/tools/imageUtil";
import { mainBook } from '../workspaceStore';
import type { GeneratedFilmResult } from "../../generator/imageGeneratorStore";

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
  runImageGenerator: (prompt: string, filmStack: any, gallery: any, frameSize: [number, number]) => Promise<GeneratedFilmResult | null>,
  calculateScale: (film: Film, target: T) => number,
  targetStore: any,
  element: any,
  frameSize: [number, number]
): Promise<void> {
  if (!runImageGenerator) return;

  toolTipRequest.set(null);

  const r = await runImageGenerator(inputPrompt, target.filmStack, element.gallery, frameSize);
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


export async function handleCoverCommand<T extends FilmOperationTarget>(
  target: T,
  calculateSize: () => [number, number],
  targetStore: any
): Promise<void> {
  const size = calculateSize();
  size[0] = Math.max(size[0], 256);
  size[1] = Math.max(size[1], 256);
  const media = new ImageMedia(makePlainCanvas(size[0], size[1], "#ffffff00"));
  const film = Film.fromMedia(media);
  film.setShiftedScale(target.page.paperSize, 1.0);
  target.filmStack.films.push(film);
  commit(null);
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
