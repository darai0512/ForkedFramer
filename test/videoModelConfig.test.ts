import { describe, it, expect } from 'vitest';
import type { ImageToVideoModel } from '../src/utils/edgeFunctions/types/imagingTypes';
import { pickVideoDuration, pickVideoResolution } from '../src/generator/videoModelConfig';

describe('videoModelConfig helpers', () => {
  it('uses capability ordering for duration picks', () => {
    expect(pickVideoDuration('FramePack')).toBe('5');
    expect(pickVideoDuration('minimax/hailuo-2.3-fast/standard/image-to-video')).toBe('6');
  });

  it('falls back to default duration when capability is missing', () => {
    const bogusModel = 'not-defined-model' as unknown as ImageToVideoModel;
    expect(pickVideoDuration(bogusModel)).toBe('5');
  });

  it('uses capability ordering for resolution picks', () => {
    expect(pickVideoResolution('FramePack')).toBe('720p');
    expect(pickVideoResolution('seedance/pro')).toBe('480p');
  });

  it('falls back to default resolution when capability is missing', () => {
    const bogusModel = 'not-defined-model' as unknown as ImageToVideoModel;
    expect(pickVideoResolution(bogusModel)).toBe('720p');
  });
});
