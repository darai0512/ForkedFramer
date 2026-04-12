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

async function traverseNodeFlat(
  node: Node,
  results: PsdFlatItem[],
  groupStack: string[],
  depth: number
): Promise<void> {
  if (node.type === "Layer") {
    try {
      const pixelData = await node.composite(true, true);
      if (pixelData && node.width > 0 && node.height > 0) {
        const canvas = pixelDataToCanvas(pixelData, node.width, node.height);
        results.push({
          kind: 'layer',
          info: {
            canvas,
            name: node.name,
            visible: !node.isHidden,
            top: node.top,
            left: node.left,
            isGroup: false,
            groupPath: groupStack.join("/"),
            depth,
            parentGroupName: groupStack.length > 0 ? groupStack[groupStack.length - 1] : null,
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
        visible: true,
      },
    });
    const newGroupStack = [...groupStack, node.name];
    if (node.children) {
      for (const child of node.children) {
        await traverseNodeFlat(child, results, newGroupStack, depth + 1);
      }
    }
  } else if (node.type === "Psd") {
    if (node.children) {
      for (const child of node.children) {
        await traverseNodeFlat(child, results, groupStack, depth);
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
  const imageData = new ImageData(new Uint8ClampedArray(pixelData.buffer as ArrayBuffer), width, height);
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
