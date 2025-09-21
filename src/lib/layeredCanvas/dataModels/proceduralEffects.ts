import rgba from 'color-rgba';
import seedrandom from 'seedrandom';
import { color2string, tailCoordToWorldCoord } from '../tools/geometry/bubbleGeometry';
import type { Vector } from '../tools/geometry/geometry';

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
    const width = size;
    const height = size;
    const cx = width / 2;
    const cy = height / 2;

    const lineCount = Math.max(1, Math.round(clampNumber(readNumericParam(effect, 'lineCount', 200), 100, 300, 200)));
    const lineWidthRatio = clampNumber(readNumericParam(effect, 'lineWidth', 0.05), 0.01, 0.1, 0.05);
    const angleJitter = clampNumber(readNumericParam(effect, 'angleJitter', 0.05), 0, 0.2, 0.05);
    const startJitter = clampNumber(readNumericParam(effect, 'startJitter', 0.5), 0, 1, 0.5);
    const randomSeed = Math.round(clampNumber(readNumericParam(effect, 'randomSeed', 0), 0, 100, 0));

    const color = typeof effect.params['color'] === 'string' && effect.params['color'] !== ''
      ? effect.params['color'] as string
      : '#000000';

    const parsedColor = rgba(color);
    const colorArray = parsedColor.length === 4 ? [...parsedColor] : [0, 0, 0, 1];
    const fadeColor = [...colorArray];
    fadeColor[3] = 0;
    const startColor = color2string(colorArray);
    const endColor = color2string(fadeColor);

    const outerRadius = Math.hypot(cx, cy);
    const focalPoint = readVectorParam(effect, 'focalPoint', [0, 0]);
    const defaultRange: Vector = [0, outerRadius * 0.25];
    const focalRange = readVectorParam(effect, 'focalRange', defaultRange);
    const rangeMagnitude = Math.hypot(focalRange[0], focalRange[1]);
    const innerRadiusRatio = clampNumber(readNumericParam(effect, 'innerRadiusRatio', 0.25), 0, 1, 0.25);
    const innerRadius = Number.isFinite(rangeMagnitude) && 0 < rangeMagnitude
      ? Math.min(rangeMagnitude, outerRadius)
      : outerRadius * innerRadiusRatio;

    const lwFactor = lineWidthRatio * 0.1;

    const rng = seedrandom(String(randomSeed));

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + (rng() - 0.5) * angleJitter;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // 外側の点は常に中心(cx, cy)から outerRadius の距離
      const endX = cx + cos * outerRadius;
      const endY = cy + sin * outerRadius;

      // 内側の点は focalPoint でシフトされた位置から startDistance の距離
      const startDistance = innerRadius + (outerRadius - innerRadius) * Math.min(1, rng() * startJitter);
      const startX = cx + focalPoint[0] + cos * startDistance;
      const startY = cy + focalPoint[1] + sin * startDistance;

      const vx = endX - startX;
      const vy = endY - startY;
      const perpX = -vy * lwFactor;
      const perpY = vx * lwFactor;

      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      gradient.addColorStop(0, startColor);
      gradient.addColorStop(1, endColor);

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX + perpX, endY + perpY);
      ctx.lineTo(endX - perpX, endY - perpY);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }
};

const speedLinesRenderer: ProceduralEffectRenderer = {
  draw(effect, ctx, size) {
    const width = size;
    const height = size;
    const cx = width / 2;
    const cy = height / 2;

    const lineCount = Math.max(1, Math.round(clampNumber(readNumericParam(effect, 'lineCount', 70), 10, 200, 70)));
    const lineWidthRatio = clampNumber(readNumericParam(effect, 'lineWidth', 0.2), 0.01, 1, 0.2);
    const laneJitter = clampNumber(readNumericParam(effect, 'laneJitter', 0.05), 0, 0.2, 0.05);
    const startJitter = clampNumber(readNumericParam(effect, 'startJitter', 0.3), 0, 0.5, 0.3);
    const directionDeg = clampNumber(readNumericParam(effect, 'direction', 0), -180, 180, 0);
    const randomSeed = Math.round(clampNumber(readNumericParam(effect, 'randomSeed', 0), 0, 100, 0));

    const color = typeof effect.params['color'] === 'string' && effect.params['color'] !== ''
      ? effect.params['color'] as string
      : '#000000';

    const parsedColor = rgba(color);
    const baseColor = parsedColor.length === 4 ? [...parsedColor] : [0, 0, 0, 1];
    const transparentColor = [...baseColor];
    transparentColor[3] = 0;

    const rng = seedrandom(String(randomSeed));

    ctx.save();
    ctx.translate(cx, cy);

    // tailTipとtailMidの処理をbubbleGraphicと同じにする
    const tailTip = readVectorParam(effect, 'tailTip', [width * 0.25, 0]);
    const tailMidParam = readVectorParam(effect, 'tailMid', [0.5, 0]);
    const tailMid = tailCoordToWorldCoord([0, 0], tailTip, tailMidParam);

    const length = Math.hypot(width, height);
    if (!Number.isFinite(length) || length <= 1e-6) {
      ctx.restore();
      return;
    }

    const angle = Math.atan2(tailTip[1], tailTip[0]);
    ctx.rotate(angle + (directionDeg * Math.PI) / 180);

    // bubbleGraphicと同じグラデーション位置計算
    function rotate2D([x, y]: Vector, angle: number): Vector {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [x * cos - y * sin, x * sin + y * cos];
    }

    function projectionScalingFactor2D([fx, fy]: Vector, [nx, ny]: Vector): number {
      const magnitude = Math.sqrt(nx * nx + ny * ny);
      if (magnitude < 1e-6) return 0;
      return (fx * nx + fy * ny) / (magnitude * magnitude);
    }

    function clamp(value: number, min = 0, max = 1): number {
      return Math.min(max, Math.max(min, value));
    }

    function calculateNormalizedPosition([fx, fy]: Vector): number {
      const v0: Vector = [length * 0.5, 0];
      const [nx, ny] = rotate2D(v0, angle);
      const psf = 0.5 - projectionScalingFactor2D([fx, fy], [nx, ny]) * 0.5;
      return clamp(psf);
    }

    const psf0 = clamp(0.5 - Math.hypot(tailTip[0], tailTip[1]) / length);
    const psf1 = calculateNormalizedPosition(tailMid);

    for (let i = 0; i < lineCount; i++) {
      const y = (i + 0.5) / lineCount * length - length / 2 + rng() * length * laneJitter;
      const lx = -length * 0.5 + (rng() - 0.5) * width * startJitter;
      const lw = height * lineWidthRatio * 0.01 * (rng() + 0.5);

      const gradient = ctx.createLinearGradient(lx + length, y, lx, y);
      gradient.addColorStop(psf0, color2string(transparentColor));
      gradient.addColorStop(psf1, color2string(baseColor));
      gradient.addColorStop(1, color2string(baseColor));

      ctx.beginPath();
      ctx.moveTo(lx, y - lw);
      ctx.lineTo(lx + length, y);
      ctx.lineTo(lx, y + lw);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    ctx.restore();
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

const textOption = (
  init: () => string,
  placeholderKey?: string,
  placeholder?: string,
): FilmProceduralOption => ({
  type: 'text',
  init,
  placeholderKey,
  placeholder,
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
    innerRadiusRatio: numberOption(0, 1, 0.01, () => 0.25),
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
    direction: numberOption(-180, 180, 1, () => 0),
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
