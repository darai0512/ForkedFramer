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
  await traverseNodeFlat(psd, items, [], 0);
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

async function traverseNodeFlat(
  node: any,
  results: PsdFlatItem[],
  groupStack: string[],
  depth: number,
  isVisible: boolean = true
): Promise<void> {
  const nodeHidden = isNodeHidden(node);
  const currentVisible = isVisible && (node.type === 'Psd' || !nodeHidden);

  if (node.type === "Layer") {
    try {
      // composite(false, false): 生のピクセルデータを取得（effectsやopacity未適用）
      // opacityはFilm.opacityで別途適用する（composite(true,*)だとopacityがalphaに焼き込まれ二重適用になる）
      const pixelData = await node.composite(false, false);
      if (pixelData && node.width > 0 && node.height > 0) {
        const canvas = pixelDataToCanvas(pixelData, node.width, node.height);
        results.push({
          kind: 'layer',
          info: {
            canvas,
            name: node.name,
            visible: currentVisible,
            top: node.top,
            left: node.left,
            isGroup: false,
            groupPath: groupStack.join("/"),
            depth,
            parentGroupName: groupStack.length > 0 ? groupStack[groupStack.length - 1] : null,
            opacity: getNodeOpacity(node),
            blendMode: getNodeBlendMode(node),
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
        await traverseNodeFlat(child, results, groupStack, depth + 1, currentVisible);
      }
    }
    groupStack.pop();
  } else if (node.type === "Psd") {
    if (node.children) {
      for (const child of node.children) {
        await traverseNodeFlat(child, results, groupStack, depth, currentVisible);
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

  for (const item of flatItems) {
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
