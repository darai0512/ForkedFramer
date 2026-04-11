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
}

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
 * PSDのレイヤーを個別に取得（グループも展開）
 */
export async function extractPsdLayers(psd: Psd): Promise<PsdLayerInfo[]> {
  const layers: PsdLayerInfo[] = [];
  await traverseNode(psd, layers, []);
  return layers;
}

async function traverseNode(
  node: Node,
  results: PsdLayerInfo[],
  groupStack: string[]
): Promise<void> {
  if (node.type === "Layer") {
    try {
      const pixelData = await node.composite(true, true);
      if (pixelData && node.width > 0 && node.height > 0) {
        const canvas = pixelDataToCanvas(pixelData, node.width, node.height);
        results.push({
          canvas,
          name: node.name,
          visible: !node.isHidden,
          top: node.top,
          left: node.left,
          isGroup: false,
          groupPath: groupStack.join("/"),
        });
      }
    } catch (e) {
      console.warn(`PSD layer "${node.name}" composite failed:`, e);
    }
  } else if (node.type === "Group") {
    const newGroupStack = [...groupStack, node.name];
    if (node.children) {
      for (const child of node.children) {
        await traverseNode(child, results, newGroupStack);
      }
    }
  } else if (node.type === "Psd") {
    if (node.children) {
      for (const child of node.children) {
        await traverseNode(child, results, groupStack);
      }
    }
  }
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
 * グループ名をFilmのpromptフィールドに格納（表示用）
 */
export async function createPageFromPsdLayers(psd: Psd): Promise<Page> {
  const layerInfos = await extractPsdLayers(psd);
  const paperSize: [number, number] = [psd.width, psd.height];

  const frameTree = FrameElement.compile(frameExamples["white-paper"].frameTree);
  const films: Film[] = [];

  for (const info of layerInfos) {
    const media = new ImageMedia(info.canvas);
    const film = Film.fromMedia(media);
    film.visible = info.visible;

    // レイヤーの表示名（グループパス付き）をpromptに格納
    const displayName = info.groupPath
      ? `📁${info.groupPath}/${info.name}`
      : info.name;
    film.prompt = displayName;

    // PSDレイヤーの位置をFramePlanner座標に変換
    // FramePlannerではn_translationはページ中心からの相対座標（正規化済み）
    // ページ座標系: 原点(0,0)が左上、ページサイズが(width, height)
    // n_translationはShiftedTranslation経由で設定するのでpageSize依存
    //
    // レイヤーの中心座標（PSD座標系）
    const layerCenterX = info.left + info.canvas.width / 2;
    const layerCenterY = info.top + info.canvas.height / 2;
    // ページの中心からの差分
    const offsetX = layerCenterX - psd.width / 2;
    const offsetY = layerCenterY - psd.height / 2;
    // setShiftedTranslationで設定
    film.setShiftedTranslation(paperSize, [offsetX, offsetY]);

    films.push(film);
  }

  // PSD的にはレイヤーリストは上が手前（上位インデックス）
  // FilmStack.filmsは配列の後ろが手前なので、reverseせずにそのまま
  // ただし@webtoon/psdのtraverse順序は上→下なので、reverseが必要
  films.reverse();
  frameTree.children[0].filmStack.films = films;

  const page = newPage(frameTree, []);
  page.paperSize = paperSize;
  return page;
}
