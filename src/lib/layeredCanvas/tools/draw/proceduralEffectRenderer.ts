import rgba from 'color-rgba';
import seedrandom from 'seedrandom';
import { color2string, tailCoordToWorldCoord } from '../geometry/bubbleGeometry';
import type { Vector } from '../geometry/geometry';
import { magnitude2D, projectionScalingFactor2D, rotate2D, clamp, perpendicular2D } from '../geometry/geometry';
import type { FilmProceduralEffect, FilmProceduralEffectType } from '../../dataModels/proceduralEffects';

export interface ProceduralEffectRenderer {
  draw(effect: FilmProceduralEffect, ctx: CanvasRenderingContext2D, size: number): void;
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

function readVectorParam(effect: FilmProceduralEffect, key: string, fallback: Vector): Vector {
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
      ctx.translate(size / 2, size / 2);

      const rng = seedrandom(String(readNumericParam(effect, 'randomSeed', 0)));

      const focalPoint = readVectorParam(effect, 'focalPoint', [0, 0]);
      const focalRange = readVectorParam(effect, 'focalRange', [0, 40]);
      const lineCount = readNumericParam(effect, 'lineCount', 200);
      const lineWidth = readNumericParam(effect, 'lineWidth', 0.05);
      const angleJitter = readNumericParam(effect, 'angleJitter', 0.05);
      const startJitter = readNumericParam(effect, 'startJitter', 0.5);
      const colorStr = String(effect.params.color || '#000000');

      ctx.lineWidth = 1;

      const icd = focalPoint;
      const rangeVector = focalRange;
      const range = Math.hypot(rangeVector[0], rangeVector[1]);
      const [ox, oy, od] = [0, 0, Math.hypot(w/2, h/2)];
      const [ix, iy, id] = [icd[0], icd[1], range];

      const gradient = ctx.createRadialGradient(ix, iy, id, ox, oy, od);
      const color0 = rgba(colorStr);
      const color1 = rgba(colorStr);
      color0[3] = 0;
      gradient.addColorStop(0.0, color2string(color0));
      gradient.addColorStop(0.2, color2string(color1));
      gradient.addColorStop(1.0, color2string(color1));
      ctx.fillStyle = gradient;

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
      ctx.translate(size / 2, size / 2);

      const rng = seedrandom(String(readNumericParam(effect, 'randomSeed', 0)));

      const tailTip = readVectorParam(effect, 'tailTip', [40, 0]);
      const tailMid = tailCoordToWorldCoord([0, 0], tailTip, readVectorParam(effect, 'tailMid', [0.5, 0]));
      const lineCount = readNumericParam(effect, 'lineCount', 70);
      const lineWidth = readNumericParam(effect, 'lineWidth', 0.2);
      const laneJitter = readNumericParam(effect, 'laneJitter', 0.05);
      const startJitter = readNumericParam(effect, 'startJitter', 0.3);
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

      for (let i = 0; i < lineCount; i++) {
        const y = (i + 0.5) / lineCount * length - length/2 + rng() * length * laneJitter;
        const lx = -length * 0.5 + (rng() - 0.5) * w * startJitter;
        const lw = h * lineWidth * 0.01 * (rng() + 0.5);

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

const dotsRenderer: ProceduralEffectRenderer = {
  draw(effect, ctx, size) {
    const w = size;
    const h = size;

    ctx.save();
    try {
      const horizontalSpacing = readNumericParam(effect, 'horizontalSpacing', 5);
      const verticalSpacing = readNumericParam(effect, 'verticalSpacing', 5);
      const dotRadius = readNumericParam(effect, 'dotRadius', 1);
      const evenRowOffset = readNumericParam(effect, 'evenRowOffset', 0);
      const positionJitter = readNumericParam(effect, 'positionJitter', 0);
      const sizeJitter = readNumericParam(effect, 'sizeJitter', 0);
      const randomSeed = readNumericParam(effect, 'randomSeed', 0);
      const colorStr = String(effect.params.color || '#000000');

      const rng = seedrandom(String(randomSeed));

      const hSpacing = (horizontalSpacing / 100) * size;
      const vSpacing = (verticalSpacing / 100) * size;
      const baseRadius = (dotRadius / 100) * size;

      ctx.fillStyle = colorStr;

      const cols = Math.ceil(w / hSpacing) + 2;
      const rows = Math.ceil(h / vSpacing) + 2;

      for (let row = -1; row < rows; row++) {
        const baseY = row * vSpacing;
        const xOffset = (row % 2 === 0) ? 0 : evenRowOffset * hSpacing;

        for (let col = -1; col < cols; col++) {
          const baseX = col * hSpacing + xOffset;

          // Position jitter
          const jitterRange = hSpacing * positionJitter * 0.5;
          const x = baseX + (rng() - 0.5) * jitterRange * 2;
          const y = baseY + (rng() - 0.5) * jitterRange * 2;

          // Size jitter
          const sizeMultiplier = rng() * 2; // 0 to 2
          const radius = baseRadius * (1 - sizeJitter + sizeJitter * sizeMultiplier);

          if (x - radius <= w && y - radius <= h && x + radius >= 0 && y + radius >= 0) {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
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
  'dots': dotsRenderer,
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