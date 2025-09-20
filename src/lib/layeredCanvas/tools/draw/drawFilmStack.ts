import type { FilmStack, Film } from '../../dataModels/film';
import type { Vector } from '../geometry/geometry';
import { drawProceduralEffect } from "../../dataModels/proceduralEffects";

export function drawFilmStack(ctx: CanvasRenderingContext2D, filmStack: FilmStack, paperSize: Vector, center: Vector, clipFrame: ((ctx: CanvasRenderingContext2D, film: Film) => void) | null) {
  const films = filmStack.films;

  for (let film of films) {
    if (!film.visible) { continue; }

    const scale = film.getShiftedScale(paperSize);
    const translation = film.getShiftedTranslation(paperSize);

    ctx.save();
    if (clipFrame) {
      clipFrame(ctx, film);
    }
    ctx.translate(...center);
    ctx.translate(translation[0], translation[1]);
    ctx.rotate(-film.rotation * Math.PI / 180);
    ctx.scale(scale * film.reverse[0], scale * film.reverse[1]);

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
}

export function drawFilmStackBorders(ctx: CanvasRenderingContext2D, filmStack: FilmStack, paperSize: Vector) {
  const films = filmStack.films;

  for (let film of films) {
    if (!film.visible) { continue; }

    const scale = film.getShiftedScale(paperSize);
    const translation = film.getShiftedTranslation(paperSize);

    ctx.save();
    ctx.translate(translation[0], translation[1]);
    ctx.rotate(-film.rotation * Math.PI / 180);

    if (film.visible) {
      const sx = scale * film.reverse[0];
      const sy = scale * film.reverse[1];
      const [contentWidth, contentHeight] = film.getContentSize(paperSize);
      const iw = sx * contentWidth;
      const ih = sy * contentHeight;

      ctx.save();
      ctx.translate(-iw * 0.5, -ih * 0.5);
      ctx.strokeStyle = '#00000080';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, iw, ih);
      ctx.restore();
    }
    ctx.restore();
  }
}
