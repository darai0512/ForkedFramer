# TextLift 由来のフキダシ配置に必要な前提情報（メモ）

## どこで何をしているか
- `src/utils/textLiftFilm.ts` で TextLiftDialog に `ImageMedia.drawSource` を渡し、返ってきた `boxes[].box_2d` を使ってフキダシを生成する予定。
- 描画は `src/lib/layeredCanvas/layers/paperRendererLayer.ts` が担当。`calculatePhysicalLayout` でページ全体の `Layout`（各コマの台形コーナーを含む）を作り、その `Layout` を元にフレームとフキダシを描画する。
- フィルムの描画は `drawFilmStack`（`src/lib/layeredCanvas/tools/draw/drawFilmStack.ts`）で実施。フレームの「バウンディング矩形中心」を原点に、フィルムが持つスケール・移動・回転を適用してから画像を描画している。

## 座標系と変換の要点
- ページ座標: `paperSize` を基準にするワールド座標。フレームの `Layout.corners` はこの座標系の台形（padding/cornerOffsets 済み）。
- フレーム中心: `trapezoidBoundingRect(layout.corners)` の中心を使う（台形そのものではなく軸平行矩形）。
- フィルムの変換: 画像のピクセル座標 `p_img = (x, y)`（左上基準、`drawSource` の解像度）をページ座標に送る行列は次の積。
  - `T(frameCenter) * T(translation) * R(-rotation) * S(scale * reverse) * T(-imgW/2, -imgH/2)`
  - `scale = Film.getShiftedScale(paperSize, contentSize, n_scale)` で、基準は「紙面の短辺」。
  - `translation = Film.getShiftedTranslation(paperSize, contentSize, n_translation)` も短辺基準の正規化値。
  - `reverse` は左右/上下反転の ±1。
  - `rotation` は度数をマイナスして描画（見かけの回転）。
  - `imgW/imgH = media.naturalWidth/Height`（`drawSource` と同値を想定）。
- クリッピング: `makeFrameClip(layout.corners, ...)` を使って台形内に切り抜いているため、矩形中心と実際の可視範囲は異なる場合がある。
- フキダシ座標: `Bubble.n_p0/n_p1` などは「紙面に対する正規化（0-1）」で保持。`setPhysicalCenter/Size` で紙面座標から正規化に戻す。`embedded` が true の場合は `bubble.getPhysicalCenter` を使って `findLayoutAt` し、コマの内部に属するか判定している。

## ユーザー回答で確定したこと
- TextLiftDialog の `boxes[].box_2d` は元画像（`drawSource`）のピクセル座標そのまま。
- `textLiftFilm` の呼び出しでコマの `FrameElement` を渡せる。Bubble も FilmStack を持つが、TextLift 用では Frame 側に限定して扱ってよい。
- フキダシは `embedded=false` の浮遊扱いにしておく（embed だと不可視になる場合があるため）。

## TextLift で位置を合わせるために最低限必要な情報
1. **対象のコマ `Layout`**  
   - `calculatePhysicalLayout(page.frameTree, paperSize, [0,0])` の結果から、`film` を含む `FrameElement.filmStack` を持つ leaf `Layout` を特定する。呼び出し元から `FrameElement` を受け取る前提（Bubble 側の FilmStack は無視する）。
2. **フィルムの描画行列パラメータ**  
   - `film.n_scale`, `film.n_translation`, `film.rotation`, `film.reverse`。`contentSize` は `media.naturalWidth/Height`（`drawSource` と一致する想定）。
3. **フレームの描画基準**  
   - `trapezoidBoundingRect(layout.corners)` の中心座標とサイズ（スケール基準や矩形中心が台形とズレる点を把握するため）。
   - クリッピングに使う台形 `layout.corners`（バウンディング矩形からはみ出る部分は描かれない）。
4. **ページ全体の基準**  
   - `paperSize`（フィルムのスケール・移動の正規化基準、およびフキダシ正規化に必要）。
5. **フキダシへの反映方針**（仕様決め用）  
   - 今回は `embedded=false` の浮遊。バウンディングボックスに足すマージン、複数選択時の配置アルゴリズムなどは要決定。

## 不明点・確認したいこと
- TextLift では `reverse`（反転）と `rotation`（回転）は無視する前提で扱う。

このメモで不足している情報があれば教えてください。
