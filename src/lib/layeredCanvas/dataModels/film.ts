import { type Vector, type Rect, getRectCenter, rectToCorners, reverse2D, translateRect, computeConstraintedRect } from "../tools/geometry/geometry";
import type { Media } from './media';
import type { Effect } from './effect';
import { ulid } from 'ulid';
import { ImageMedia } from "./media";
import type { FilmProceduralEffect } from "./proceduralEffects";
import { cloneProceduralParams } from "./proceduralEffects";

export type FilmProceduralEffectType = FilmProceduralEffect['type'];

export type FilmContent =
  | { kind: 'media'; media: Media }
  | { kind: 'procedural'; effect: FilmProceduralEffect }
  | { kind: 'groupHeader' };

export type Barriers = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export class Film  {
  ulid: string;
  content: FilmContent;
  n_scale: number;
  n_translation: Vector;
  rotation: number; // degree
  reverse: [number, number];
  visible: boolean;
  opacity: number;
  prompt: string | null;
  effects: Effect[];
  barriers: Barriers;
  blendMode: GlobalCompositeOperation; // Canvas 2D blend mode
  groupDepth: number; // PSDグループのネスト深度（0 = ルート直下）
  groupName: string | null; // 所属グループ名（直近の親グループ名）
  
  selected: boolean; // 揮発性
  matrix: DOMMatrix | undefined; // 揮発性
  index: number | undefined; // 揮発性

  constructor(content: FilmContent) {
    this.ulid = ulid();
    this.content = content;
    this.n_scale = 1;
    this.n_translation = [0, 0];
    this.rotation = 0;
    this.reverse = [1, 1];
    this.visible = true;
    this.opacity = 1.0;
    this.prompt = "";
    this.effects = [];
    this.selected = false;
    this.barriers = { top: true, right: true, bottom: true, left: true };
    this.blendMode = 'source-over';
    this.groupDepth = 0;
    this.groupName = null;
  }

  clone() {
    const f = new Film(this.cloneContent());
    f.n_translation = [...this.n_translation];
    f.n_scale = this.n_scale;
    f.rotation = this.rotation;
    f.reverse = [...this.reverse];
    f.visible = this.visible;
    f.opacity = this.opacity;
    f.prompt = this.prompt;
    f.effects = this.effects.map(e => e.clone());
    f.barriers = {...this.barriers};
    f.blendMode = this.blendMode;
    f.groupDepth = this.groupDepth;
    f.groupName = this.groupName;
    return f;
  }

  static fromMedia(media: Media): Film {
    return new Film({ kind: 'media', media });
  }

  static fromProcedural(effect: FilmProceduralEffect): Film {
    return new Film({
      kind: 'procedural',
      effect: {
        type: effect.type,
        params: cloneProceduralParams(effect.params),
      },
    });
  }

  static fromGroupHeader(name: string, depth: number): Film {
    const film = new Film({ kind: 'groupHeader' });
    film.prompt = name;
    film.groupDepth = depth;
    film.groupName = null;
    return film;
  }

  get isGroupHeader(): boolean {
    return this.content.kind === 'groupHeader';
  }

  get media(): Media {
    if (this.content.kind !== 'media') {
      throw new Error('media accessed on procedural film');
    }
    return this.content.media;
  }

  set media(media: Media) {
    this.content = { kind: 'media', media };
  }

  get proceduralEffect(): FilmProceduralEffect | undefined {
    return this.content.kind === 'procedural' ? this.content.effect : undefined;
  }

  set proceduralEffect(effect: FilmProceduralEffect | undefined) {
    if (!effect) {
      throw new Error('procedural effect must be defined');
    }
    this.content = { kind: 'procedural', effect };
  }

  isProcedural(): boolean {
    return this.content.kind === 'procedural';
  }

  private cloneContent(): FilmContent {
    if (this.content.kind === 'media') {
      return { kind: 'media', media: this.content.media };
    }
    if (this.content.kind === 'groupHeader') {
      return { kind: 'groupHeader' };
    }
    return {
      kind: 'procedural',
      effect: {
        type: this.content.effect.type,
        params: cloneProceduralParams(this.content.effect.params),
      },
    };
  }

  getContentSize(paperSize: Vector): Vector {
    if (this.content.kind === 'media') {
      return [this.content.media.naturalWidth, this.content.media.naturalHeight];
    }
    if (this.content.kind === 'groupHeader') {
      return [0, 0];
    }
    const side = Film.getProceduralBaseSize(paperSize);
    return [side, side];
  }

  static getProceduralBaseSize(hostSize: Vector): number {
    const width = Math.abs(hostSize[0] ?? 0);
    const height = Math.abs(hostSize[1] ?? 0);
    const side = Math.max(width, height);
    return Math.max(1, side);
  }

  getPlainRect(paperSize: Vector) {
    const [w, h] = this.getContentSize(paperSize);
    const rect: Rect = [- w/2, - h/2, w, h];
    return rect;
  }

  // Shifted = Physicalとscaleは一緒だが、translationはコマの中心から相対

  static getShiftedScale(paperSize: Vector, contentSize: Vector, n_scale: number): number {
    const imageSize = Math.max(1, Math.min(contentSize[0], contentSize[1]));
    const pageSize = Math.min(paperSize[0], paperSize[1]);
    const scale = pageSize / imageSize
    return n_scale * scale;
  }

  getShiftedScale(paperSize: Vector): number {
    return Film.getShiftedScale(paperSize, this.getContentSize(paperSize), this.n_scale);
  }

  setShiftedScale(paperSize: Vector, scale: number): void {
    const contentSize = this.getContentSize(paperSize);
    const imageSize = Math.max(1, Math.min(contentSize[0], contentSize[1]));
    const pageSize = Math.min(paperSize[0], paperSize[1]);
    this.n_scale = scale / (pageSize / imageSize);
  }

  static getShiftedTranslation(paperSize: Vector, contentSize: Vector, n_translation: Vector): Vector {
    const imageSize = Math.max(1, Math.min(contentSize[0], contentSize[1]));
    const pageSize = Math.min(paperSize[0], paperSize[1]);
    const scale = pageSize / imageSize;
    const translation: Vector = [n_translation[0] * scale, n_translation[1] * scale];
    return translation;
  }

  getShiftedTranslation(paperSize: Vector): Vector {
    return Film.getShiftedTranslation(paperSize, this.getContentSize(paperSize), this.n_translation);
  }

  setShiftedTranslation(paperSize: Vector, translation: Vector): void {
    const contentSize = this.getContentSize(paperSize);
    const imageSize = Math.max(1, Math.min(contentSize[0], contentSize[1]));
    const pageSize = Math.min(paperSize[0], paperSize[1]);
    const scale = pageSize / imageSize;
    this.n_translation = [translation[0] / scale, translation[1] / scale];
  }

  static getShiftedRect(paperSize: Vector, contentSize: Vector, n_scale: number, n_translation: Vector, rotation: number): Rect {
    const scale = Film.getShiftedScale(paperSize, contentSize, n_scale);
    const translation = Film.getShiftedTranslation(paperSize, contentSize, n_translation);
    const [w, h] = [contentSize[0] * scale, contentSize[1] * scale];
    const [x, y] = translation;
    const rect: Rect = [x - w/2, y - h/2, w, h];
    return rect;
  }

  getShiftedRect(paperSize: Vector): Rect {
    return Film.getShiftedRect(paperSize, this.getContentSize(paperSize), this.n_scale, this.n_translation, this.rotation);
  }
  
  makeMatrix(paperSize: Vector): DOMMatrix {
    const scale = this.getShiftedScale(paperSize);
    const translation = this.getShiftedTranslation(paperSize);
    const matrix = new DOMMatrix();
    matrix.translateSelf(translation[0], translation[1]);
    matrix.rotateSelf(-this.rotation);
    matrix.scaleSelf(scale, scale);
    return matrix;
  }

}

