import type {
  ImagingBackground,
  ImageToVideoRequest,
  ImageToVideoResolution,
} from '$protocolTypes/imagingTypes';

export const botReplies = [
  'うんうん、なるほど！',
  'ちょっと考えてみますね。',
  'それは面白いアイデアですね。',
  '詳しく聞かせてもらえますか？',
  'いいですね、その調子です！',
];

export const DEFAULT_PROMPT_POSTFIX = '';
export const DEFAULT_IMAGE_SIZE: { width: number; height: number } = { width: 1024, height: 1024 };
export const DEFAULT_BACKGROUND: ImagingBackground = 'opaque';
export const DEFAULT_IMAGE_COUNT = 1;
export const DEFAULT_VIDEO_COUNT = 1;
export const DEFAULT_VIDEO_DURATION: ImageToVideoRequest['duration'] = '5';
export const DEFAULT_VIDEO_RESOLUTION: ImageToVideoResolution = '720p';
export const VIDEO_NOTIFICATION_THRESHOLD_MS = 10_000;
export const DEFAULT_VIDEO_SOURCE_MAX = 1024;

export function composeGenerationPrompt(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return DEFAULT_PROMPT_POSTFIX ? `${DEFAULT_PROMPT_POSTFIX}\n${trimmed}` : trimmed;
}
