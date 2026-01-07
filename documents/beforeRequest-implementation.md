# beforeRequest モード実装計画

## 概要

現在のインライン画像/動画生成は、`generateImageInline` や `generateMovie` が呼ばれた時点で即座にAPIリクエストを発行している。これを「リクエスト情報を埋め込むだけ」の方式に変更し、実際のAPI呼び出しは `filmProcessorQueue` で行うようにする。

## 目的

- 数十枚同時生成時のAPI同時リクエスト数を制御可能にする
- 将来的に最大同時実行数の制限を実装しやすくする

## 現状の流れ

```
generateImageInline() / generateMovie()
  → text2Image() / image2Video() [即座にAPI呼び出し]
  → requestId取得
  → ImageMedia/VideoMedia(mode: 'afterRequest', requestId, model)
  → filmProcessorQueue.publish()
  → pollMediaStatus()でポーリング
```

## 変更後の流れ

```
generateImageInline() / generateMovie()
  → ImageMedia/VideoMedia(mode: 'beforeRequest', request情報) [API呼び出しなし]
  → filmProcessorQueue.publish()

filmProcessorQueue
  → mode: 'beforeRequest' を検出
  → text2Image() / image2Video() [ここで初めてAPI呼び出し]
  → mode を 'afterRequest' に更新、requestId/model を設定
  → pollMediaStatus()でポーリング
```

---

## 実装タスク

### 1. 型の拡張

**ファイル**: `src/lib/layeredCanvas/dataModels/media.ts`

```typescript
// 現在
export type RemoteMediaReference = {
  mediaType: MediaType,
  mode: RemoteMediaMode,
  requestId: string,
  model: string
};

// 変更後
export type RemoteMediaReferenceBeforeRequest = {
  mediaType: 'image';
  mode: 'beforeRequest';
  request: TextToImageRequest;
} | {
  mediaType: 'video';
  mode: 'beforeRequest';
  request: ImageToVideoRequest;
};

export type RemoteMediaReferenceAfterRequest = {
  mediaType: MediaType;
  mode: 'afterRequest' | 'failure';
  requestId: string;
  model: string;
};

export type RemoteMediaReference =
  | RemoteMediaReferenceBeforeRequest
  | RemoteMediaReferenceAfterRequest;
```

**ファイル**: `src/lib/filesystem/fileSystem.ts`
- 同様の型定義を更新

### 2. ImageMedia / VideoMedia の更新

**ファイル**: `src/lib/layeredCanvas/dataModels/media.ts`

- コンストラクタが `RemoteMediaReferenceBeforeRequest` を受け取れるようにする
- `beforeRequest` 状態から `afterRequest` 状態に遷移するメソッドを追加

```typescript
class ImageMedia {
  // beforeRequest → afterRequest への遷移
  setRequestResult(requestId: string, model: string): void {
    if (this.remoteMediaReference?.mode === 'beforeRequest') {
      this.remoteMediaReference = {
        mediaType: 'image',
        mode: 'afterRequest',
        requestId,
        model
      };
    }
  }
}
```

### 3. filmProcessorStore の改修

**ファイル**: `src/utils/filmprocessor/filmProcessorStore.ts`

```typescript
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
        if (rmr.mediaType === 'image') {
          const { requestId, model } = await text2Image(rmr.request);
          await saveRequest(get(mainBookFileSystem)!, 'image', rmr.request.mode, requestId, model);
          media.setRequestResult(requestId, model);
        } else if (rmr.mediaType === 'video') {
          const { requestId, model } = await image2Video(rmr.request);
          await saveRequest(get(mainBookFileSystem)!, 'video', rmr.request.model, requestId, model);
          media.setRequestResult(requestId, model);
        }
        // 続けて afterRequest の処理（pollMediaStatus）へ
      } catch (e) {
        media.fail();
        redrawToken.set(true);
        return;
      }
    }

    // afterRequest の場合: ポーリング
    if (rmr.mode === 'afterRequest' || media.persistentSource.mode === 'afterRequest') {
      const currentRmr = media.persistentSource as RemoteMediaReference;
      const { mediaResources } = await pollMediaStatus(currentRmr);
      if (mediaResources.length > 0) {
        media.setMedia(mediaResources[0]);
      }
      get(bookOperators)?.commit(null);
    }
  }

  // エフェクト処理...
});
```

