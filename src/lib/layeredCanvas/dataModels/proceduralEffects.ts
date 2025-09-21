import rgba from 'color-rgba';
import seedrandom from 'seedrandom';
import { color2string, tailCoordToWorldCoord } from '../tools/geometry/bubbleGeometry';
import type { Vector } from '../tools/geometry/geometry';
import { magnitude2D, projectionScalingFactor2D, rotate2D, clamp, perpendicular2D } from '../tools/geometry/geometry';

export type FilmProceduralEffectType = 'motion-lines' | 'speed-lines';

export type FilmProceduralParamValue = number | string | boolean | Vector;

export type FilmProceduralParams = Record<string, FilmProceduralParamValue>;

export interface FilmProceduralEffect {
  type: FilmProceduralEffectType;
  params: FilmProceduralParams;
}

export function cloneProceduralParamValue(value: FilmProceduralParamValue): FilmProceduralParamValue {
  return Array.isArray(value) ? [...value] as Vector : value;
}

export function cloneProceduralParams(params: FilmProceduralParams): FilmProceduralParams {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, cloneProceduralParamValue(value)])
  ) as FilmProceduralParams;
}

export interface ProceduralEffectRenderer {
  draw(effect: FilmProceduralEffect, ctx: CanvasRenderingContext2D, size: number): void;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function readNumericParam(effect: FilmProceduralEffect, key: string, fallback: number): number {
  const raw = effect.params[key];
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function readVectorParam(effect: FilmProceduralEffect, key: string, fallback: Vector): Vector {
  const raw = effect.params[key];
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return [x, y];
    }
  }
  return [...fallback] as Vector;
}

const motionLinesRenderer: ProceduralEffectRenderer = {
  draw(effect, ctx, size) {
    const w = size;
    const h = size;

    ctx.save();
    try {
      // 原点を中央に移動（bubbleGraphicsのsizeToRectに対応）
      ctx.translate(size / 2, size / 2);

      const rng = seedrandom(String(readNumericParam(effect, 'randomSeed', 0)));

      const focalPoint = readVectorParam(effect, 'focalPoint', [0, 0]);
      const focalRange = readVectorParam(effect, 'focalRange', [0, 40]);
      const lineCount = clampNumber(readNumericParam(effect, 'lineCount', 200), 100, 300, 200);
      const lineWidth = clampNumber(readNumericParam(effect, 'lineWidth', 0.05), 0.01, 0.1, 0.05);
      const angleJitter = clampNumber(readNumericParam(effect, 'angleJitter', 0.05), 0, 0.2, 0.05);
      const startJitter = clampNumber(readNumericParam(effect, 'startJitter', 0.5), 0, 1, 0.5);
      const colorStr = String(effect.params.color || '#000000');

      ctx.lineWidth = 1;

      // 元のアルゴリズムに従う
      const icd = focalPoint;
      const rangeVector = focalRange;
      const range = Math.hypot(rangeVector[0], rangeVector[1]);
      const [ox, oy, od] = [0, 0, Math.hypot(w/2, h/2)]; // 外円
      const [ix, iy, id] = [icd[0], icd[1], range]; // 内円

      // グラデーション
      const gradient = ctx.createRadialGradient(ix, iy, id, ox, oy, od);
      const color0 = rgba(colorStr);
      const color1 = rgba(colorStr);
      color0[3] = 0;
      gradient.addColorStop(0.0, color2string(color0));
      gradient.addColorStop(0.2, color2string(color1));
      gradient.addColorStop(1.0, color2string(color1));
      ctx.fillStyle = gradient;

      // 線を描く
      for (let i = 0; i < lineCount; i++) {
        const angle = (i * 2 * Math.PI) / lineCount + (rng() - 0.5) * angleJitter;
        const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
        const sdr = id * (1 + rng() * startJitter);
        const p0 = [ix, iy];
        const p1 = [ox + dx * od, oy + dy * od];
        const v: Vector = [p1[0] - p0[0], p1[1] - p0[1]];
        const length = Math.hypot(...v);
        const p2 = [p0[0] + v[0] * sdr / length, p0[1] + v[1] * sdr / length];
        const lw = lineWidth * 0.1;
        const [q0, q1] = [perpendicular2D(v, lw), perpendicular2D(v, -lw)];
        ctx.beginPath();
        ctx.moveTo(p2[0], p2[1]);
        ctx.lineTo(p1[0] + q0[0], p1[1] + q0[1]);
        ctx.lineTo(p1[0] + q1[0], p1[1] + q1[1]);
        ctx.closePath();
        ctx.fill();
      }
    } finally {
      ctx.restore();
    }
  }
};

