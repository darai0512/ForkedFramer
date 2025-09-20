import type { Film } from "../../lib/layeredCanvas/dataModels/film";
import { redrawToken, bookOperators } from "../../bookeditor/workspaceStore";
import { PubSubQueue } from "../pubsub";
import { pollMediaStatus } from '../../supabase';
import type { RemoteMediaReference } from "src/lib/filesystem/fileSystem";
import { get } from "svelte/store";
import { toastStore } from '@skeletonlabs/skeleton';

export const filmProcessorQueue = new PubSubQueue<Film>();
filmProcessorQueue.subscribe(async (film: Film) => {
  if (film.content.kind !== 'media') {
    return;
  }

  if (!film.content.media.isLoaded) {
    // Unmaterializedメディアの場合、ロード
    const rmr = film.content.media.persistentSource as RemoteMediaReference;
    try {
      const { mediaResources }  = await pollMediaStatus(rmr);
      if (mediaResources.length > 0) {
        film.content.media.setMedia(mediaResources[0]);
      }
      console.log("================================================================ filmProcessorQueue.subscribe", film.content.media);
      get(bookOperators)?.commit(null);
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : `${e}`;
      toastStore.trigger({ message: `メディアの取得に失敗しました: ${msg}`, timeout: 4000 });
      film.content.media.fail();
      redrawToken.set(true);
      return; // 以降のエフェクト処理は行わない
    }
  }

  let inputMedia = film.content.media;
  for (const effect of film.effects) {
    inputMedia = await effect.apply(inputMedia);
  }
  redrawToken.set(true);
});
