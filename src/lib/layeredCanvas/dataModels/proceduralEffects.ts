export type FilmProceduralEffectType = 'concentration' | 'speedline' | 'burst';

export interface FilmProceduralEffect {
  type: FilmProceduralEffectType;
  params: Record<string, number | string | boolean>;
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

const concentrationRenderer: ProceduralEffectRenderer = {
  draw(effect, ctx, size) {
    const width = size;
    const height = size;
    const cx = width / 2;
    const cy = height / 2;

    const lineCount = clampNumber(readNumericParam(effect, 'lineCount', 36), 4, 320, 36);
    const baseWidth = clampNumber(readNumericParam(effect, 'lineWidth', 1.5), 0.2, 10, 1.5);
    const innerRatio = clampNumber(readNumericParam(effect, 'innerRatio', 0.05), 0, 0.8, 0.05);
    const outerRatio = clampNumber(readNumericParam(effect, 'outerRatio', 1.05), 0.5, 2, 1.05);
    const jitter = clampNumber(readNumericParam(effect, 'angleJitter', 0.4), 0, 2, 0.4);

    const radius = Math.sqrt(cx * cx + cy * cy) * outerRatio;
    const innerRadius = Math.min(cx, cy) * innerRatio;

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
  draw(effect, ctx, size) {
    const width = size;
    const height = size;

    const bandCount = clampNumber(readNumericParam(effect, 'bandCount', 24), 1, 160, 24);
    const bandWidthRatio = clampNumber(readNumericParam(effect, 'bandWidthRatio', 0.12), 0.02, 0.5, 0.12);
    const direction = clampNumber(readNumericParam(effect, 'direction', 0), -360, 360, 0) * (Math.PI / 180);
    const speedColor = effect.params['color'] as string ?? 'rgba(0,0,0,0.75)';

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
  draw(effect, ctx, size) {
    const width = size;
    const height = size;
    const cx = width / 2;
    const cy = height / 2;

    const ringCount = clampNumber(readNumericParam(effect, 'ringCount', 4), 1, 16, 4);
    const startRadiusRatio = clampNumber(readNumericParam(effect, 'startRatio', 0.2), 0, 1, 0.2);
    const color = effect.params['color'] as string ?? 'rgba(0,0,0,0.65)';

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
  concentration: concentrationRenderer,
  speedline: speedlineRenderer,
  burst: burstRenderer,
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

export type ProceduralEffectParamSpec =
  | { kind: 'number'; label: string; min: number; max: number; step: number }
  | { kind: 'color'; label: string }
  | { kind: 'text'; label: string; placeholder?: string };

export const proceduralEffectParamSpecs: Record<FilmProceduralEffectType, Record<string, ProceduralEffectParamSpec>> = {
  concentration: {
    lineCount: { kind: 'number', label: 'Line Count', min: 4, max: 320, step: 1 },
    lineWidth: { kind: 'number', label: 'Line Width', min: 0.1, max: 10, step: 0.1 },
    innerRatio: { kind: 'number', label: 'Inner Ratio', min: 0, max: 0.8, step: 0.01 },
    outerRatio: { kind: 'number', label: 'Outer Ratio', min: 0.5, max: 2, step: 0.01 },
    angleJitter: { kind: 'number', label: 'Angle Jitter', min: 0, max: 2, step: 0.05 },
    color: { kind: 'color', label: 'Color' },
    seed: { kind: 'text', label: 'Seed', placeholder: 'optional' },
  },
  speedline: {
    bandCount: { kind: 'number', label: 'Band Count', min: 1, max: 160, step: 1 },
    bandWidthRatio: { kind: 'number', label: 'Band Width Ratio', min: 0.02, max: 0.5, step: 0.01 },
    direction: { kind: 'number', label: 'Direction (deg)', min: -360, max: 360, step: 1 },
    color: { kind: 'color', label: 'Color' },
  },
  burst: {
    ringCount: { kind: 'number', label: 'Ring Count', min: 1, max: 16, step: 1 },
    startRatio: { kind: 'number', label: 'Start Ratio', min: 0, max: 1, step: 0.01 },
    lineWidth: { kind: 'number', label: 'Line Width', min: 0.5, max: 12, step: 0.1 },
    color: { kind: 'color', label: 'Color' },
  },
};

const defaultParams: Record<FilmProceduralEffectType, Record<string, number | string | boolean>> = {
  concentration: {
    lineCount: 48,
    lineWidth: 1.5,
    innerRatio: 0.05,
    outerRatio: 1.1,
    angleJitter: 0.4,
    color: '#000000',
    seed: '',
  },
  speedline: {
    bandCount: 24,
    bandWidthRatio: 0.12,
    direction: 0,
    color: '#000000',
  },
  burst: {
    ringCount: 4,
    startRatio: 0.2,
    lineWidth: 2,
    color: '#000000',
  },
};

export function createProceduralEffect(
  type: FilmProceduralEffectType,
  overrides: Record<string, number | string | boolean> = {}
): FilmProceduralEffect {
  const base = defaultParams[type];
  return {
    type,
    params: {
      ...base,
      ...overrides,
    },
  };
}
