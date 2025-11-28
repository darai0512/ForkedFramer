import { type Writable, writable } from "svelte/store";
import type { Bubble } from "../../lib/layeredCanvas/dataModels/bubble";
import { Film } from "../../lib/layeredCanvas/dataModels/film";

import type { Page } from '../../lib/book/book';
import { minimumBoundingScale } from "../../lib/layeredCanvas/tools/geometry/geometry";
import { splitBubbleAt } from "../../lib/layeredCanvas/tools/bubbleUtil";
import { commit } from '../operations/commitOperations';
import type { FilmOperationTarget } from '../operations/filmStackOperations';
import type { GeneratedFilmResult } from "../../generator/imageGeneratorStore";
import {
  setupCommandSubscription,
  handleCoverCommand,
  handleEraserCommand,
  handleInpaintCommand,
  handleTextEditCommand,
  handleAngleEditCommand,
  handleSendToMaterialCollectionCommand,
  handleScribbleCommand,
  handleGenerateCommand,
  handlePunchCommand,
  handleUpscaleCommand,
  handleVideoCommand,
  processCommand
} from '../operations/filmStackOperations';

type BubbleInspectorCommand = "generate" | "cover" | "scribble" | "punch" | "upscale" | "video" | "split" | "inpaint" | "eraser" | "textedit" | "angleedit" | "sendToMaterialCollection";

export interface BubbleInspectorTarget extends FilmOperationTarget {
  bubble: Bubble;
  command: BubbleInspectorCommand | null;
  commandArgs?: any; // コマンドの追加パラメータ
}

export const bubbleInspectorTarget: Writable<BubbleInspectorTarget | null> = writable(null);
export const bubbleInspectorRebuildToken: Writable<number> = writable(0);

// コマンド実行に必要なツールへの参照
let painterRunWithBubble: ((page: Page, bubble: Bubble, film: Film) => Promise<void>) | null = null;
let runImageGenerator: ((prompt: string, filmStack: any, gallery: any) => Promise<GeneratedFilmResult | null>) | null = null;

// サブスクリプション解除用の関数参照用オブジェクト
const unsubscribeRef = { value: null as Function | null };

// ツール参照を設定
export function setBubbleCommandTools(
  _painterRunWithBubble: (page: Page, bubble: Bubble, film: Film) => Promise<void>,
  _runImageGenerator: (prompt: string, filmStack: any, gallery: any) => Promise<GeneratedFilmResult | null>
) {
  painterRunWithBubble = _painterRunWithBubble;
  runImageGenerator = _runImageGenerator;
  
  // 共通ライブラリを使用してサブスクリプション設定
  setupCommandSubscription<BubbleInspectorTarget>(
    bubbleInspectorTarget,
    onBubbleCommand,
    unsubscribeRef
  );
}

// コマンド処理関数
async function onBubbleCommand(bit: BubbleInspectorTarget | null) {
  if (!bit || bit.command === null) return;
  
  if (!painterRunWithBubble || !runImageGenerator) {
    console.error("Bubble command tools not initialized");
    return;
  }

  // 共通ライブラリを使用してコマンド処理

  await processCommand<BubbleInspectorTarget>(bit, bubbleInspectorTarget, {
    "cover": async (target) => handleCoverCommand(
      target,
      () => {
        const paperSize = target.page.paperSize;
        const bubbleSize = target.bubble.getPhysicalSize(paperSize);
        console.log(bubbleSize);
        const targetSize: [number,number] = [
          Math.ceil(bubbleSize[0] / 128) * 128,
          Math.ceil(bubbleSize[1] / 128) * 128
        ];
        return targetSize;
      },
      bubbleInspectorTarget,
    ),
    "eraser": handleEraserCommand,
    "inpaint": handleInpaintCommand,
    "textedit": handleTextEditCommand,
    "angleedit": handleAngleEditCommand,
    "scribble": async (target) => handleScribbleCommand(target, painterRunWithBubble!, target.bubble),
    "generate": async (target) => handleGenerateCommand(
      target,
      target.bubble.prompt,
      runImageGenerator!,
      (film, target) => {
        const paperSize = target.page.paperSize;
        const bubbleSize = target.bubble.getPhysicalSize(paperSize);
        return minimumBoundingScale(film.getContentSize(paperSize), bubbleSize);
      },
      bubbleInspectorTarget,
      target.bubble
    ),
    "punch": handlePunchCommand,
    "upscale": handleUpscaleCommand,
    "split": splitBubble,
    "video": handleVideoCommand,
    "sendToMaterialCollection": handleSendToMaterialCollectionCommand
  });
  
  bubbleInspectorRebuildToken.update(v => v + 1);
}

// バブルを分割する処理
async function splitBubble(bit: BubbleInspectorTarget) {
  const cursor = bit.commandArgs?.cursor as number;
  if (cursor === undefined || cursor === null) return;

  const page = bit.page;
  const paperSize = page.paperSize;

  const newBubble = splitBubbleAt(bit.bubble, paperSize, cursor);
  if (!newBubble) return;

  page.bubbles.push(newBubble);

  // インスペクタのターゲットを新しいバブルに設定
  bubbleInspectorTarget.set({
    ...bit,
    bubble: newBubble,
    commandArgs: undefined  // コマンド引数をクリア
  });

  commit(null);
}