export class FilmStack  {
  films: Film[];

  constructor() {
    this.films = [];
  }

  getSelectedFilms(): Film[] {
    return this.films.filter(film => film.selected);
  }

  getOperationTargetFilms(): Film[] {
    const films = this.getSelectedFilms();
    return 0 < films.length ? films : this.films;
  }
}

export class FilmStackTransformer {
  paperSize: Vector;
  films: Film[];
  pivot: Vector;

  constructor(paperSize: Vector, films: Film[]) {
    this.paperSize = paperSize;
    this.films = films;
    films.forEach((film, i) => {
      film.matrix = film.makeMatrix(paperSize);
    });

    this.pivot = [paperSize[0] / 2, paperSize[1] / 2];
    const r = calculateMinimumBoundingRect(paperSize, films);
    if (r != null) {
      this.pivot = getRectCenter(r);
    }
  }

  scale(s: number) {
    const rootMatrix = new DOMMatrix();
    rootMatrix.scaleSelf(s);

    this.films.forEach((film) => {
      const m = rootMatrix.multiply(film.matrix);
      film.setShiftedTranslation(this.paperSize, [m.e, m.f]);
      film.setShiftedScale(this.paperSize, Math.sqrt(m.a * m.a + m.b * m.b));
    });
  }

  rotate(q: number) {
    const rotation = Math.max(-180, Math.min(180, q));
    const rootMatrix = new DOMMatrix();
    rootMatrix.translateSelf(...this.pivot);
    rootMatrix.rotateSelf(-rotation);
    rootMatrix.translateSelf(...reverse2D(this.pivot));

    this.films.forEach((film) => {
      const m = rootMatrix.multiply(film.matrix);
      film.rotation = -Math.atan2(m.b, m.a) * 180 / Math.PI;
      film.setShiftedTranslation(this.paperSize, [m.e, m.f]);
    });
  }
}

