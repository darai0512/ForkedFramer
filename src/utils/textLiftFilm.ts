import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { analyticsEvent } from "./analyticsEvent";
import { onlineStatus } from './accountStore';
import { waitDialog } from './waitDialog';

export type TextLiftSelection = {
  id: number;
  enabled: boolean;
  text?: string;
  box: { x0: number; y0: number; x1: number; y1: number };
};

export type TextLiftDialogResult = {
  committed: boolean;
  selections: TextLiftSelection[];
};

export async function textLiftFilm(film: Film) {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `テキスト抽出はサインインしてないと使えません`, timeout: 3000});
    return null;
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `テキスト抽出は画像のみ使えます`, timeout: 3000});
    return null;
  }
  const imageMedia = film.content.media as ImageMedia;
  const sourceCanvas = imageMedia.drawSource;

  const dialogResult = await waitDialog<TextLiftDialogResult | null>('textlift', { title: "テキスト抽出", imageSource: sourceCanvas });
  if (!dialogResult?.committed) {
    return null;
  }

  analyticsEvent('textlift');
  return dialogResult;
}
