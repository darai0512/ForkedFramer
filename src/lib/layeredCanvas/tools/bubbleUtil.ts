import type { Bubble } from "../dataModels/bubble";
import type { Vector } from "./geometry/geometry";

/**
 * バブルをカーソル位置で分割する
 * @param bubble 分割元のバブル（テキストが前半に変更される）
 * @param paperSize ページのサイズ
 * @param cursor 分割位置（テキストのインデックス）
 * @returns 新しいバブル（テキストの後半を持つ）、またはnull（分割できない場合）
 */
export function splitBubbleAt(
  bubble: Bubble,
  paperSize: Vector,
  cursor: number
): Bubble | null {
  const text = bubble.text;

  // カーソル位置が無効な場合は分割しない
  if (cursor <= 0 || cursor >= text.length) {
    return null;
  }

  const bubbleSize = bubble.getPhysicalSize(paperSize);
  const width = bubbleSize[0];
  const center = bubble.getPhysicalCenter(paperSize);

  // 新しいバブルを作成
  const newBubble = bubble.clone(false);
  newBubble.n_p0 = bubble.n_p0;
  newBubble.n_p1 = bubble.n_p1;
  newBubble.initOptions();
  newBubble.text = text.slice(cursor).trimStart();

  // 元のバブルのテキストを更新
  bubble.text = text.slice(0, cursor).trimEnd();

  // バブルの位置を調整（横にずらす）
  const c0: [number, number] = [center[0] + width / 2, center[1]];
  const c1: [number, number] = [center[0] - width / 2, center[1]];
  if (bubble.direction === 'v') {
    bubble.setPhysicalCenter(paperSize, c0);
    newBubble.setPhysicalCenter(paperSize, c1);
  } else {
    bubble.setPhysicalCenter(paperSize, c1);
    newBubble.setPhysicalCenter(paperSize, c0);
  }

  // バブルのサイズを調整
  const oldSize = bubble.calculateFitSize(paperSize);
  bubble.setPhysicalSize(paperSize, oldSize);
  const newSize = newBubble.calculateFitSize(paperSize);
  newBubble.setPhysicalSize(paperSize, newSize);

  return newBubble;
}
