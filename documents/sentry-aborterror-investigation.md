# Sentry Issue: JAVASCRIPT-SVELTE-PE (AbortError)

## 概要

| 項目 | 内容 |
|------|------|
| **Issue ID** | JAVASCRIPT-SVELTE-PE |
| **エラー** | `AbortError: AbortError` |
| **発生件数** | 13回 |
| **影響ユーザー** | 2人 |
| **初回発生** | 2025-10-30 |
| **最終発生** | 2026-01-20 |
| **検出メカニズム** | `onunhandledrejection` |
| **DOMException.code** | 20 (ABORT_ERR) |

## 原因

FSA（File System Access API）を使った仮想ファイルシステムの読み書き処理で`AbortError`が発生している。

### 主な発生箇所

#### 1. `src/lib/filesystem/sqlite/BlobStore.ts:29`

```typescript
async write(id: string, blob: Blob): Promise<string> {
  // ...
  await Promise.all([
    (async () => {
      const fileHandle = await this.dirHandle!.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable({ keepExistingData: false });
      await blob.stream().pipeTo(writable);  // ← ここが問題
    })(),
    // ...
  ]);
}
```

`pipeTo`はストリーミング書き込みで、大きなBlobの場合に途中でAbortされやすい。

#### 2. `src/lib/filesystem/fsaFileSystem.ts` - FSAFilePersistenceProvider

- `readFile()`: `getFileHandle`, `getFile`, `arrayBuffer`
- `writeFile()`: `getFileHandle`, `createWritable`, `write`, `close`

これらのFSA操作はすべてAbort可能。

## 発生シナリオ

1. ユーザーがFSAベースのローカルストレージを使用中
2. ファイル保存/読み込み処理の途中でページを離脱、またはタブを閉じる
3. 進行中の非同期FSA操作が中断され`AbortError`がスローされる
4. Promiseが未処理のまま`onunhandledrejection`でSentryに報告される

**重要**: 大きなファイルの場合、保存処理に時間がかかり、途中でキャンセルされてデータが不完全な状態になる可能性がある（「セーブがうまくいかない」問題の原因の可能性）

## 問題点

### `BlobStore.write` の問題

1. **`pipeTo` はストリーミング書き込み**
   大きなBlobの場合、途中でAbortされるとファイルが不完全な状態で終わる

2. **並列書き込み (`Promise.all`)**
   `.bin` と `.meta` を並列に書いているので、一方だけ成功する可能性がある

3. **エラーハンドリングがない**
   AbortErrorがそのまま上位に伝播し、ユーザーには何が起きたかわからない

## 改善案

### A案: `pipeTo` を `arrayBuffer` + `write` に変更（推奨）

```typescript
async write(id: string, blob: Blob): Promise<string> {
  if (!this.dirHandle) throw new Error('BlobStore not initialized');
  console.log('Writing blob:', id, 'type:', blob.type);

  const fileName = `${id}.bin`;
  const metaFileName = `${id}.meta`;

  // データファイルを先に書き込む（一括書き込み）
  const fileHandle = await this.dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable({ keepExistingData: false });
  const arrayBuffer = await blob.arrayBuffer();  // 一括でメモリに読み込み
  await writable.write(arrayBuffer);
  await writable.close();

  // メタファイルを書き込む
  const metaHandle = await this.dirHandle.getFileHandle(metaFileName, { create: true });
  const metaWritable = await metaHandle.createWritable({ keepExistingData: false });
  await metaWritable.write(JSON.stringify({ type: blob.type }));
  await metaWritable.close();

  return `blobs/${fileName}`;
}
```

**メリット**:
- 書き込み自体は短時間で終わるためAbort耐性が上がる
- 順次書き込みにより、データの整合性が保たれやすい

**デメリット**:
- 大きなBlobでメモリを食う（ただし、一時的なので問題になりにくい）

### B案: リトライ機構を追加

AbortErrorが発生したら数回リトライする。

