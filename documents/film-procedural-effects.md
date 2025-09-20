# Film レイヤー向けプロシージャルエフェクト実装設計

## 概要
- 集中線などのエフェクトを `Film` レイヤーとして追加し、バブル由来の集中線との併存を許可する。
- 新規エフェクトは常にプロシージャル生成し、生成済み画像ファイルは保存しない。
- `saveBookTo` / `loadBookFrom` を通じてプロシージャルパラメータのみを永続化する。

## 要求事項
- 既存バブルはそのまま利用可能。バブル用データ構造の削除・移行は不要。
- プロシージャルエフェクトは `Film` の新機能として扱い、既存の `Film` 操作 UX に統合する。
- 同一ページ内で画像ベース `Film` とプロシージャル `Film` が混在しても動作すること。

## 新規データ構造
### FilmContent
```ts
export type FilmProceduralEffectType =
  | 'concentration'
  | 'speedline'
  | 'burst'; // 仮の候補。追加しやすい列挙にする

export interface FilmProceduralEffect {
  type: FilmProceduralEffectType;
  params: Record<string, number | string | boolean>;
}

export type FilmContent =
  | { kind: 'media'; media: Media }
  | { kind: 'procedural'; effect: FilmProceduralEffect };
```

### Film 拡張
```ts
class Film {
  constructor(content: FilmContent) { ... }

  content: FilmContent;
  transientCanvas?: HTMLCanvasElement; // プロシージャル描画結果の揮発キャッシュ
  // n_scale / n_translation など既存の幾何情報は従来通り保持
}

static fromMedia(media: Media): Film;
static fromProcedural(effect: FilmProceduralEffect): Film;
```
- `transientCanvas` は保存対象外で、描画のたびに破棄・再生成可能。
- 既存コードが `film.media` へ直接アクセスしている箇所は `content.kind` を判定するよう改修する。

## プロシージャル描画エンジン
- 新モジュール: `src/lib/layeredCanvas/dataModels/proceduralEffects.ts`
```ts
export interface ProceduralEffectRenderer {
  render(effect: FilmProceduralEffect, paperSize: Vector, target: HTMLCanvasElement): void;
}

export const proceduralEffectRegistry: Record<FilmProceduralEffectType, ProceduralEffectRenderer>;

export function renderProceduralEffect(effect: FilmProceduralEffect, paperSize: Vector): HTMLCanvasElement {
  const renderer = proceduralEffectRegistry[effect.type];
  const canvas = document.createElement('canvas');
  // paperSize に基づき適切な解像度へ設定
  renderer.render(effect, paperSize, canvas);
  return canvas;
}
```
- 各エフェクト固有の描画ロジック（集中線生成など）は `ProceduralEffectRenderer` 実装として登録する。
- レンダラは deterministic に振る舞い、同一 `params` から常に同一描画を生成する。

## 保存フォーマット拡張
### SerializedFilm
```ts
interface SerializedFilm {
  ulid: string;
  n_scale: number;
  n_translation: Vector;
  rotation: number;
  reverse: Vector;
  visible: boolean;
  prompt: string | null;
  effects: SerializedAppliedEffect[];
  barriers: Barriers;
  mediaType?: MediaType;
  image?: string;
  proceduralEffect?: {
    type: FilmProceduralEffectType;
    params: Record<string, unknown>;
  };
}
```
- `image` と `mediaType` は画像ベース `Film` 用に残す。
- `proceduralEffect` が存在する場合、`image` は未設定のままにする。

### packFilms (saveBookTo)
- `Film.content.kind === 'media'` であれば従来通り `saveMediaResource` を呼び出す。
- `Film.content.kind === 'procedural'` の場合は `saveMediaResource` を実行せず、`markUp.proceduralEffect` にタイプとパラメータを格納。
- 既存構造との互換性のため、`media` 系フィールドが未定義でも無視されるよう既存呼び出し側を確認する。

### unpackFilms (loadBookFrom)
- `serializedFilm.proceduralEffect` があれば `Film.fromProcedural` を利用。
- 復元直後は `transientCanvas` を `undefined` のままにし、描画要求時に `renderProceduralEffect` でキャンバスを生成。
- 旧データは `proceduralEffect` 未設定のため、従来通り `Film.fromMedia` を使用。

## 描画ワークフロー
1. レイヤー描画時に `Film.content.kind` を確認。
2. `procedural` で `transientCanvas` が未生成なら `renderProceduralEffect` を呼び出し、結果を `transientCanvas` に保持。
3. そのキャンバスを既存の描画パイプラインに渡し、`n_scale` / `n_translation` / `rotation` 等の変換を適用。
4. パラメータ変更や paperSize 変更時は `transientCanvas` を破棄して再描画を促す。

## UI 実装観点
- エフェクト追加 UI: `Film.fromProcedural` を通じて `FilmStack` に挿入。
- プロパティ編集 UI: `Film.content.kind === 'procedural'` の場合にパラメータ更新フォームを表示。更新後は `film.transientCanvas = undefined`。
- プレビュー生成やサムネイルは描画ワークフローと同じ仕組みで再利用する。

## テスト戦略
- **ユニット**: `proceduralEffects.ts` で各レンダラが Canvas を生成し、基本的な統計（線分本数など）が期待値に近いことを検証。
- **シリアライズ往復**: `packFilms` → `unpackFilms` 経由で `Film.content` の種類とパラメータが保持されるか確認。
- **統合**: `loadBookFrom` 後にページ描画を行い、プロシージャル `Film` が欠損なく再生成されるかを Vitest + jsdom で検証。

## 互換性とリリース
- 既存ファイルは `proceduralEffect` 未設定のため互換性に影響なし。
- 新機能を利用したファイルを旧バージョンで開くと `proceduralEffect` を無視する可能性がある点をリリースノートで告知。
- `SerializedBook.revision` に変更が必要な場合はリビジョン番号を更新し、データマイグレーションハンドラで `proceduralEffect` 未定義時の初期値を保証する。

## 今後の拡張余地
- パラメータスキーマの型安全化（Zod など）
- プレビュー描画のワーカ化（複雑エフェクトの軽量化）
- エフェクトバリエーション追加時の UI テンプレート化
