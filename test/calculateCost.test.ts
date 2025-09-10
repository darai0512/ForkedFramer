import { describe, it, expect } from 'vitest';
import { calculateImagingCost, calculateRequestCost } from '../src/utils/edgeFunctions/calculateCost';
import type { ImagingMode, TextToImageRequest } from '../src/utils/edgeFunctions/types/imagingTypes';

// 旧仕様に基づく期待値（テスト内で再現）
const legacyPerMp: Record<ImagingMode, number> = {
  'schnell': 1,
  'pro': 8,
  'chibi': 7,
  'comibg': 7,
  'manga': 7,
  'gpt-image-1/low': 2,
  'gpt-image-1/medium': 7,
  'gpt-image-1/high': 30,
  'qwen-image': 4,
  'kontext/inscene': 7,
  // 固定値モードはダミー（使用しない）
  'kontext/pro': 0,
  'kontext/max': 0,
  'nano-banana': 0,
  'seedream/v4': 0,
};
const legacyFixed: Partial<Record<ImagingMode, number>> = {
  'kontext/pro': 6,
  'kontext/max': 13,
  'nano-banana': 6,
  'seedream/v4': 4,
};

function ceilMpCost(size: { width: number; height: number }, perMp: number) {
  const mp = (size.width * size.height) / (1024 * 1024);
  return Math.ceil(mp * perMp);
}

function legacyExpected(mode: ImagingMode, size: { width: number; height: number }): number {
  if (mode in legacyFixed) return legacyFixed[mode as keyof typeof legacyFixed] as number;
  return ceilMpCost(size, legacyPerMp[mode]);
}

describe('calculateImagingCost unified equals legacy behavior', () => {
  const sizes = [
    { width: 512, height: 512 },   // 0.25MP → ceil(0.25*x)
    { width: 1024, height: 1024 }, // 1.00MP → x
    { width: 1536, height: 1024 }, // 1.50MP → ceil(1.5*x)
  ];

  const modes: ImagingMode[] = [
    'schnell','pro','chibi','comibg','manga',
    'gpt-image-1/low','gpt-image-1/medium','gpt-image-1/high','qwen-image',
    'kontext/pro','kontext/max','kontext/inscene','nano-banana','seedream/v4',
  ];

  for (const mode of modes) {
    for (const size of sizes) {
      it(`mode=${mode}, size=${size.width}x${size.height}`, () => {
        const unified = calculateImagingCost(mode, size);
        const expected = legacyExpected(mode, size);
        expect(unified).toBe(expected);
      });
    }
  }
});

describe('calculateRequestCost ignores reference images', () => {
  const reqBase: Omit<TextToImageRequest, 'imageDataUrls'> = {
    provider: 'flux',
    prompt: 'test',
    imageSize: { width: 1024, height: 1024 },
    numImages: 1,
    mode: 'pro',
    background: 'opaque',
  };

  it('same cost regardless of imageDataUrls length', () => {
    const r0 = calculateRequestCost({ ...reqBase });
    const r1 = calculateRequestCost({ ...reqBase, imageDataUrls: ['x'] });
    const r3 = calculateRequestCost({ ...reqBase, imageDataUrls: ['a','b','c'] });
    expect(r0).toBe(r1);
    expect(r0).toBe(r3);
  });
});