```typescript
async writeWithRetry(id: string, blob: Blob, maxRetries = 3): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.write(id, blob);
    } catch (e) {
      if (e.name === 'AbortError' && i < maxRetries - 1) {
        console.warn(`Write aborted, retrying (${i + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Write failed after retries');
}
```

### C案: 書き込み順序を修正 + 読み込み時の検証

1. データ（.bin）を先に書き込む
2. 成功したらメタ（.meta）を書き込む
3. 読み込み時に.metaがなければ不完全として扱う

### D案: Sentryでフィルタリング（応急処置）

```typescript
// src/App.svelte:207
ignoreErrors: [
  'WebGPU is not supported on this browser',
  'No appropriate GPUAdapter found',
  'AbortError',  // FSA操作のキャンセル
],
```

これは根本解決ではないが、ノイズを減らすために併用可能。

## 推奨対応

1. **A案を実装**: `pipeTo`を`arrayBuffer`+`write`に変更
2. **D案も併用**: Sentryの`ignoreErrors`に`AbortError`を追加（ユーザー操作によるキャンセルは報告不要）
3. **保存失敗時のユーザー通知**: 保存処理でエラーが発生した場合、ユーザーに通知するUIを検討

## 関連Issue: JAVASCRIPT-SVELTE-EE (EncodingError)

### 概要

| 項目 | 内容 |
|------|------|
| **Issue ID** | JAVASCRIPT-SVELTE-EE |
| **エラー** | `EncodingError: The source image cannot be decoded.` |
| **発生件数** | **503回** |
| **影響ユーザー** | 12人 |
| **初回発生** | 2025-05-20 |
| **最終発生** | 2026-01-21 |

### 因果関係

JAVASCRIPT-SVELTE-PE (AbortError) が原因で、JAVASCRIPT-SVELTE-EE (EncodingError) が発生していると考えられる。

```
1. FSABlobStore.write の pipeTo が途中でAbort (JAVASCRIPT-SVELTE-PE)
   ↓
2. 不完全な .bin ファイルがディスクに残る
   ↓
3. 後でファイルを開く → BlobStore.read で読み込み
   ↓
4. createImageFromBlob (src/lib/layeredCanvas/tools/imageUtil.ts:14)
   ↓
5. image.decode() (src/lib/layeredCanvas/tools/imageUtil.ts:18) が失敗
   ↓
6. EncodingError: The source image cannot be decoded (JAVASCRIPT-SVELTE-EE)
```

### コードの流れ

```typescript
// src/lib/layeredCanvas/tools/imageUtil.ts:14-20
export async function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  await image.decode();  // ← 不完全なBlobだとここで失敗
  URL.revokeObjectURL(url);
  return image;
}
```

### 呼び出し経路

1. `fileImages.ts:loadMediaResource` → `file.readMediaResource()`
2. `fsaFileSystem.ts:FSAFile.readMediaResource` → `mediaConverter.fromStorable()`
3. `mediaConverter.ts:BrowserMediaConverter.fromStorable` → `createCanvasFromBlob()`
4. `imageUtil.ts:createCanvasFromBlob` → `createImageFromBlob()`
5. `imageUtil.ts:createImageFromBlob` → `image.decode()` **← ここで失敗**

### なぜ503回も発生しているか

一度壊れた画像ファイルは、修復しない限り何度開いても壊れたまま。同じユーザーが同じファイルを開くたびにエラーが発生している可能性が高い。

### 追加の改善案

#### E案: 読み込み時の検証と自動クリーンアップ

```typescript
// BlobStore.read で不完全なファイルを検出
async read(id: string): Promise<Blob> {
  // ... 既存の読み込み処理 ...

  // 画像の場合、デコード可能かチェック
  if (mimeType.startsWith('image/')) {
    try {
      const testImage = new Image();
      testImage.src = URL.createObjectURL(blob);
      await testImage.decode();
      URL.revokeObjectURL(testImage.src);
    } catch (e) {
      // デコード失敗 → 不完全なファイルとして削除
      console.error(`Corrupted image detected: ${id}, removing...`);
      await this.delete(id);
      throw new Error(`Corrupted image: ${id}`);
    }
  }

  return blob;
}
```

#### F案: createImageFromBlob でのエラーハンドリング改善

```typescript
export async function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error(`Failed to decode image (size: ${blob.size} bytes, type: ${blob.type}): ${e.message}`);
  }
  URL.revokeObjectURL(url);
  return image;
}
```

## 優先度

| 対応 | 優先度 | 理由 |
|------|--------|------|
| A案 (pipeTo→arrayBuffer) | **高** | 根本原因の修正。不完全な書き込みを防ぐ |
| D案 (Sentryフィルタ) | 中 | ノイズ削減。根本解決ではない |
| E案 (読み込み時検証) | 中 | 既存の壊れたファイルへの対応 |
| F案 (エラーハンドリング) | 低 | デバッグ情報の改善 |

## 関連ファイル

- `src/lib/filesystem/sqlite/BlobStore.ts` - Blob保存処理
- `src/lib/filesystem/fsaFileSystem.ts` - FSAファイルシステム実装
- `src/lib/filesystem/sqlite/SqlJsAdapter.ts` - SQLite永続化
- `src/lib/filesystem/mediaConverter.ts` - メディア変換
- `src/lib/layeredCanvas/tools/imageUtil.ts` - 画像ユーティリティ（デコード処理）
- `src/filemanager/fileImages.ts` - 画像読み込み
- `src/filemanager/localFileSystem.ts` - ローカルファイルシステム構築
- `src/App.svelte` - Sentry設定
