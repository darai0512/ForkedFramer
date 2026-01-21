import { type Film, fitFilms, FilmStackTransformer } from "../../lib/layeredCanvas/dataModels/film";
import { ImageMedia, VideoMedia, type RemoteMediaReference } from "../../lib/layeredCanvas/dataModels/media";
import type { Vector } from "../../lib/layeredCanvas/tools/geometry/geometry";
import type { ImagingAction } from "$protocolTypes/imagingTypes";
import { redrawToken, bookOperators } from "../../bookeditor/workspaceStore";
import { PubSubQueue } from "../pubsub";
import { text2Image, image2Video, outPaint, inPaint, eraser, upscale, textEraser, removeBg, pollMediaStatus } from '../../supabase';
import { get } from "svelte/store";
import { toastStore } from '@skeletonlabs/skeleton';
import { saveRequest } from '../../filemanager/warehouse';
import { mainBookFileSystem } from '../../filemanager/fileManagerStore';
import type { Rect } from "../../lib/layeredCanvas/tools/geometry/geometry";
import { isHandledHttpError } from "../edgeFunctions/edgeFunctions";

// FilmProcessorTask: Filmと生成完了後のコールバックを含む
export type FilmProcessorTask = {
  film: Film;
  onLoaded?: () => void;  // メディアがロードされた後に呼ばれるコールバック（フィッティング処理など）
};

export const filmProcessorQueue = new PubSubQueue<FilmProcessorTask>({ maxConcurrency: 4 });
filmProcessorQueue.subscribe(async (task: FilmProcessorTask) => {
  const { film, onLoaded } = task;

  if (film.content.kind !== 'media') {
    return;
  }

  const media = film.content.media;
  if (!media.isLoaded) {
    const rmr = media.persistentSource as RemoteMediaReference;

    // fitParams を保存（beforeRequest状態のときのみ存在、状態遷移後は消えるため）
    let fitParams: { frameSize: Vector; paperSize: Vector } | undefined;
    if (rmr.mode === 'beforeRequest') {
      fitParams = rmr.fitParams as { frameSize: Vector; paperSize: Vector } | undefined;
    }

    // beforeRequest の場合: APIリクエストを発行
    if (rmr.mode === 'beforeRequest') {
      try {
        const action = rmr.action as ImagingAction;
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
        if (!isHandledHttpError(e)) {
          const msg = typeof e?.message === 'string' ? e.message : `${e}`;
          toastStore.trigger({ message: `リクエストの送信に失敗しました: ${msg}`, timeout: 4000 });
        }
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
          action: currentRmr.action as ImagingAction,
          requestId: currentRmr.requestId as string,
          model: currentRmr.model as string
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
        if (!isHandledHttpError(e)) {
          const msg = typeof e?.message === 'string' ? e.message : `${e}`;
          toastStore.trigger({ message: `メディアの取得に失敗しました: ${msg}`, timeout: 4000 });
        }
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
  rmr: RemoteMediaReference
): Promise<{ requestId: string; model: string }> {
  const action = rmr.action as string;
  const request = rmr.request;
  switch (action) {
    case 'texttoimage':
      console.log("[filmProcessorQueue] beforeRequest: calling text2Image");
      return await text2Image(request as any);
    case 'imagetovideo':
      console.log("[filmProcessorQueue] beforeRequest: calling image2Video");
      return await image2Video(request as any);
    case 'outpaint':
      console.log("[filmProcessorQueue] beforeRequest: calling outPaint");
      return await outPaint(request as any);
    case 'inpaint':
      console.log("[filmProcessorQueue] beforeRequest: calling inPaint");
      return await inPaint(request as any);
    case 'eraser':
      console.log("[filmProcessorQueue] beforeRequest: calling eraser");
      return await eraser(request as any);
    case 'upscale':
      console.log("[filmProcessorQueue] beforeRequest: calling upscale");
      return await upscale(request as any);
    case 'texteraser':
      console.log("[filmProcessorQueue] beforeRequest: calling textEraser");
      return await textEraser(request as any);
    case 'removebg':
      console.log("[filmProcessorQueue] beforeRequest: calling removeBg");
      return await removeBg(request as any);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
