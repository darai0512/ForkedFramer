import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { analyticsEvent } from "./analyticsEvent";
import { onlineStatus } from './accountStore';
import { waitDialog } from './waitDialog';
import { Bubble } from '../lib/layeredCanvas/dataModels/bubble';
import type { Page } from '../lib/book/book';
import type { TextMaskResponse } from './edgeFunctions/types/imagingTypes.d';
import { calculatePhysicalLayout, findLayoutOf, FrameElement } from '../lib/layeredCanvas/dataModels/frameTree';
import { trapezoidBoundingRect } from '../lib/layeredCanvas/tools/geometry/trapezoid';
import type { Vector } from '../lib/layeredCanvas/tools/geometry/geometry';
import { measureHorizontalText, measureVerticalText } from '../lib/layeredCanvas/tools/draw/drawText';

export type TextLiftSelection = {
  id: number;
  enabled: boolean;
  text?: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  orientation: TextMaskResponse['boxes'][number]['orientation'];
};

export type TextLiftDialogResult = {
  committed: boolean;
  selections: TextLiftSelection[];
  response: TextMaskResponse;
};

export async function textLiftFilm(page: Page, film: Film, frame?: FrameElement) {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `テキスト抽出はサインインしてないと使えません`, timeout: 3000});
    return null;
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `テキスト抽出は画像のみ使えます`, timeout: 3000});
    return null;
  }
  const imageMedia = film.content.media as ImageMedia;
  const sourceCanvas = imageMedia.drawSource;

  const dialogResult = await waitDialog<TextLiftDialogResult | null>('textlift', { title: "テキスト抽出", imageSource: sourceCanvas });
  if (!dialogResult?.committed) {
    return null;
  }

  const paperSize = page.paperSize;
  const enabledSelections = dialogResult.selections
    .filter(s => s.enabled)
    .map(sel => {
      const text = sel.text ?? dialogResult.response.boxes[sel.id]?.text;
      return { ...sel, text: text?.trim() ?? '' };
    })
    .filter(s => s.text.length > 0);

  enabledSelections.forEach((selection, idx) => {
    const bubble = new Bubble();
    bubble.text = selection.text;
    bubble.initOptions();
    bubble.direction = selection.orientation === 'vertical' ? 'v' : 'h';
    bubble.fillColor = 'rgba(255, 255, 255, 0)';
    bubble.shape = 'none';

    const frameLayout = frame ? locateFrameLayout(page, frame) : locateFrameLayoutByFilm(page, film);
    const placed = placeBubbleBySelection(bubble, selection, film, imageMedia, frameLayout, paperSize);
    if (!placed) {
      // フレームが特定できない場合は従来の適当配置にフォールバック
      const baseX = paperSize[0] / 2 + (idx % 3 - 1) * 120;
      const baseY = paperSize[1] / 2 + Math.floor(idx / 3) * 140;
      bubble.setPhysicalCenter(paperSize, [baseX, baseY]);
      const size = bubble.calculateFitSize(paperSize);
      bubble.setPhysicalSize(paperSize, size);
    }

    page.bubbles.push(bubble);
  });

  analyticsEvent('textlift');
  return dialogResult;
}

function locateFrameLayout(page: Page, frame: FrameElement) {
  const layout = calculatePhysicalLayout(page.frameTree, page.paperSize, [0, 0]);
  return findLayoutOf(layout, frame);
}

function locateFrameLayoutByFilm(page: Page, film: Film) {
  const frame = findFrameElementByFilm(page.frameTree, film);
  if (!frame) { return null; }
  return locateFrameLayout(page, frame);
}

function findFrameElementByFilm(root: FrameElement, film: Film): FrameElement | null {
  if (root.filmStack.films.includes(film)) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findFrameElementByFilm(child, film);
    if (found) { return found; }
  }
  return null;
}

function placeBubbleBySelection(
  bubble: Bubble,
  selection: TextLiftSelection,
  film: Film,
  media: ImageMedia,
  frameLayout: ReturnType<typeof locateFrameLayout>,
  paperSize: Vector
): boolean {
  if (!frameLayout) { return false; }

  // reverse / rotation は無視する前提
  const [fx, fy, fw, fh] = trapezoidBoundingRect(frameLayout.corners);
  const frameCenter: Vector = [fx + fw * 0.5, fy + fh * 0.5];
  const imgW = media.naturalWidth;
  const imgH = media.naturalHeight;

  // Canvas描画と同じ行列: center → translation → rotation(無視) → scale → move to image origin
  const m = film.makeMatrix(paperSize);

  const toPage = (x: number, y: number): Vector => {
    // film.makeMatrix は画像中心原点（左右上下-0.5幅/高さ）前提なので平行移動してから適用
    const p = m.transformPoint({ x: x - imgW * 0.5, y: y - imgH * 0.5 });
    return [frameCenter[0] + p.x, frameCenter[1] + p.y];
  };

  const p0 = toPage(selection.box.x0, selection.box.y0);
  const p1 = toPage(selection.box.x1, selection.box.y1);
  const center: Vector = [
    (p0[0] + p1[0]) * 0.5,
    (p0[1] + p1[1]) * 0.5,
  ];
  const boxWidth = Math.abs(p1[0] - p0[0]);
  const boxHeight = Math.abs(p1[1] - p0[1]);

  adjustBubbleFontSize(bubble, paperSize, boxWidth, boxHeight);
  bubble.setPhysicalCenter(paperSize, center);
  const size = bubble.calculateFitSize(paperSize);
  bubble.setPhysicalSize(paperSize, size);
  return true;
}

function adjustBubbleFontSize(bubble: Bubble, paperSize: Vector, boxWidth: number, boxHeight: number) {
  const limit = bubble.direction === 'h' ? boxHeight : boxWidth;
  if (limit <= 0) { return; }

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) { return; }

  const measureExtent = (fontSize: number) => {
    const unmargin = bubble.direction == 'v' ? fontSize * 0.15 : fontSize * 0.50; // TextLiftのBOXはマージンなしなので、フォントサイズに応じて適当に補正
    const baselineSkip = fontSize * 1.5 * (1.0 + bubble.lineSkip);
    const charSkip = fontSize * (1.0 + bubble.charSkip);
    ctx.font = `${bubble.fontStyle} ${bubble.fontWeight} ${fontSize}px '${bubble.fontFamily}'`;
    if (bubble.direction === 'v') {
      return measureVerticalText(ctx, Infinity, bubble.text, baselineSkip, charSkip, bubble.autoNewline).width - unmargin;
    }
    return measureHorizontalText(ctx, Infinity, bubble.text, baselineSkip, charSkip, bubble.autoNewline).height - unmargin;
  };

  const baseFontSize = bubble.getPhysicalFontSize(paperSize);
  let low = 1;
  let high = Math.max(limit * 2, baseFontSize, 8);

  // 収まる寸法を基準に最大フォントサイズを探索（TextLiftのBOXはマージンなし）
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    const extent = measureExtent(mid);
    if (extent <= limit) {
      low = mid;
    } else {
      high = mid;
    }
  }

  bubble.setPhysicalFontSize(paperSize, low);
}
