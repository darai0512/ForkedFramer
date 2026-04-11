import { type Writable, writable, get } from "svelte/store";
import type { FrameElement } from "../../lib/layeredCanvas/dataModels/frameTree";
import { calculatePhysicalLayout, findLayoutOf } from "../../lib/layeredCanvas/dataModels/frameTree";
import { Film } from "../../lib/layeredCanvas/dataModels/film";
import type { Page } from '../../lib/book/book';
import { trapezoidBoundingRect } from "../../lib/layeredCanvas/tools/geometry/trapezoid";
import { minimumBoundingScale } from "../../lib/layeredCanvas/tools/geometry/geometry";
import { commit } from '../operations/commitOperations';
import type { FilmOperationTarget } from '../operations/filmStackOperations';
import type { GeneratedFilmResult } from "../../generator/imageGeneratorStore";
import {
  setupCommandSubscription,
  handleScribbleCommand,
  handleGenerateCommand,
  processCommand,
  handleCoverCommand,
} from '../operations/filmStackOperations';

type FrameInspectorCommand = "generate" | "cover" | "scribble";

export interface FrameInspectorTarget extends FilmOperationTarget {
  frame: FrameElement;
  command: FrameInspectorCommand | null;
}

export const frameInspectorTarget: Writable<FrameInspectorTarget | null> = writable(null);
export const frameInspectorRebuildToken: Writable<number> = writable(0);

// コマンド実行に必要なツールへの参照
let painterRunWithFrame: ((page: Page, frame: FrameElement, film: Film) => Promise<void>) | null = null;
let runImageGenerator: ((prompt: string, filmStack: any, gallery: any, frameSize: [number, number]) => Promise<GeneratedFilmResult | null>) | null = null;

// サブスクリプション解除用の関数参照用オブジェクト
const unsubscribeRef = { value: null as Function | null };

// ツール参照を設定
export function setFrameCommandTools(
  _painterRunWithFrame: (page: Page, frame: FrameElement, film: Film) => Promise<void>,
  _runImageGenerator: (prompt: string, filmStack: any, gallery: any, frameSize: [number, number]) => Promise<GeneratedFilmResult | null>
) {
  painterRunWithFrame = _painterRunWithFrame;
  runImageGenerator = _runImageGenerator;
  
  // 共通ライブラリを使用してサブスクリプション設定
  setupCommandSubscription<FrameInspectorTarget>(
    frameInspectorTarget,
    onFrameCommand,
    unsubscribeRef
  );
}

// コマンド処理関数
async function onFrameCommand(fit: FrameInspectorTarget | null) {
  if (!fit || fit.command === null) return;
  
  if (!painterRunWithFrame || !runImageGenerator) {
    console.error("Frame command tools not initialized");
    return;
  }

  // 共通ライブラリを使用してコマンド処理
  await processCommand<FrameInspectorTarget>(fit, frameInspectorTarget, {
    "cover": async (target) => handleCoverCommand(
      target,
      () => {
        const pageLayout = calculatePhysicalLayout(target.page.frameTree, target.page.paperSize, [0,0]);
        const leafLayout = findLayoutOf(pageLayout, target.frame);
        const frameRect = trapezoidBoundingRect(leafLayout!.corners);
        const targetSize: [number,number] = [
          Math.ceil(frameRect[2] / 128) * 128,
          Math.ceil(frameRect[3] / 128) * 128
        ];
        return targetSize;
      },
      frameInspectorTarget,
    ),
    "scribble": async (target) => handleScribbleCommand(target, painterRunWithFrame!, target.frame),
    "generate": async (target) => {
      const pageLayout = calculatePhysicalLayout(target.page.frameTree, target.page.paperSize, [0,0]);
      const leafLayout = findLayoutOf(pageLayout, target.frame);
      const frameRect = trapezoidBoundingRect(leafLayout!.corners);
      const frameSize: [number, number] = [frameRect[2], frameRect[3]];
      return handleGenerateCommand(
        target,
        fit.frame.prompt ?? "",
        runImageGenerator!,
        (film, target) => {
          return minimumBoundingScale(film.getContentSize(target.page.paperSize), frameSize);
        },
        frameInspectorTarget,
        target.frame,
        frameSize
      );
    },
  });
  
  frameInspectorRebuildToken.update(v => v + 1);
}
