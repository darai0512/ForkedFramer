import type { Vector } from "../tools/geometry/geometry";

export type FilmProceduralEffectType = 'concentration' | 'speedline' | 'burst';

export interface FilmProceduralEffect {
  type: FilmProceduralEffectType;
  params: Record<string, number | string | boolean>;
}

export interface ProceduralEffectRenderer {
  render(effect: FilmProceduralEffect, paperSize: Vector, target: HTMLCanvasElement): void;
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

function prepareCanvas(target: HTMLCanvasElement, paperSize: Vector): CanvasRenderingContext2D {
  const width = Math.max(1, Math.round(paperSize[0] || 0));
  const height = Math.max(1, Math.round(paperSize[1] || 0));
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  if (!ctx) {
    throw new Error('CanvasRenderingContext2D not available');
  }
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

const concentrationRenderer: ProceduralEffectRenderer = {
  render(effect, paperSize, target) {
    const ctx = prepareCanvas(target, paperSize);
    const width = target.width;
    const height = target.height;
    const cx = width / 2;
    const cy = height / 2;

    const lineCount = clampNumber(readNumericParam(effect, 'lineCount', 36), 4, 320, 36);
    const baseWidth = clampNumber(readNumericParam(effect, 'lineWidth', 1.5), 0.2, 10, 1.5);
    const innerRatio = clampNumber(readNumericParam(effect, 'innerRatio', 0.05), 0, 0.8, 0.05);
    const outerRatio = clampNumber(readNumericParam(effect, 'outerRatio', 1.05), 0.5, 2, 1.05);
    const jitter = clampNumber(readNumericParam(effect, 'angleJitter', 0.4), 0, 2, 0.4);

    const radius = Math.sqrt(cx * cx + cy * cy) * outerRatio;
    const innerRadius = Math.min(cx, cy) * innerRatio;

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = effect.params['color'] as string ?? 'rgba(0,0,0,0.9)';
    ctx.lineCap = 'round';

    // deterministic pseudo-random using sine hash
    const seed = effect.params['seed'] ?? `${effect.type}:${lineCount}:${baseWidth}:${innerRatio}:${outerRatio}:${jitter}`;
    const hashBase = typeof seed === 'number' ? seed : Array.from(String(seed)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    function pseudoRandom(i: number): number {
      const x = Math.sin(hashBase + i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    }

    for (let i = 0; i < lineCount; i++) {
      const t = i / lineCount;
      const angle = t * Math.PI * 2 + (pseudoRandom(i) - 0.5) * jitter;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const lw = baseWidth * (1 + pseudoRandom(i + 1) * 0.6);

      const ix = cx + cos * innerRadius;
      const iy = cy + sin * innerRadius;
      const ox = cx + cos * radius;
      const oy = cy + sin * radius;

      ctx.beginPath();
      ctx.lineWidth = lw;
      ctx.moveTo(ix, iy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }
  }
};

const speedlineRenderer: ProceduralEffectRenderer = {
  render(effect, paperSize, target) {
    const ctx = prepareCanvas(target, paperSize);
    const width = target.width;
    const height = target.height;

    const bandCount = clampNumber(readNumericParam(effect, 'bandCount', 24), 1, 160, 24);
    const bandWidthRatio = clampNumber(readNumericParam(effect, 'bandWidthRatio', 0.12), 0.02, 0.5, 0.12);
    const direction = clampNumber(readNumericParam(effect, 'direction', 0), -360, 360, 0) * (Math.PI / 180);
    const speedColor = effect.params['color'] as string ?? 'rgba(0,0,0,0.75)';

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(direction);

    const bandWidth = height * bandWidthRatio;
    const spacing = height / bandCount;

    ctx.fillStyle = speedColor;
    for (let i = -Math.ceil(bandCount / 2); i < Math.ceil(bandCount / 2); i++) {
      const offset = i * spacing;
      ctx.beginPath();
      ctx.rect(-width, offset - bandWidth / 2, width * 2, bandWidth);
      ctx.fill();
    }
    ctx.restore();
  }
};

const burstRenderer: ProceduralEffectRenderer = {
  render(effect, paperSize, target) {
    const ctx = prepareCanvas(target, paperSize);
    const width = target.width;
    const height = target.height;
    const cx = width / 2;
    const cy = height / 2;

    const ringCount = clampNumber(readNumericParam(effect, 'ringCount', 4), 1, 16, 4);
    const startRadiusRatio = clampNumber(readNumericParam(effect, 'startRatio', 0.2), 0, 1, 0.2);
    const color = effect.params['color'] as string ?? 'rgba(0,0,0,0.65)';

    ctx.fillStyle = 'transparent';
    ctx.strokeStyle = color;
    ctx.lineWidth = clampNumber(readNumericParam(effect, 'lineWidth', 2), 0.5, 12, 2);

    const maxRadius = Math.min(width, height) * 0.5;

    for (let i = 0; i < ringCount; i++) {
      const ratio = startRadiusRatio + (i / ringCount) * (1 - startRadiusRatio);
      ctx.beginPath();
      ctx.arc(cx, cy, maxRadius * ratio, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};

const fallbackRenderer: ProceduralEffectRenderer = {
  render(effect, paperSize, target) {
    const ctx = prepareCanvas(target, paperSize);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = `${Math.max(12, Math.round(target.width * 0.05))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(effect.type, target.width / 2, target.height / 2);
  }
};

export const proceduralEffectRegistry: Record<FilmProceduralEffectType, ProceduralEffectRenderer> = {
  concentration: concentrationRenderer,
  speedline: speedlineRenderer,
  burst: burstRenderer,
};

export function renderProceduralEffect(effect: FilmProceduralEffect, paperSize: Vector): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const renderer = proceduralEffectRegistry[effect.type] ?? fallbackRenderer;
  renderer.render(effect, paperSize, canvas);
  return canvas;
}
