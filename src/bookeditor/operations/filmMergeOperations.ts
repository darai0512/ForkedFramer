import { makePlainCanvas } from "../../lib/layeredCanvas/tools/imageUtil";
import { Film, FilmStack } from "../../lib/layeredCanvas/dataModels/film";
import { ImageMedia } from "../../lib/layeredCanvas/dataModels/media";
import type { Vector } from "../../lib/layeredCanvas/tools/geometry/geometry";
import { drawProceduralEffect } from "../../lib/layeredCanvas/dataModels/proceduralEffects";

/**
 * 選択されたレイヤー（未選択の場合は全レイヤー）を結合する
 */
export function mergeSelectedFilms(filmStack: FilmStack, paperSize: Vector): Film | null {
  const targetFilms = filmStack.getOperationTargetFilms();
  
  if (targetFilms.length === 0) {
    return null;
  }
  
  if (targetFilms.length === 1) {
    // 1つしかない場合は結合する必要がない
    return null;
  }

  // 最小外接矩形を計算
  const boundingRect = calculateBoundingRect(targetFilms, paperSize);
  
  if (!boundingRect) {
    return null;
  }

  // 結合レイヤーを描画
  const mergedFilm = renderMergedFilms(targetFilms, boundingRect, paperSize);
  
  if (!mergedFilm) {
    return null;
  }

  // 対象レイヤーを削除し、結合レイヤーを挿入
  const insertIndex = getInsertIndex(filmStack, targetFilms);
  
  // 対象レイヤーを削除
  filmStack.films = filmStack.films.filter(film => !targetFilms.includes(film));
  
  // 結合レイヤーを挿入
  filmStack.films.splice(insertIndex, 0, mergedFilm);
  
  return mergedFilm;
}

/**
 * 対象フィルムの最小外接矩形を計算（paperSize座標系での実際のサイズ）
 */
function calculateBoundingRect(films: Film[], paperSize: Vector): { left: number, top: number, right: number, bottom: number, width: number, height: number } | null {
  if (films.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const film of films) {
    if (!film.visible) continue;
    
    // 回転を考慮したフィルムの境界を計算
    const corners = getTransformedFilmCorners(film, paperSize);
    
    for (const [x, y] of corners) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (minX === Infinity) return null;

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * 変換されたフィルムの4つの角の座標を取得（paperSize座標系）
 */
function getTransformedFilmCorners(film: Film, paperSize: Vector): Vector[] {
  const scale = film.getShiftedScale(paperSize);
  const translation = film.getShiftedTranslation(paperSize);
  const [contentWidth, contentHeight] = film.getContentSize(paperSize);
  const width = contentWidth * scale;
  const height = contentHeight * scale;
  
  // フィルムのローカル座標での4つの角（スケール済み）
  const localCorners: Vector[] = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2]
  ];

  // トランスフォーム適用
  const corners: Vector[] = [];
  for (const [x, y] of localCorners) {
    // 反転適用
    let tx = x * film.reverse[0];
    let ty = y * film.reverse[1];
    
    // 回転適用
    if (film.rotation !== 0) {
      const rad = -film.rotation * Math.PI / 180; // drawFilmStackと同じく負の値
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotX = tx * cos - ty * sin;
      const rotY = tx * sin + ty * cos;
      tx = rotX;
      ty = rotY;
    }
    
    // 平行移動適用（paperSize座標系）
    tx += translation[0];
    ty += translation[1];
    
    corners.push([tx, ty]);
  }
  
  return corners;
}

/**
 * 結合レイヤーを描画
 */
function renderMergedFilms(films: Film[], boundingRect: { left: number, top: number, width: number, height: number }, paperSize: Vector): Film | null {
  // 最小サイズを保証
  const width = Math.max(1, Math.ceil(boundingRect.width));
  const height = Math.max(1, Math.ceil(boundingRect.height));
  
  const canvas = makePlainCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  
  // 描画座標をバウンディングボックスの左上を原点とする座標系に変換
  ctx.translate(-boundingRect.left, -boundingRect.top);
  
  // 各フィルムを描画（drawFilmStackと同じ方法で）
  const sortedFilms = [...films].sort((a, b) => {
    const indexA = a.index ?? 0;
    const indexB = b.index ?? 0;
    return indexA - indexB;
  });
  
  for (const film of sortedFilms) {
    if (!film.visible) continue;
    
    const scale = film.getShiftedScale(paperSize);
    const translation = film.getShiftedTranslation(paperSize);
    
    ctx.save();
    
    // drawFilmStackと同じ順序でトランスフォームを適用
    ctx.translate(translation[0], translation[1]);
    ctx.rotate(-film.rotation * Math.PI / 180);
    ctx.scale(scale * film.reverse[0], scale * film.reverse[1]);
    
    // メディア描画（エフェクトも考慮）
    if (film.content.kind === 'media') {
      let media = film.content.media;
      for (let i = film.effects.length - 1; 0 <= i; i--) {
        if (film.effects[i].outputMedia) {
          media = film.effects[i].outputMedia!;
          break;
        }
      }
      ctx.translate(-media.naturalWidth * 0.5, -media.naturalHeight * 0.5);
      ctx.drawImage(media.drawSource, 0, 0, media.naturalWidth, media.naturalHeight);
    } else {
      const [contentWidth, contentHeight] = film.getContentSize(paperSize);
      const side = Math.max(contentWidth, contentHeight);
      ctx.translate(-side * 0.5, -side * 0.5);
      drawProceduralEffect(film.content.effect, ctx, side);
    }
    
    ctx.restore();
  }
  
  // 新しいImageMediaを作成
  const imageMedia = new ImageMedia(canvas);
  const mergedFilm = Film.fromMedia(imageMedia);
  
  // 結合レイヤーの位置とスケールを設定
  // バウンディングボックスの中心座標（paperSize座標系）
  const centerX = boundingRect.left + boundingRect.width / 2;
  const centerY = boundingRect.top + boundingRect.height / 2;
  
  // ShiftedTranslationから逆算してn_translationを設定
  mergedFilm.setShiftedTranslation(paperSize, [centerX, centerY]);
  
  // スケールは1に設定（結合された画像がそのまま表示される）
  mergedFilm.setShiftedScale(paperSize, 1);
  mergedFilm.rotation = 0;
  mergedFilm.reverse = [1, 1];
  
  return mergedFilm;
}

/**
 * 結合レイヤーを挿入するインデックスを決定（最も下にあったレイヤーの位置）
 */
function getInsertIndex(filmStack: FilmStack, targetFilms: Film[]): number {
  let minIndex = Infinity;
  
  for (const film of targetFilms) {
    const index = filmStack.films.indexOf(film);
    if (index !== -1 && index < minIndex) {
      minIndex = index;
    }
  }
  
  return minIndex === Infinity ? 0 : minIndex;
}
