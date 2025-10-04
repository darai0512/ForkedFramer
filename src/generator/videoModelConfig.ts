import type {
  ImageToVideoModel,
  ImageToVideoRequest,
  ImageToVideoResolution,
} from '$protocolTypes/imagingTypes';

const DEFAULT_VIDEO_DURATION: ImageToVideoRequest['duration'] = '5';
const DEFAULT_VIDEO_RESOLUTION: ImageToVideoResolution = '720p';

export const videoModelOptions: Array<{ value: ImageToVideoModel; label: string; devOnly?: boolean }> = [
  { value: 'FramePack', label: 'FramePack' },
  { value: 'kling', label: 'kling-2.5' },
  { value: 'seedance/lite', label: 'Seedance Lite' },
  { value: 'seedance/pro', label: 'Seedance Pro' },
  { value: 'wan/v2.2-a14b/turbo', label: 'Wan v2.2 Turbo' },
  { value: 'failure', label: 'failure', devOnly: true },
];

export type VideoModelCapability = {
  durations: ImageToVideoRequest['duration'][];
  aspectRatios: ImageToVideoRequest['aspectRatio'][];
  resolutions: ImageToVideoResolution[];
};

const VIDEO_MODEL_CAPABILITIES: Record<ImageToVideoModel, VideoModelCapability> = {
  FramePack: {
    durations: ['1', '2', '3', '4', '5'],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['480p', '720p'],
  },
  kling: {
    durations: ['5'],
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
  },
  'seedance/lite': {
    durations: ['3', '4', '5'],
    aspectRatios: ['16:9'],
    resolutions: ['480p', '720p', '1080p'],
  },
  'seedance/pro': {
    durations: ['3', '4', '5'],
    aspectRatios: ['16:9'],
    resolutions: ['480p', '1080p'],
  },
  'wan/v2.2-a14b/turbo': {
    durations: ['5'],
    aspectRatios: ['1:1', '16:9', '9:16'],
    resolutions: ['480p', '720p'],
  },
  'wan-25-preview/image-to-video': {
    durations: ['5'],
    aspectRatios: ['1:1'],
    resolutions: ['480p', '720p', '1080p'],
  },
  'decart/lucy-14b': {
    durations: ['5'],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p'],
  },
  failure: {
    durations: ['1'],
    aspectRatios: ['1:1'],
    resolutions: ['480p'],
  },
};

export function getVideoModelCapability(model: ImageToVideoModel): VideoModelCapability | undefined {
  return VIDEO_MODEL_CAPABILITIES[model];
}

export function pickVideoDuration(model: ImageToVideoModel): ImageToVideoRequest['duration'] {
  const options = VIDEO_MODEL_CAPABILITIES[model]?.durations ?? [DEFAULT_VIDEO_DURATION];
  return options.includes(DEFAULT_VIDEO_DURATION) ? DEFAULT_VIDEO_DURATION : options[0];
}

export function pickVideoResolution(model: ImageToVideoModel): ImageToVideoResolution {
  const options = VIDEO_MODEL_CAPABILITIES[model]?.resolutions ?? [DEFAULT_VIDEO_RESOLUTION];
  return options.includes(DEFAULT_VIDEO_RESOLUTION) ? DEFAULT_VIDEO_RESOLUTION : options[0];
}

export function pickVideoAspectRatio(
  model: ImageToVideoModel,
  width: number,
  height: number,
): ImageToVideoRequest['aspectRatio'] {
  const options = VIDEO_MODEL_CAPABILITIES[model]?.aspectRatios ?? ['16:9'];
  const preferred = height > width ? '9:16' : '16:9';
  if (options.includes(preferred)) return preferred;
  return options[0];
}

export function inferVideoExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogv';
  if (normalized.includes('quicktime')) return 'mov';
  if (normalized.includes('x-msvideo')) return 'avi';
  return 'mp4';
}