### 4. generateImageInline の改修

**ファイル**: `src/utils/feathralImaging.ts`

```typescript
export async function generateImageInline(
  prompt: string,
  image_size: {width: number, height: number},
  mode: ImagingMode,
  background: ImagingBackground,
  imageDataUrls: string[],
  option: TextToImageOption = { kind: 'none' },
): Promise<Film> {
  const request: TextToImageRequest = {
    provider: inferProvider(mode),
    prompt,
    imageSize: image_size,
    numImages: 1,
    mode,
    background,
    imageDataUrls,
    option,
  };

  // API呼び出しなし - リクエスト情報を埋め込むだけ
  const newMedia = new ImageMedia({
    mediaType: 'image',
    mode: 'beforeRequest',
    request
  });
  const newFilm = Film.fromMedia(newMedia);

  filmProcessorQueue.publish(newFilm);

  return newFilm;
}
```

### 5. generateMovie の改修

**ファイル**: `src/utils/generateMovie.ts`

```typescript
export async function generateMovie(filmStack: FilmStack, film: Film) {
  // ... 既存のバリデーション ...

  const request = await waitDialog<ImageToVideoRequest>('videoGenerator', { media: film.content.media });
  if (!request) { return; }

  // API呼び出しなし - リクエスト情報を埋め込むだけ
  const newMedia = new VideoMedia({
    mediaType: 'video',
    mode: 'beforeRequest',
    request
  });
  const newFilm = Film.fromMedia(newMedia);
  filmProcessorQueue.publish(newFilm);

  const index = filmStack.films.indexOf(film);
  filmStack.films.splice(index + 1, 0, newFilm);

  toastStore.trigger({ message: `ムービー生成には数分かかります`, timeout: 3000});
}
```

### 6. 永続化対応

**ファイル**: `src/lib/filesystem/mediaConverter.ts`

`beforeRequest` の `request` オブジェクトには `imageDataUrls` が含まれる可能性がある。
IndexedDB では Blob として保存されるため、サイズの問題は軽微と想定。

```typescript
// toStorable - 変更不要（remote オブジェクトとしてそのまま保存される）
// fromStorable - 変更不要（remote オブジェクトとしてそのまま復元される）
```

### 7. インポートの追加

**ファイル**: `src/utils/filmprocessor/filmProcessorStore.ts`

```typescript
import { text2Image, image2Video, pollMediaStatus } from '../../supabase';
import { saveRequest } from '../../filemanager/warehouse';
import { mainBookFileSystem } from '../../filemanager/fileManagerStore';
import type { TextToImageRequest } from '../edgeFunctions/types/imagingTypes';
import type { ImageToVideoRequest } from '$protocolTypes/imagingTypes';
```

---

## 将来の拡張: 同時実行数制限

`PubSubQueue` を改良するか、セマフォを追加して最大同時実行数を制限:

```typescript
// 案: セマフォを使った同時実行制限
class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>(resolve => this.waiting.push(resolve));
  }

  release(): void {
    if (this.waiting.length > 0) {
      this.waiting.shift()!();
    } else {
      this.permits++;
    }
  }
}

const apiSemaphore = new Semaphore(4);

// filmProcessorQueue 内で使用
await apiSemaphore.acquire();
try {
  await text2Image(rmr.request);
} finally {
  apiSemaphore.release();
}
```

---

## テスト項目

1. 画像生成（コマごと）が正常に動作する
2. 画像生成（ページごと）が正常に動作する
3. 動画生成が正常に動作する
4. 生成中にアプリを再起動しても、beforeRequest 状態から再開できる
5. エラー時に failure モードに遷移する
6. ローディングスピナーが正しく表示される

---

## 実装順序

1. 型の拡張（media.ts, fileSystem.ts）
2. ImageMedia / VideoMedia の更新
3. filmProcessorStore の改修
4. generateImageInline の改修
5. generateMovie の改修
6. 動作確認
7. （将来）同時実行数制限の実装
