import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import type { Page } from '../lib/book/book';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { analyticsEvent } from "./analyticsEvent";
import type { Rect, Vector } from '../lib/layeredCanvas/tools/geometry/geometry';
import { type FrameElement, calculatePhysicalLayout, findLayoutOf } from '../lib/layeredCanvas/dataModels/frameTree';
import { trapezoidBoundingRect } from "../lib/layeredCanvas/tools/geometry/trapezoid";
import { add2D, getRectCenter } from "../lib/layeredCanvas/tools/geometry/geometry";
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore';

export function outPaintFilmInline(film: Film, padding: {left: number, top: number, right: number, bottom: number}): Film | null {
  if (film.content.kind !== 'media') {
    return null;
  }
  const imageMedia = film.content.media;
  if (!(imageMedia instanceof ImageMedia)) {
    return null;
  }

  if (film.reverse[0] < 0) {
    // 左右反転の場合、左右を入れ替える
    const tmp = padding.left;
    padding.left = padding.right;
    padding.right = tmp;
  }
  if (film.reverse[1] < 0) {
    // 上下反転の場合、上下を入れ替える
    const tmp = padding.top;
    padding.top = padding.bottom;
    padding.bottom = tmp;
  }

  const size = { width: imageMedia.naturalWidth, height: imageMedia.naturalHeight };
  const imageUrl = imageMedia.drawSourceCanvas.toDataURL("image/png");

  // beforeRequest形式でImageMediaを作成
  const newMedia = new ImageMedia({
    mediaType: 'image',
    mode: 'beforeRequest',
    action: 'outpaint',
    request: {
      dataUrl: imageUrl,
      size,
      padding
    }
  });

  const newFilm = film.clone();
  newFilm.media = newMedia;

  // 画像スケールの事前計算（実際の調整はメディアロード後に行う）
  // 元画像が大きすぎる場合、fal.aiがアスペクト比を維持したまま縮小するケースがあるので対応する
  const oldImageSize = Math.min(imageMedia.naturalWidth, imageMedia.naturalHeight);
  const newIdealImageSize = Math.min(size.width + padding.left + padding.right, size.height + padding.top + padding.bottom);
  // 仮のスケール設定（メディアロード後に調整される可能性がある）
  newFilm.n_scale = film.n_scale * (newIdealImageSize / oldImageSize);
  newFilm.n_translation = [0, 0]; // 微妙にずれるケースがあるが諦める

  // filmProcessorQueueに登録
  filmProcessorQueue.publish({ film: newFilm });

  analyticsEvent('outpaint');

  console.log("outPaintFilmInline: created beforeRequest film", newFilm);
  return newFilm;
}

// 外側の矩形と内側の矩形が与えられ、内側の矩形が外側の矩形を内包する最小の余白（ただし64px単位）を計算する
export function calculatePadding(outer: Rect, size: Vector, scale: number, translate: Vector): {left: number, top: number, right: number, bottom: number} {
  const [outerLeft, outerTop, outerWidth, outerHeight] = outer;
  const outerRight = outerLeft + outerWidth;
  const outerBottom = outerTop + outerHeight;
  const inner = {
    left: translate[0] - size[0] * scale / 2,
    top: translate[1] - size[1] * scale / 2,
    right: translate[0] + size[0] * scale / 2,
    bottom: translate[1] + size[1] * scale / 2,
  };

  const left = Math.max(0, Math.ceil((inner.left - outerLeft) / scale / 64) * 64);
  const top = Math.max(0, Math.ceil((inner.top - outerTop) / scale / 64) * 64);
  const right = Math.max(0, Math.ceil((outerRight - inner.right) / scale / 64) * 64);
  const bottom = Math.max(0, Math.ceil((outerBottom - inner.bottom) / scale / 64) * 64);

  return {left, top, right, bottom};
}

export function calculateFramePadding(page: Page, frame: FrameElement, film: Film): {left: number, top: number, right: number, bottom: number} {
  if (film.content.kind !== 'media') {
    throw new Error('calculateFramePaddingはメディアフィルムのみ対応しています');
  }
  const paperSize = page.paperSize;
  const pageLayout = calculatePhysicalLayout(page.frameTree, paperSize, [0,0]);
  const leafLayout = findLayoutOf(pageLayout, frame);
  const outerRect = trapezoidBoundingRect(leafLayout!.corners);
  const center = getRectCenter(outerRect);
  const scale = film.getShiftedScale(paperSize);
  const translation = add2D(film.getShiftedTranslation(paperSize), center);
  const padding = calculatePadding(outerRect, film.content.media.size, scale, translation);
  return padding;
}
