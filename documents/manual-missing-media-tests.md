# 欠損メディア 手動テストマニュアル

## 準備

- 開発環境（localhost など、`developmentFlag` が true の状態）で起動
- FSA の BlobStore が開いている状態
- 対象IDの一覧取得: `await window.fpListBlobs()`

## 破損データの作り方（共通）

- `.bin` 削除: `await window.fpCorruptBlob("01XXXX", "delete-bin")`
- `.meta` 削除: `await window.fpCorruptBlob("01XXXX", "delete-meta")`
- `.meta` 破壊: `await window.fpCorruptBlob("01XXXX", "bad-meta")`
- サイズ不一致: `await window.fpCorruptBlob("01XXXX", "mismatch-size", { sizeDelta: 10 })`
- 切り詰め: `await window.fpCorruptBlob("01XXXX", "truncate", { truncateTo: 1024 })`

## テスト項目と必要な欠損データ

### 1. ブック読込（画像/動画）

- 用意する破損:
  - `.bin` 削除
  - サイズ不一致
  - 切り詰め
- 期待結果:
  - 欠損専用UIが表示される
  - 欠損フィルムが保持され、レイアウトが崩れない
  - アプリ全体が落ちない

### 2. 吹き出し画像

- 用意する破損:
  - `.meta` 破壊
  - サイズ不一致
- 期待結果:
  - 欠損UIが表示される
  - 欠損フィルムが保持される
  - 編集操作が継続できる

### 3. ギャラリー/素材棚

- 用意する破損:
  - `.bin` 削除
  - `.meta` 削除
- 期待結果:
  - 欠損UIが表示される
  - 欠損項目のみが影響を受け、他項目が影響を受けない

### 4. ノートブック人物（立ち絵）

- 用意する破損:
  - 切り詰め
  - サイズ不一致
- 期待結果:
  - 欠損UIが表示される
  - 欠損があってもノートブック全体が落ちない

### 5. dump/undump

- 用意する破損:
  - `.bin` 削除
  - `.meta` 破壊
- 期待結果:
  - 処理が途中で止まらない
  - 欠損データは欠損として復元される（フィルムは保持）

## 注意

- 破損データを作ると元データは壊れるため、検証用データで実施すること。

## 実施結果（2026-01-25）

- 実行環境: 開発環境 `https://frameplanner.example.local:3000/` + DevTools（remote debugging）+ FSA BlobStore 接続
- 実施方法: DevTools からスクリプト実行（`window.fpCorruptBlob` と `loadBookFrom` 相当）。キャッシュ影響を避けるため FSA filesystem インスタンスを毎回作り直して検証
- 検証結果（スクリプトでの判定）:
  - `.bin` 削除 / `.meta` 削除 / `.meta` 破壊 / サイズ不一致 / 切り詰め → すべて `persistentSource.mode === "missing"` と `media.isFailed === true` を確認。読み込みは成功し、アプリは落ちない
- UI目視結果:
  - ブック読込: キャンバス上で欠損プレースホルダー（赤×/欠損メディア）を確認。フィルム位置は保持
  - 吹き出し画像: 吹き出し内で欠損プレースホルダー（赤×/欠損メディア）を確認
  - ギャラリー/素材棚（画像一覧）: 「使用中」「リンク切れ」の一覧で欠損タイル表示を確認
  - ノートブック人物: 右ドロワーの登場人物ポートレートで欠損メディア表示を確認
  - dump/undump: FSAデスクトップのブックを対象にdump→undump後も欠損プレースホルダー（赤×/欠損メディア）を確認。欠損は欠損として復元され、UIが継続動作
