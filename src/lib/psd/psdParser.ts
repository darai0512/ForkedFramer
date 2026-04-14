import Psd, { type Node } from "@webtoon/psd";
import { Film, FilmStack } from "../layeredCanvas/dataModels/film";
import { ImageMedia } from "../layeredCanvas/dataModels/media";
import { FrameElement } from "../layeredCanvas/dataModels/frameTree";
import { frameExamples } from "../layeredCanvas/tools/frameExamples";
import { newPage, type Page } from "../book/book";

export type PsdImportMode = 'composite' | 'layers';

export interface PsdLayerInfo {
  canvas: HTMLCanvasElement;
  name: string;
  visible: boolean;
  // PSD座標系でのオフセット
  top: number;
  left: number;
  isGroup: boolean;
  groupPath: string; // "GroupA/GroupB" のようなパス
  depth: number; // グループのネスト深度
  parentGroupName: string | null; // 直近の親グループ名
  opacity: number; // 0.0〜1.0
  blendMode: string; // PSDブレンドモード文字列 (norm, mul, scrn, hLit, etc.)
  clippingMask: boolean; // クリッピングマスクかどうか
}

/** グループヘッダー情報 */
export interface PsdGroupHeader {
  name: string;
  depth: number;
  visible: boolean;
}

/** フラット化されたPSD要素（レイヤーまたはグループヘッダー） */
export type PsdFlatItem =
  | { kind: 'layer'; info: PsdLayerInfo }
  | { kind: 'groupHeader'; header: PsdGroupHeader };

/**
 * PSDファイルを解析する
 */
export function parsePsd(buffer: ArrayBuffer): Psd {
  return Psd.parse(buffer);
}

/**
 * PSD全体を1枚の合成画像として取得
 */