const speedLinesRenderer: ProceduralEffectRenderer = {
  draw(effect, ctx, size) {
    const w = size;
    const h = size;

    ctx.save();
    try {
      // 原点を中央に移動（bubbleGraphicsのsizeToRectに対応）
      ctx.translate(size / 2, size / 2);

      const rng = seedrandom(String(readNumericParam(effect, 'randomSeed', 0)));

      const tailTip = readVectorParam(effect, 'tailTip', [40, 0]);
      const tailMid = tailCoordToWorldCoord([0, 0], tailTip, readVectorParam(effect, 'tailMid', [0.5, 0]));
      const lineCount = clampNumber(readNumericParam(effect, 'lineCount', 70), 10, 200, 70);
      const lineWidth = clampNumber(readNumericParam(effect, 'lineWidth', 0.2), 0.01, 1, 0.2);
      const laneJitter = clampNumber(readNumericParam(effect, 'laneJitter', 0.05), 0, 0.2, 0.05);
      const startJitter = clampNumber(readNumericParam(effect, 'startJitter', 0.3), 0, 0.5, 0.3);
      const colorStr = String(effect.params.color || '#000000');

      const length = Math.hypot(w, h);
      if (!Number.isFinite(length) || length <= 1e-6) {
        return;
      }

      const angle = Math.atan2(tailTip[1], tailTip[0]);
      ctx.rotate(angle);

      function calculateNormalizedPosition([fx, fy]: Vector): number {
        const v0: Vector = [length * 0.5, 0];
        const [nx, ny] = rotate2D(v0, angle);
        const psf = 0.5 - projectionScalingFactor2D([fx, fy], [nx, ny]) * 0.5;
        return clamp(psf);
      }

      ctx.lineWidth = 1;

      const psf0 = clamp(0.5 - magnitude2D(tailTip) / length);
      const psf1 = calculateNormalizedPosition(tailMid);

      // 線を描く
      for (let i = 0; i < lineCount; i++) {
        const y = (i + 0.5) / lineCount * length - length/2 + rng() * length * laneJitter;
        const lx = -length * 0.5 + (rng() - 0.5) * w * startJitter;
        const lw = h * lineWidth * 0.01 * (rng() + 0.5);

        // グラデーション
        const gradient = ctx.createLinearGradient(lx + length, y, lx, y);
        const color0 = rgba(colorStr);
        const color1 = rgba(colorStr);
        color0[3] = 0;
        gradient.addColorStop(psf0, color2string(color0));
        gradient.addColorStop(psf1, color2string(color1));
        gradient.addColorStop(1.0, color2string(color0));
        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.moveTo(lx, y - lw);
        ctx.lineTo(lx + length, y);
        ctx.lineTo(lx, y + lw);
        ctx.closePath();
        ctx.fill();
      }
    } finally {
      ctx.restore();
    }
  }
};

