import { decode, encode } from 'cbor-x'
import { ulid } from 'ulid';
import { unpackFrameMedias, unpackBubbleMedias, unpackNotebookMedias, packFrameMedias, packBubbleMedias, packNotebookMedias } from "./imagePacking";
import type { SaveMediaFunc, MediaResource, MediaType, LoadMediaFunc } from "./imagePacking";
import type { Book, Page, WrapMode, ReadingDirection, SerializedPage, SerializedNotebook, SerializedNewPageProperty, NotebookLocal, EnvelopeBookAttributes } from "./book";
import { emptyNotebook, trivialNewPageProperty } from "./book";
import { Bubble } from "../layeredCanvas/dataModels/bubble";
import { FrameElement } from "../layeredCanvas/dataModels/frameTree";
import { createCanvasFromImage, getFirstFrameOfVideo, canvasToBlob } from "../layeredCanvas/tools/imageUtil";
import { createMissingMediaReference, type Media, type RemoteMediaReference } from "../layeredCanvas/dataModels/media";

// 互換性維持のため、imagesは残してmediasを追加する

type EnvelopedBookBase = {
  pages: SerializedPage[];
  direction: ReadingDirection;
  wrapMode: WrapMode;
  notebook: SerializedNotebook | null;
  newPageProperty: SerializedNewPageProperty | null;
  attributes?: EnvelopeBookAttributes | null;
};

export type EnvelopedBookWithImages = EnvelopedBookBase & {
  images: { [fileId: string]: Uint8Array };
  medias?: undefined;
};

export type EnvelopedBookWithMedias = EnvelopedBookBase & {
  medias: { [fileId: string]: { type: MediaType; data: Uint8Array; format?: string } };
  images?: undefined;
};

export type EnvelopedBook = EnvelopedBookWithImages | EnvelopedBookWithMedias;

export type CanvasBag = { [fileId: string]: { type: MediaType, data: HTMLCanvasElement | HTMLVideoElement } };

function getEnvelopeFileId(mediaResource: MediaResource): string | null {
  const r = mediaResource as any;
  return r?.envelopeFileId ?? r?.missingId ?? null;
}

function isMaterializedMedia(mediaResource: MediaResource): mediaResource is HTMLCanvasElement | HTMLVideoElement {
  return mediaResource instanceof HTMLCanvasElement || mediaResource instanceof HTMLVideoElement;
}