export async function compositePsd(psd: Psd): Promise<HTMLCanvasElement> {
  const compositeBuffer = await psd.composite();
  const imageData = new ImageData(new Uint8ClampedArray(compositeBuffer.buffer as ArrayBuffer), psd.width, psd.height);

  const canvas = document.createElement("canvas");
  canvas.width = psd.width;
  canvas.height = psd.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * PSDのレイヤーをフラットなリストとして抽出（グループヘッダー付き）
 */
export async function extractPsdFlatItems(psd: Psd): Promise<PsdFlatItem[]> {
  const items: PsdFlatItem[] = [];
  const canvasSize: [number, number] = [psd.width, psd.height];
  await traverseNodeFlat(psd, items, [], 0, true, canvasSize);
  return items;
}

/**
 * ノードの非表示状態を確実に取得する。
 * @webtoon/psd の isHidden はGroupノードに対して undefined を返すバグがあるため、
 * layerFrame.layerProperties.hidden を直接参照する。
 */
function isNodeHidden(node: any): boolean {
  // layerFrame.layerProperties.hidden が最も信頼できるソース
  const lp = node.layerFrame?.layerProperties;
  if (lp && typeof lp.hidden === 'boolean') {
    return lp.hidden;
  }
  // フォールバック: isHidden が boolean ならそれを使う
  if (typeof node.isHidden === 'boolean') {
    return node.isHidden;
  }
  // Psdルートノード等: 表示扱い
  return false;
}

/**
 * ノードのopacity (0-255) を取得する
 */
function getNodeOpacity(node: any): number {
  const lp = node.layerFrame?.layerProperties;
  if (lp && typeof lp.opacity === 'number') {
    return lp.opacity / 255;
  }
  return 1.0;
}

/**
 * ノードのブレンドモード文字列を取得する
 */
function getNodeBlendMode(node: any): string {
  const lp = node.layerFrame?.layerProperties;
  if (lp && typeof lp.blendMode === 'string') {
    return lp.blendMode;
  }
  return 'norm';
}

/**
 * キャンバス全面を覆い、通常以外のブレンドモードを持つ破壊的レイヤーを検出する。
 * Clip Studio Paintの「カメラ」フォルダなどに含まれるガイド用レイヤーは、
 * PSD合成画像には含まれないが、レイヤーデータとしては存在する。
 * これらはキャンバス全体に影響し、意図しない色変化や消失を引き起こすため自動非表示にする。
 *
 * 判定条件:
 * 1. ブレンドモードがnorml/pass以外
 * 2. バウンディングボックスがキャンバスの90%以上をカバー
 * 3. 不透明ピクセルがレイヤー内の80%以上（大部分が塗りつぶされている）
 */
function isDestructiveFullCanvasLayer(
  node: any,
  canvasSize: [number, number],
  pixelData: Uint8ClampedArray
): boolean {
  const lp = node.layerFrame?.layerProperties;
  if (!lp) return false;

  const blendMode = lp.blendMode;
  // normal/pass through は破壊的ではない
  if (!blendMode || blendMode === 'norm' || blendMode === 'pass') return false;

  // レイヤーの範囲がキャンバスの90%以上をカバーしているか
  const layerWidth = Math.max(0, (lp.right ?? 0) - (lp.left ?? 0));
  const layerHeight = Math.max(0, (lp.bottom ?? 0) - (lp.top ?? 0));
  const layerArea = layerWidth * layerHeight;
  const canvasArea = canvasSize[0] * canvasSize[1];

  if (canvasArea <= 0 || layerArea < canvasArea * 0.9) return false;

  // ピクセルの不透明率をチェック（80%以上が不透明なら「塗りつぶし」）
  const totalPixels = pixelData.length / 4;
  let opaquePixels = 0;
  for (let i = 3; i < pixelData.length; i += 4) {
    if (pixelData[i] > 0) opaquePixels++;
  }
  const opaqueRatio = opaquePixels / totalPixels;

  if (opaqueRatio >= 0.8) {
    console.warn(
      `PSD: destructive full-canvas blend layer detected: "${lp.name}" (blend=${blendMode}, opaque=${(opaqueRatio*100).toFixed(0)}%), auto-hiding`
    );
    return true;
  }
  return false;
}

async function traverseNodeFlat(
  node: any,
  results: PsdFlatItem[],
  groupStack: string[],
  depth: number,
  isVisible: boolean = true,
  canvasSize: [number, number] = [0, 0]
): Promise<void> {
  const nodeHidden = isNodeHidden(node);
  const currentVisible = isVisible && (node.type === 'Psd' || !nodeHidden);

  if (node.type === "Layer") {
    try {
      // composite(false, false): 生のピクセルデータを取得（effectsやopacity未適用）
      // opacityはFilm.opacityで別途適用する（composite(true,*)だとopacityがalphaに焼き込まれ二重適用になる）
      const pixelData = await node.composite(false, false);
      if (pixelData && node.width > 0 && node.height > 0) {
        // キャンバス全面を覆う破壊的ブレンドレイヤー（CSPカメラフォルダ等）を自動非表示
        const destructive = isDestructiveFullCanvasLayer(node, canvasSize, pixelData);
        const layerVisible = destructive ? false : currentVisible;

        const canvas = pixelDataToCanvas(pixelData, node.width, node.height);
        results.push({
          kind: 'layer',
          info: {
            canvas,
            name: node.name,
            visible: layerVisible,
            top: node.top,
            left: node.left,
            isGroup: false,
            groupPath: groupStack.join("/"),
            depth,
            parentGroupName: groupStack.length > 0 ? groupStack[groupStack.length - 1] : null,
            opacity: getNodeOpacity(node),
            blendMode: getNodeBlendMode(node),
            clippingMask: !!node.layerFrame?.layerProperties?.clippingMask,
          },
        });
      }
    } catch (e) {
      console.warn(`PSD layer "${node.name}" composite failed:`, e);
    }
  } else if (node.type === "Group") {
    // グループヘッダーを挿入
    results.push({
      kind: 'groupHeader',
      header: {
        name: node.name,
        depth,
        visible: currentVisible,
      },
    });
    groupStack.push(node.name);
    if (node.children) {
      for (const child of node.children) {
        await traverseNodeFlat(child, results, groupStack, depth + 1, currentVisible, canvasSize);
      }
    }
    groupStack.pop();
  } else if (node.type === "Psd") {
    if (node.children) {
      for (const child of node.children) {
        await traverseNodeFlat(child, results, groupStack, depth, currentVisible, canvasSize);
      }
    }
  }
}

// 後方互換: 旧APIも維持
export async function extractPsdLayers(psd: Psd): Promise<PsdLayerInfo[]> {
  const items = await extractPsdFlatItems(psd);
  return items
    .filter((item): item is Extract<PsdFlatItem, { kind: 'layer' }> => item.kind === 'layer')
    .map(item => item.info);
}

function pixelDataToCanvas(
  pixelData: Uint8ClampedArray,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(new Uint8ClampedArray(pixelData), width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function bakeClippingLayers(baseInfo: PsdLayerInfo, clippedInfos: PsdLayerInfo[]) {
  // clippedInfos は下敷きに近い順に並んでいる想定
  const A = baseInfo;
  
  const ctx = A.canvas.getContext("2d")!;
  
  // 1. ベースレイヤーの現在のアルファ（形）を保存
  const alphaMaskCanvas = document.createElement("canvas");
  alphaMaskCanvas.width = A.canvas.width;
  alphaMaskCanvas.height = A.canvas.height;
  const actx = alphaMaskCanvas.getContext("2d")!;
  actx.drawImage(A.canvas, 0, 0);

  // 2. クリッピングレイヤーを順次ベースレイヤーに重ね描き
  for (const B of clippedInfos) {
    if (!B.visible) continue;
    ctx.save();
    ctx.globalCompositeOperation = psdBlendModeToCanvas(B.blendMode);
    ctx.globalAlpha = B.opacity;
    // BのキャンバスをAのキャンバスに相対的な位置で描画
    ctx.translate(B.left - A.left, B.top - A.top);
    ctx.drawImage(B.canvas, 0, 0);
    ctx.restore();
  }

  // 3. 最後に 'destination-in' で最初のアルファマスクを適用し、はみ出た部分を削る
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1.0;
  ctx.drawImage(alphaMaskCanvas, 0, 0);
  ctx.restore();
}

/**
 * 合成PNGモード: PSD全体を1枚のCanvasにcompositeし、1ページ＋1Film
 */
export async function createPageFromPsdComposite(psd: Psd): Promise<Page> {
  const canvas = await compositePsd(psd);
  const paperSize: [number, number] = [psd.width, psd.height];

  const frameTree = FrameElement.compile(frameExamples["white-paper"].frameTree);
  const media = new ImageMedia(canvas);
  const film = Film.fromMedia(media);
  frameTree.children[0].filmStack.films = [film];

  const page = newPage(frameTree, []);
  page.paperSize = paperSize;
  return page;
}

/**
 * PSDブレンドモード文字列をCanvas 2DのglobalCompositeOperationにマッピング
 * @see https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/#50577409_pgfId-1055819
 */
const PSD_BLEND_MODE_MAP: Record<string, GlobalCompositeOperation> = {
  'norm': 'source-over',    // Normal
  'mul ': 'multiply',       // Multiply
  'scrn': 'screen',         // Screen
  'over': 'overlay',        // Overlay
  'dark': 'darken',         // Darken
  'lite': 'lighten',        // Lighten
  'hLit': 'hard-light',     // Hard Light
  'sLit': 'soft-light',     // Soft Light
  'diff': 'difference',     // Difference
  'smud': 'exclusion',      // Exclusion
  'div ': 'color-dodge',    // Color Dodge
  'idiv': 'color-burn',     // Color Burn
  'lbrn': 'color-burn',     // Linear Burn → closest: color-burn
  'lddg': 'lighter',        // Linear Dodge (Add) → additive blending
  'hue ': 'hue',            // Hue
  'sat ': 'saturation',     // Saturation
  'colr': 'color',          // Color
  'lum ': 'luminosity',     // Luminosity
  'pass': 'source-over',    // Pass Through (グループ用) → normal扱い
};

function psdBlendModeToCanvas(psdMode: string): GlobalCompositeOperation {
  return PSD_BLEND_MODE_MAP[psdMode] ?? 'source-over';
}

/**
 * レイヤー分割モード: 各レイヤーを個別Filmとして1ページに積み上げ
 * グループヘッダーも「画像なしFilm」として挿入し、グループ構造を表現
 */
export async function createPageFromPsdLayers(psd: Psd): Promise<Page> {
  const flatItems = await extractPsdFlatItems(psd);
  const paperSize: [number, number] = [psd.width, psd.height];

  const frameTree = FrameElement.compile(frameExamples["white-paper"].frameTree);
  const films: Film[] = [];

  // ① Clipping Mask を考慮して焼き込み前処理を行う
  const bakedItems: PsdFlatItem[] = [];
  let currentBase: PsdLayerInfo | null = null;
  let clippingLayers: PsdLayerInfo[] = [];

  // 配列の最後（最背面）から先頭（最前面）に向かって処理する
  for (let i = flatItems.length - 1; i >= 0; i--) {
    const item = flatItems[i];
    if (item.kind === 'groupHeader') {
      bakedItems.unshift(item);
      continue;
    }

    if (item.info.clippingMask) {
      if (currentBase) {
        // 現在のベースレイヤーに対するクリッピングなのでリストに追加
        clippingLayers.push(item.info);
      } else {
        // ベースが見つからない異常系：そのまま通常レイヤーとして扱う
        bakedItems.unshift(item);
      }
    } else {
      // 新しいベースレイヤーを発見。これまでのクリッピングレイヤー群を直前のベースに焼き込む
      if (currentBase && clippingLayers.length > 0) {
        bakeClippingLayers(currentBase, clippingLayers);
        clippingLayers = []; // リセット
      }
      currentBase = item.info;
      bakedItems.unshift(item);
    }
  }
  // ループ後、最後のベースレイヤーの分を処理
  if (currentBase && clippingLayers.length > 0) {
    bakeClippingLayers(currentBase, clippingLayers);
  }

  // ② 焼き込み済みのアイテム群から Film を構築する
  for (const item of bakedItems) {
    if (item.kind === 'groupHeader') {
      // グループヘッダー: 画像なしの特殊Film
      const headerFilm = Film.fromGroupHeader(item.header.name, item.header.depth);
      headerFilm.visible = item.header.visible;
      films.push(headerFilm);
    } else {
      // 通常レイヤー
      const info = item.info;
      const media = new ImageMedia(info.canvas);
      const film = Film.fromMedia(media);
      film.visible = info.visible;
      film.opacity = info.opacity;
      film.blendMode = psdBlendModeToCanvas(info.blendMode);

      // レイヤー名
      film.prompt = info.name;
      film.groupDepth = info.depth;
      film.groupName = info.parentGroupName;
      /*
      src/lib/layeredCanvas/dataModels/film.ts の getShiftedScale の仕様
      const scale = pageSize / imageSize; // ← ここで「小さい画像」ほど高い倍率(scale)になってしまう
      n_scale（デフォルト値 1）は「用紙にフィットした状態を 1 とする相対スケール」として設計されているため、小さなレイヤーはすべて巨大に拡大描画されてしまい、合成画像が壊れて見えます。

      小さいレイヤー画像の自動拡大（スケーリング）対策
      PSD読み込みにおける「合成PNG」は用紙サイズ（キャンバスサイズ）と同じサイズで出力されるため意図したレイアウトになりますが、「レイヤー分割」で読み込んだ場合は、各レイヤー画像（手書き文字などの小さな要素）が、**FramePlanner2のFilmのデフォルト挙動によって「用紙の短辺（またはコマ）にフィットするよう自動で拡大」**されてしまいます。
      */
      film.setShiftedScale(paperSize, 1.0);


      // PSDレイヤーの位置をFramePlanner座標に変換
      const layerCenterX = info.left + info.canvas.width / 2;
      const layerCenterY = info.top + info.canvas.height / 2;
      const offsetX = layerCenterX - psd.width / 2;
      const offsetY = layerCenterY - psd.height / 2;
      film.setShiftedTranslation(paperSize, [offsetX, offsetY]);

      films.push(film);
    }
  }

  // PSD的にはレイヤーリストは上が手前（上位インデックス）
  // FilmStack.filmsは配列の後ろが手前なので、reverseが必要
  films.reverse();
  frameTree.children[0].filmStack.films = films;

  const page = newPage(frameTree, []);
  page.paperSize = paperSize;
  return page;
}
