import { type Film, fitFilms, FilmStackTransformer } from "../../lib/layeredCanvas/dataModels/film";
import { ImageMedia, VideoMedia, type RemoteMediaReference, type RemoteMediaReferenceBeforeRequest, type FitParams } from "../../lib/layeredCanvas/dataModels/media";
import { redrawToken, bookOperators } from "../../bookeditor/workspaceStore";
import { PubSubQueue } from "../pubsub";
import { text2Image, image2Video, outPaint, inPaint, eraser, upscale, textEraser, removeBg, pollMediaStatus } from '../../supabase';
import { get } from "svelte/store";
import { toastStore } from '@skeletonlabs/skeleton';
import { saveRequest } from '../../filemanager/warehouse';
import { mainBookFileSystem } from '../../filemanager/fileManagerStore';
import type { Rect } from "../../lib/layeredCanvas/tools/geometry/geometry";

// FilmProcessorTask: Filmと生成完了後のコールバックを含む
export type FilmProcessorTask = {
  film: Film;
  onLoaded?: () => void;  // メディアがロードされた後に呼ばれるコールバック（フィッティング処理など）
};

export const filmProcessorQueue = new PubSubQueue<FilmProcessorTask>();
filmProcessorQueue.subscribe(async (task: FilmProcessorTask) => {
  const { film, onLoaded } = task;

  if (film.content.kind !== 'media') {
    return;
  }

  const media = film.content.media;
  if (!media.isLoaded) {
    const rmr = media.persistentSource as RemoteMediaReference;

    // fitParams を保存（beforeRequest状態のときのみ存在、状態遷移後は消えるため）
    let fitParams: FitParams | undefined;
    if (rmr.mode === 'beforeRequest') {
      fitParams = rmr.fitParams;
    }

    // beforeRequest の場合: APIリクエストを発行
    if (rmr.mode === 'beforeRequest') {
      try {
        const action = rmr.action;
        const { requestId, model } = await dispatchApiRequest(rmr);
        await saveRequest(get(mainBookFileSystem)!, rmr.mediaType, action, requestId, model);
        if (media instanceof ImageMedia) {
          media.setRequestResult(action, requestId, model);
        } else if (media instanceof VideoMedia) {
          media.setRequestResult(action, requestId, model);
        }
        console.log(`[filmProcessorQueue] ${action} request submitted:`, requestId);
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
        console.log("[filmProcessorQueue] afterRequest: polling for", currentRmr.requestId, "action:", currentRmr.action);
        const mr = {
          mediaType: currentRmr.mediaType,
          action: currentRmr.action,
          requestId: currentRmr.requestId,
          model: currentRmr.model
        }
        const { mediaResources } = await pollMediaStatus(mr);
        if (mediaResources.length > 0) {
          media.setMedia(mediaResources[0]);
        }
        console.log("[filmProcessorQueue] media loaded successfully");

        // メディアがロードされた後にフィッティング処理
        if (fitParams) {
          console.log("[filmProcessorQueue] applying fitParams:", fitParams);
          const { frameSize, paperSize } = fitParams;
          // フレームサイズからconstraintRectを作成（原点中心）
          const constraintRect: Rect = [0, 0, frameSize[0], frameSize[1]];
          // filmsを縮小してからフィッティング
          const transformer = new FilmStackTransformer(paperSize, [film]);
          transformer.scale(0.01);
          fitFilms(paperSize, constraintRect, [film]);
          console.log("[filmProcessorQueue] fitFilms applied");
        }

        // メディアがロードされた後にコールバックを呼ぶ（フィッティング処理など）
        if (onLoaded) {
          console.log("[filmProcessorQueue] calling onLoaded callback");
          onLoaded();
        }

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

// アクションに応じて適切なAPIを呼び分ける
async function dispatchApiRequest(
  rmr: RemoteMediaReferenceBeforeRequest
): Promise<{ requestId: string; model: string }> {
  switch (rmr.action) {
    case 'texttoimage':
      console.log("[filmProcessorQueue] beforeRequest: calling text2Image");
      return await text2Image(rmr.request);
    case 'imagetovideo':
      console.log("[filmProcessorQueue] beforeRequest: calling image2Video");
      return await image2Video(rmr.request);
    case 'outpaint':
      console.log("[filmProcessorQueue] beforeRequest: calling outPaint");
      return await outPaint(rmr.request);
    case 'inpaint':
      console.log("[filmProcessorQueue] beforeRequest: calling inPaint");
      return await inPaint(rmr.request);
    case 'eraser':
      console.log("[filmProcessorQueue] beforeRequest: calling eraser");
      return await eraser(rmr.request);
    case 'upscale':
      console.log("[filmProcessorQueue] beforeRequest: calling upscale");
      return await upscale(rmr.request);
    case 'texteraser':
      console.log("[filmProcessorQueue] beforeRequest: calling textEraser");
      return await textEraser(rmr.request);
    case 'removebg':
      console.log("[filmProcessorQueue] beforeRequest: calling removeBg");
      return await removeBg(rmr.request);
    default:
      throw new Error(`Unknown action: ${(rmr as any).action}`);
  }
}