export function calculateMinimumBoundingRect(paperSize: Vector, films: Film[]): Rect | null {
  if (films.length === 0) { return null; }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  films.forEach(film => {
    const transformedCorners = transformFilm(paperSize, film);
    transformedCorners.forEach(corner => {
      const [x, y] = corner;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  return [ minX, minY, maxX - minX, maxY - minY ];
}

function transformFilm(paperSize: Vector, film: Film): Vector[] {
  const rect: Rect = film.getPlainRect(paperSize);
  const corners = rectToCorners(rect);

  const matrix = film.makeMatrix(paperSize);
  return corners.map(corner => matrix.transformPoint({x: corner[0], y: corner[1]})).map(p => [p.x, p.y]);
}

export function fitFilms(paperSize: Vector, constraintRect: Rect, films: Film[]): void {
  const constraintCenter = getRectCenter(constraintRect);
  const mergedRect = calculateMinimumBoundingRect(paperSize, films)!;

  const { scale: targetScale, translation: targetTranslation } = computeConstraintedRect(
    translateRect(mergedRect, constraintCenter),
    constraintRect);

  const rootMatrix = new DOMMatrix();
  rootMatrix.scaleSelf(targetScale, targetScale);
  rootMatrix.translateSelf(...targetTranslation);

  films.forEach(film => {
    const m = rootMatrix.multiply(film.makeMatrix(paperSize));
    const scale = Math.sqrt(m.a * m.a + m.b * m.b);
    film.setShiftedScale(paperSize, scale);
    film.setShiftedTranslation(paperSize, [m.e, m.f]);
  });
}

export function insertFilms(paperSize: Vector, constraintRect: Rect, index: number, films: Film[], targetFilms: Film[], gallery: Media[]): void {
  const transformer = new FilmStackTransformer(paperSize, films);
  transformer.scale(0.01);
  fitFilms(paperSize, constraintRect, films);

  targetFilms.splice(index, 0, ...films);

  for (const film of films) {     
    if (film.content.kind === 'media') {
      const media = film.content.media;
      if (media instanceof ImageMedia) {
        gallery.push(media);
      }
    }
  }
}
