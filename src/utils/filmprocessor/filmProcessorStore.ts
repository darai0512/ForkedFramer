import type { Film } from "../../lib/layeredCanvas/dataModels/film";
import { ImageMedia, VideoMedia, type RemoteMediaReference } from "../../lib/layeredCanvas/dataModels/media";
import { redrawToken, bookOperators } from "../../bookeditor/workspaceStore";
import { PubSubQueue } from "../pubsub";
import { text2Image, image2Video, pollMediaStatus } from '../../supabase';
import { get } from "svelte/store";
import { toastStore } from '@skeletonlabs/skeleton';
import { saveRequest } from '../../filemanager/warehouse';
import { mainBookFileSystem } from '../../filemanager/fileManagerStore';

export const filmProcessorQueue = new PubSubQueue<Film>();
filmProcessorQueue.subscribe(async (film: Film) => {
  if (film.content.kind !== 'media') {
    return;
  }

  const media = film.content.media;
  if (!media.isLoaded) {
    const rmr = media.persistentSource as RemoteMediaReference;

    // beforeRequest の場合: APIリクエストを発行
    if (rmr.mode === 'beforeRequest') {
      try {
        if (rmr.mediaType === 'image' && media instanceof ImageMedia) {
          console.log("[filmProcessorQueue] beforeRequest (image): calling text2Image");
          const { requestId, model } = await text2Image(rmr.request);
          await saveRequest(get(mainBookFileSystem)!, 'image', rmr.request.mode, requestId, model);
          media.setRequestResult(requestId, model);
          console.log("[filmProcessorQueue] image request submitted:", requestId);
        } else if (rmr.mediaType === 'video' && media instanceof VideoMedia) {
          console.log("[filmProcessorQueue] beforeRequest (video): calling image2Video");
          const { requestId, model } = await image2Video(rmr.request);
          await saveRequest(get(mainBookFileSystem)!, 'video', rmr.request.model, requestId, model);
          media.setRequestResult(requestId, model);
          console.log("[filmProcessorQueue] video request submitted:", requestId);
        }
        redrawToken.set(true);
      } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message : `${e}`;
        toastStore.trigger({ message: `リクエストの送信に失敗しました: ${msg}`, timeout: 4000 });
        media.fail();
        redrawToken.set(true);
        return;
      }
    }

    // afterRequest の場合: ポーリング（beforeRequestから遷移した場合も含む）
    const currentRmr = media.persistentSource as RemoteMediaReference;
    if (currentRmr.mode === 'afterRequest') {
      try {
        console.log("[filmProcessorQueue] afterRequest: polling for", currentRmr.requestId);
        const { mediaResources } = await pollMediaStatus(currentRmr);
        if (mediaResources.length > 0) {
          media.setMedia(mediaResources[0]);
        }
        console.log("[filmProcessorQueue] media loaded successfully");
        get(bookOperators)?.commit(null);
      } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message : `${e}`;
        toastStore.trigger({ message: `メディアの取得に失敗しました: ${msg}`, timeout: 4000 });
        media.fail();
        redrawToken.set(true);
        return;
      }
    }
  }

  let inputMedia = film.content.media;
  for (const effect of film.effects) {
    inputMedia = await effect.apply(inputMedia);
  }
  redrawToken.set(true);
});