const fallbackRenderer: ProceduralEffectRenderer = {
  draw(effect, ctx, size) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = `${Math.max(12, Math.round(size * 0.05))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(effect.type, size / 2, size / 2);
  }
};

export const proceduralEffectRegistry: Record<FilmProceduralEffectType, ProceduralEffectRenderer> = {
  'motion-lines': motionLinesRenderer,
  'speed-lines': speedLinesRenderer,
};

export function drawProceduralEffect(effect: FilmProceduralEffect, ctx: CanvasRenderingContext2D, size: number): void {
  const renderer = proceduralEffectRegistry[effect.type] ?? fallbackRenderer;
  ctx.save();
  renderer.draw(effect, ctx, size);
  ctx.restore();
}

export function renderProceduralEffect(effect: FilmProceduralEffect, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const targetSize = Math.max(1, Math.round(size || 0));
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('CanvasRenderingContext2D not available');
  }
  ctx.clearRect(0, 0, targetSize, targetSize);
  drawProceduralEffect(effect, ctx, targetSize);
  return canvas;
}

export type FilmProceduralOption =
  | { type: 'number'; min: number; max: number; step: number; init: () => number }
  | { type: 'color'; init: () => string }
  | { type: 'text'; init: () => string; placeholder?: string; placeholderKey?: string }
  | { type: 'handle'; icon: string; hint: string; init: () => Vector };

const numberOption = (min: number, max: number, step: number, init: () => number): FilmProceduralOption => ({
  type: 'number',
  min,
  max,
  step,
  init,
});

const colorOption = (init: () => string): FilmProceduralOption => ({
  type: 'color',
  init,
});


const handleOption = (icon: string, hint: string, init: () => Vector): FilmProceduralOption => ({
  type: 'handle',
  icon,
  hint,
  init,
});

export const filmProceduralOptionSets: Record<FilmProceduralEffectType, Record<string, FilmProceduralOption>> = {
  'motion-lines': {
    focalPoint: handleOption('circle', '内円の中心', () => [0, 0]),
    focalRange: handleOption('radius', '内円の範囲', () => [0, 40]),
    randomSeed: numberOption(0, 100, 1, () => 0),
    lineCount: numberOption(100, 300, 1, () => 200),
    lineWidth: numberOption(0.01, 0.1, 0.01, () => 0.05),
    angleJitter: numberOption(0, 0.2, 0.01, () => 0.05),
    startJitter: numberOption(0, 1, 0.01, () => 0.5),
    color: colorOption(() => '#000000'),
  },
  'speed-lines': {
    tailTip: handleOption('tail', '流線の先端', () => [40, 0]),
    tailMid: handleOption('curve', '流線の途中', () => [0.5, 0]),
    randomSeed: numberOption(0, 100, 1, () => 0),
    lineCount: numberOption(10, 200, 1, () => 70),
    lineWidth: numberOption(0.01, 1, 0.01, () => 0.2),
    laneJitter: numberOption(0, 0.2, 0.01, () => 0.05),
    startJitter: numberOption(0, 0.5, 0.01, () => 0.3),
    color: colorOption(() => '#000000'),
  },
};

export type ProceduralEffectParamSpec =
  | { kind: 'number'; label: string; labelKey?: string; min: number; max: number; step: number }
  | { kind: 'color'; label: string; labelKey?: string }
  | { kind: 'text'; label: string; labelKey?: string; placeholder?: string; placeholderKey?: string };

const sharedLabelKeys = new Map<string, string>([
  ['color', 'film.procedural.shared.color'],
  ['randomSeed', 'film.procedural.shared.randomSeed'],
]);

function optionToParamSpec(
  effectType: FilmProceduralEffectType,
  key: string,
  option: FilmProceduralOption,
): ProceduralEffectParamSpec | null {
  const labelKey = sharedLabelKeys.get(key) ?? `film.procedural.${effectType}.${key}`;

  switch (option.type) {
    case 'number':
      return {
        kind: 'number',
        label: key,
        labelKey,
        min: option.min,
        max: option.max,
        step: option.step,
      };
    case 'color':
      return {
        kind: 'color',
        label: key,
        labelKey,
      };
    case 'text':
      return {
        kind: 'text',
        label: key,
        labelKey,
        placeholder: option.placeholder,
        placeholderKey: option.placeholderKey,
      };
    case 'handle':
      return null;
  }
}

function optionDefault(option: FilmProceduralOption): FilmProceduralParamValue {
  return option.init();
}

export const proceduralEffectParamSpecs: Record<FilmProceduralEffectType, Record<string, ProceduralEffectParamSpec>> =
  Object.fromEntries(
    Object.entries(filmProceduralOptionSets).map(([type, options]) => {
      const effectType = type as FilmProceduralEffectType;
      return [
        effectType,
        Object.fromEntries(
          Object.entries(options)
            .map(([key, option]) => {
              const spec = optionToParamSpec(effectType, key, option);
              return spec ? [key, spec] as [string, ProceduralEffectParamSpec] : null;
            })
            .filter((entry): entry is [string, ProceduralEffectParamSpec] => entry !== null)
        ),
      ];
    })
  ) as Record<FilmProceduralEffectType, Record<string, ProceduralEffectParamSpec>>;

const defaultParams: Record<FilmProceduralEffectType, Record<string, FilmProceduralParamValue>> =
  Object.fromEntries(
    Object.entries(filmProceduralOptionSets).map(([type, options]) => [
      type,
      Object.fromEntries(
        Object.entries(options).map(([key, option]) => [key, optionDefault(option)])
      ),
    ])
  ) as Record<FilmProceduralEffectType, Record<string, FilmProceduralParamValue>>;

export function createProceduralEffect(
  type: FilmProceduralEffectType,
  overrides: Partial<Record<string, FilmProceduralParamValue>> = {}
): FilmProceduralEffect {
  const base = defaultParams[type];
  const initial = cloneProceduralParams(base);
  const merged = { ...initial } as FilmProceduralParams;
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = cloneProceduralParamValue(value as FilmProceduralParamValue);
  }
  return {
    type,
    params: merged,
  };
}