export async function readEnvelope(blob: Blob, progress: (n: number) => void): Promise<Book> {
  const uint8Array = new Uint8Array(await blob.arrayBuffer());
  const envelopedBook: EnvelopedBook = decode(uint8Array);

  const bag: CanvasBag = {};
  if ("images" in envelopedBook && envelopedBook.images) {
    progress(0);
    for (const imageId in envelopedBook.images) {
      const blob = new Blob([new Uint8Array(envelopedBook.images[imageId])], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = url;
      await image.decode();
      URL.revokeObjectURL(url);
      const canvas = createCanvasFromImage(image);
      (canvas as any)["envelopeFileId"] = imageId;
      bag[imageId] = { type: 'image', data: canvas };
      progress(Object.keys(bag).length / Object.keys(envelopedBook.images).length);
    }
  }
  if ("medias" in envelopedBook && envelopedBook.medias) {
    progress(0);
    for (const mediaId in envelopedBook.medias) {
      const media = envelopedBook.medias[mediaId];
      const blob = new Blob(
        [new Uint8Array(media.data)],
        {
          type: media.type === 'image' ? `image/${media.format ?? 'png'}` : 'video/mp4'
        });
      const url = URL.createObjectURL(blob);
      if (media.type === 'image') {
        const image = new Image();
        image.src = url;
        await image.decode();
        URL.revokeObjectURL(url);
        const canvas = createCanvasFromImage(image);
        (canvas as any)["envelopeFileId"] = mediaId;
        bag[mediaId] = { type: 'image', data: canvas };
      } else {
        const video = document.createElement('video');
        video.src = url;
        await getFirstFrameOfVideo(video);
        (video as any)["envelopeFileId"] = mediaId;
        bag[mediaId] = { type: 'video', data: video };
      }
      progress(Object.keys(bag).length / Object.keys(envelopedBook.medias).length);
    }
  }

  const loadMedia: LoadMediaFunc = async (imageId: string, mediaType: MediaType) => {
    const entry = bag[imageId];
    if (!entry) {
      return createMissingMediaReference(mediaType, { reason: 'envelope-missing', missingId: imageId });
    }
    return entry.data;
  };

  const notebook = envelopedBook.notebook
    ? await unpackNotebookMedias(envelopedBook.notebook, loadMedia)
    : emptyNotebook(null);

  // attributes は publishUrl を含まないため、Book側で publishUrl のみ既定値を付与
  const envelopeAttributes: EnvelopeBookAttributes | null = envelopedBook.attributes ?? null;
  console.log("readEnvelope", envelopedBook.attributes, envelopeAttributes);

  const book: Book = {
    revision: { id: 'not visited', revision: 1, prefix: 'envelope-' },
    pages: [],
    history: { entries: [], cursor: 0 },
    direction: envelopedBook.direction,
    wrapMode: envelopedBook.wrapMode,
    chatLogs: [],
    notebook,
    attributes: { publishUrl: null, ...(envelopeAttributes ?? {}) },
    newPageProperty: envelopedBook.newPageProperty ?? {...trivialNewPageProperty},
  };

  const getCanvas: LoadMediaFunc = async (imageId: string, mediaType: MediaType) => {
    const entry = bag[imageId];
    if (!entry) {
      return createMissingMediaReference(mediaType, { reason: 'envelope-missing', missingId: imageId });
    }
    return entry.data;
  };

  for (const envelopedPage of envelopedBook.pages) {
    const frameTree = await unpackFrameMedias(envelopedPage.paperSize, envelopedPage.frameTree, getCanvas);
    const bubbles = await unpackBubbleMedias(envelopedPage.paperSize, envelopedPage.bubbles, getCanvas);
  
    const page: Page = {
      id: envelopedPage.id ?? ulid(),
      frameTree: frameTree,
      bubbles: bubbles,
      paperSize: envelopedPage.paperSize,
      paperColor: envelopedPage.paperColor,
      frameColor: envelopedPage.frameColor,
      frameWidth: envelopedPage.frameWidth,
      fontSizeCoefficient: envelopedPage.fontSizeCoefficient ?? 1.0,
      source: null,
    }
    book.pages.push(page);
  }

  return book;
}

// --- Progressive loading ---

export type ProgressiveEnvelope = {
  book: Book;
  totalMediaCount: number;
  decodePageMedias: (pageIndex: number) => Promise<number>;
  decodeAllRemainingMedias: (
    onProgress: (decoded: number, total: number) => void
  ) => Promise<void>;
  isPageDecoded: (pageIndex: number) => boolean;
};

type PendingMedia = { mediaId: string; mediaType: MediaType; media: Media };

type RawMediaEntry = { type: MediaType; data: Uint8Array; format?: string };

function collectMediasFromFrameTree(element: FrameElement, result: PendingMedia[]): void {
  for (const film of element.filmStack.films) {
    if (film.content.kind === 'media') {
      const media = film.content.media;
      if (!media.isLoaded && !media.isFailed) {
        const persistent = media.persistentSource;
        if (!(persistent instanceof HTMLCanvasElement) && !(persistent instanceof HTMLVideoElement)) {
          const ref = persistent as RemoteMediaReference;
          const mediaId = ref.envelopeMediaId as string | undefined;
          if (mediaId) {
            result.push({ mediaId, mediaType: media.type, media });
          }
        }
      }
    }
  }
  for (const child of element.children) {
    collectMediasFromFrameTree(child, result);
  }
}

function collectMediasFromBubbles(bubbles: Bubble[], result: PendingMedia[]): void {
  for (const bubble of bubbles) {
    for (const film of bubble.filmStack.films) {
      if (film.content.kind === 'media') {
        const media = film.content.media;
        if (!media.isLoaded && !media.isFailed) {
          const persistent = media.persistentSource;
          if (!(persistent instanceof HTMLCanvasElement) && !(persistent instanceof HTMLVideoElement)) {
            const ref = persistent as RemoteMediaReference;
            const mediaId = ref.envelopeMediaId as string | undefined;
            if (mediaId) {
              result.push({ mediaId, mediaType: media.type, media });
            }
          }
        }
      }
    }
  }
}

function collectMediasFromPage(page: Page): PendingMedia[] {
  const result: PendingMedia[] = [];
  collectMediasFromFrameTree(page.frameTree, result);
  collectMediasFromBubbles(page.bubbles, result);
  return result;
}

export async function readEnvelopeProgressive(blob: Blob): Promise<ProgressiveEnvelope> {
  const uint8Array = new Uint8Array(await blob.arrayBuffer());
  const envelopedBook: EnvelopedBook = decode(uint8Array);

  // 生メディアデータを保持(デコードしない)
  const rawMediaMap = new Map<string, RawMediaEntry>();
  if ("images" in envelopedBook && envelopedBook.images) {
    for (const imageId in envelopedBook.images) {
      rawMediaMap.set(imageId, { type: 'image', data: envelopedBook.images[imageId], format: 'png' });
    }
  }
  if ("medias" in envelopedBook && envelopedBook.medias) {
    for (const mediaId in envelopedBook.medias) {
      const m = envelopedBook.medias[mediaId];
      rawMediaMap.set(mediaId, { type: m.type, data: m.data, format: m.format });
    }
  }

  // プレースホルダーを返すLoadMediaFunc
  const placeholderLoadMedia: LoadMediaFunc = async (imageId: string, mediaType: MediaType) => {
    if (!rawMediaMap.has(imageId)) {
      return createMissingMediaReference(mediaType, { reason: 'envelope-missing', missingId: imageId });
    }
    return { mediaType, mode: 'beforeRequest', envelopeMediaId: imageId } as RemoteMediaReference;
  };

  // notebook はビューアでは使わないので未デコードのまま
  const notebook = envelopedBook.notebook
    ? await unpackNotebookMedias(envelopedBook.notebook, placeholderLoadMedia)
    : emptyNotebook(null);

  const envelopeAttributes: EnvelopeBookAttributes | null = envelopedBook.attributes ?? null;

  const book: Book = {
    revision: { id: 'not visited', revision: 1, prefix: 'envelope-' },
    pages: [],
    history: { entries: [], cursor: 0 },
    direction: envelopedBook.direction,
    wrapMode: envelopedBook.wrapMode,
    chatLogs: [],
    notebook,
    attributes: { publishUrl: null, ...(envelopeAttributes ?? {}) },
    newPageProperty: envelopedBook.newPageProperty ?? {...trivialNewPageProperty},
  };

  // 各ページをプレースホルダーMediaで構築
  const pageMediaTracking = new Map<number, PendingMedia[]>();
  for (let i = 0; i < envelopedBook.pages.length; i++) {
    const envelopedPage = envelopedBook.pages[i];
    const frameTree = await unpackFrameMedias(envelopedPage.paperSize, envelopedPage.frameTree, placeholderLoadMedia);
    const bubbles = await unpackBubbleMedias(envelopedPage.paperSize, envelopedPage.bubbles, placeholderLoadMedia);

    const page: Page = {
      id: envelopedPage.id ?? ulid(),
      frameTree,
      bubbles,
      paperSize: envelopedPage.paperSize,
      paperColor: envelopedPage.paperColor,
      frameColor: envelopedPage.frameColor,
      frameWidth: envelopedPage.frameWidth,
      fontSizeCoefficient: envelopedPage.fontSizeCoefficient ?? 1.0,
      source: null,
    };
    book.pages.push(page);

    // ページ内のMediaオブジェクトとメディアIDの対応を収集
    pageMediaTracking.set(i, collectMediasFromPage(page));
  }

  // デコード済みキャッシュ(共有メディア対応)
  const decodedMediaCache = new Map<string, HTMLCanvasElement | HTMLVideoElement>();
  const decodedPages = new Set<number>();

  async function decodePageMedias(pageIndex: number): Promise<number> {
    if (decodedPages.has(pageIndex)) return 0;

    const pending = pageMediaTracking.get(pageIndex);
    if (!pending || pending.length === 0) {
      decodedPages.add(pageIndex);
      return 0;
    }

    let decoded = 0;
    for (const entry of pending) {
      let materialized = decodedMediaCache.get(entry.mediaId);

      if (!materialized) {
        const rawEntry = rawMediaMap.get(entry.mediaId);
        if (!rawEntry) continue;

        if (rawEntry.type === 'image') {
          const b = new Blob([new Uint8Array(rawEntry.data)], { type: `image/${rawEntry.format ?? 'png'}` });
          const url = URL.createObjectURL(b);
          const image = new Image();
          image.src = url;
          await image.decode();
          URL.revokeObjectURL(url);
          materialized = createCanvasFromImage(image);
          (materialized as any)["envelopeFileId"] = entry.mediaId;
        } else {
          const b = new Blob([new Uint8Array(rawEntry.data)], { type: 'video/mp4' });
          const url = URL.createObjectURL(b);
          const video = document.createElement('video');
          video.src = url;
          await getFirstFrameOfVideo(video);
          (video as any)["envelopeFileId"] = entry.mediaId;
          materialized = video;
        }

        decodedMediaCache.set(entry.mediaId, materialized);
      }

      entry.media.setMedia(materialized as any);
      decoded++;
    }

    decodedPages.add(pageIndex);
    return decoded;
  }

  async function decodeAllRemainingMedias(
    onProgress: (decoded: number, total: number) => void
  ): Promise<void> {
    const total = book.pages.length;
    for (let i = 0; i < total; i++) {
      if (!decodedPages.has(i)) {
        await decodePageMedias(i);
      }
      onProgress(decodedPages.size, total);
      // UIスレッドに譲る
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return {
    book,
    totalMediaCount: rawMediaMap.size,
    decodePageMedias,
    decodeAllRemainingMedias,
    isPageDecoded: (pageIndex: number) => decodedPages.has(pageIndex),
  };
}

export async function writeEnvelope(book: Book, progress: (n: number) => void): Promise<Blob> {
  const envelopedBook: EnvelopedBook = {
    pages: [],
    direction: book.direction,
    wrapMode: book.wrapMode,
    notebook: null,
    medias: {},
    newPageProperty: book.newPageProperty,
    attributes: {
      showVideoPlayButton: book.attributes?.showVideoPlayButton,
      showVideoDottedBorder: book.attributes?.showVideoDottedBorder,
    },
  };

  envelopedBook.notebook = await putNotebookMedias(book.notebook, envelopedBook.medias!);

  for (const page of book.pages) {
    const markUp = await putFrameMedias(page.frameTree, envelopedBook.medias!, 'v');
    const bubbles = await putBubbleMedias(page.bubbles, envelopedBook.medias!);
    
    const serializedPage: SerializedPage = {
      id: page.id,
      frameTree: markUp,
      bubbles: bubbles,
      paperSize: page.paperSize,
      paperColor: page.paperColor,
      frameColor: page.frameColor,
      frameWidth: page.frameWidth,
      fontSizeCoefficient: page.fontSizeCoefficient,
    }
    envelopedBook.pages.push(serializedPage);    
    progress(envelopedBook.pages.length / book.pages.length);
  }

  const encoded = encode(envelopedBook);
  return new Blob([new Uint8Array(encoded)], { type: 'application/cbor' });
}


async function putFrameMedias(frameTree: FrameElement, medias: { [fileId: string]: { type: MediaType, data: Uint8Array, format?: string } }, parentDirection: 'h' | 'v'): Promise<any> {
  const f: SaveMediaFunc = async (mediaResource, mediaType) => {
    const fileId = getEnvelopeFileId(mediaResource) ?? ulid();
    if (!isMaterializedMedia(mediaResource)) {
      return fileId;
    }
    const array = await mediaResourceToUint8Array(mediaResource, mediaType);
    medias[fileId] = { type: mediaType, data: array, format: 'webp' };
    return fileId;
  };

  const markUp = await packFrameMedias(frameTree, parentDirection, f);

  const children = [];
  for (const child of frameTree.children) {
    children.push(await putFrameMedias(child, medias, frameTree.direction!));
  }
  if (0 < children.length) {
    if (frameTree.direction === 'h') { 
      markUp.row = children;
    } else {
      markUp.column = children;
    }
  } 
  return markUp;
}

async function putBubbleMedias(bubbles: Bubble[], images: { [fileId: string]: { type: MediaType, data: Uint8Array } }): Promise<any[]> {
  const f: SaveMediaFunc = async (mediaResource, mediaType) => {
    const fileId = getEnvelopeFileId(mediaResource) ?? ulid();
    if (!isMaterializedMedia(mediaResource)) {
      return fileId;
    }
    const array = await mediaResourceToUint8Array(mediaResource, mediaType);
    images[fileId] = { type: mediaType, data: array };
    return fileId;
  };
  return await packBubbleMedias(bubbles, f);
}

async function putNotebookMedias(notebook: NotebookLocal, images: { [fileId: string]: { type: MediaType, data: Uint8Array } }): Promise<SerializedNotebook> {
  const f: SaveMediaFunc = async (mediaResource, mediaType) => {
    const fileId = getEnvelopeFileId(mediaResource) ?? ulid();
    if (!isMaterializedMedia(mediaResource)) {
      return fileId;
    }
    const array = await mediaResourceToUint8Array(mediaResource, mediaType);
    images[fileId] = { type: mediaType, data: array };
    return fileId;
  };
  return await packNotebookMedias(notebook, f);
}

async function mediaResourceToUint8Array(mediaResource: MediaResource, mediaType: MediaType): Promise<Uint8Array> {
  if (mediaType === 'image') {
    const canvas = mediaResource as HTMLCanvasElement;
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error("Canvas toBlob failed");
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } else {
    const blob = await fetch((mediaResource as HTMLVideoElement).src).then(res => res.blob());
    return new Uint8Array(await blob.arrayBuffer());
  }
}

export type OldEnvelopedBook = {
  pages: SerializedPage[],
  direction: ReadingDirection,
  wrapMode: WrapMode,
  images: { [fileId: string]: string }
  notebook: NotebookLocal | null, // portraitなどは多分腐っている
};

export async function readOldEnvelope(json: string): Promise<Book> {
  // この中で作られたimage等はセーブ後捨てられるので、キャッシュなどは一切無視する
  const envelopedBook: OldEnvelopedBook = JSON.parse(json);

  const bag: CanvasBag = {};
  for (const imageId in envelopedBook.images) {
    const image = new Image();
    image.src = envelopedBook.images[imageId];
    await image.decode();
    bag[imageId] = { type: 'image', data: createCanvasFromImage(image) }
  }

  const book: Book = {
    revision: { id: 'not visited', revision: 1, prefix: 'envelope-' },
    pages: [],
    history: { entries: [], cursor: 0 },
    direction: envelopedBook.direction,
    wrapMode: envelopedBook.wrapMode,
    chatLogs: [],
    notebook: envelopedBook.notebook ?? emptyNotebook(null),
    attributes: { publishUrl: null, showVideoPlayButton: true, showVideoDottedBorder: true },
    newPageProperty: {...trivialNewPageProperty},
  };

  const getCanvas: LoadMediaFunc = async (imageId: string, mediaType: MediaType) => {
    const entry = bag[imageId];
    if (!entry) {
      return createMissingMediaReference(mediaType, { reason: 'envelope-missing', missingId: imageId });
    }
    return entry.data;
  };

  for (const envelopedPage of envelopedBook.pages) {
    const frameTree = await unpackFrameMedias(envelopedPage.paperSize, envelopedPage.frameTree, getCanvas);
    const bubbles = await unpackBubbleMedias(envelopedPage.paperSize, envelopedPage.bubbles, getCanvas);
  
    const page: Page = {
      id: envelopedPage.id ?? ulid(),
      frameTree: frameTree,
      bubbles: bubbles,
      paperSize: envelopedPage.paperSize,
      paperColor: envelopedPage.paperColor,
      frameColor: envelopedPage.frameColor,
      frameWidth: envelopedPage.frameWidth,
      fontSizeCoefficient: envelopedPage.fontSizeCoefficient ?? 1.0,
      source: null,
    }
    book.pages.push(page);
  }

  return book;
}
