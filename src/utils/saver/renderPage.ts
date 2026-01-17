import type { Page } from '../../lib/book/book';
import { LayeredCanvas, Viewport } from '../../lib/layeredCanvas/system/layeredCanvas'
import { PaperRendererLayer, BubbleRenderMode } from '../../lib/layeredCanvas/layers/paperRendererLayer';
import { writePsd } from 'ag-psd';
import { calculatePhysicalLayout, type Layout } from '../../lib/layeredCanvas/dataModels/frameTree';
import { isPointInQuadrilateral } from '../../lib/layeredCanvas/tools/geometry/trapezoid';
import { makePlainCanvas } from '../../lib/layeredCanvas/tools/imageUtil';
import type { Bubble } from '../../lib/layeredCanvas/dataModels/bubble';

export async function renderThumbnailToWebpBlob(page: Page, [w,h]: [number, number]): Promise<Blob> {
  // keep aspect ratio
  const canvas = await renderPage(page);
  const aspect = canvas.width / canvas.height;
  const width = Math.min(w, h * aspect);
  const height = Math.min(h, w / aspect);

  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = width;
  thumbnailCanvas.height = height;

  const ctx = thumbnailCanvas.getContext('2d');
  if (!ctx) throw new Error("Failed to get context");
  ctx.drawImage(canvas, 0, 0, width, height);
  const png: Blob = await new Promise(
    (r) => {
      thumbnailCanvas.toBlob(
        blob => r(blob ?? new Blob()), 'image/webp', 1.0)
    });
  return png;
}

export async function renderPage(page: Page): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = page.paperSize[0]
  canvas.height = page.paperSize[1]

  const viewport = new Viewport(canvas, () => {});

  const layeredCanvas = new LayeredCanvas(viewport, true);
  layeredCanvas.rootPaper.size = page.paperSize;

  // renderer
  const paperRendererLayer = new PaperRendererLayer(false, { bubbleRenderMode: BubbleRenderMode.All });
  paperRendererLayer.setFrameTree(page.frameTree);
  paperRendererLayer.setBubbles(page.bubbles);
  paperRendererLayer.setFontSizeCoefficientHolder(page);
  layeredCanvas.rootPaper.addLayer(paperRendererLayer);

  layeredCanvas.render();
  return canvas;
}

export async function renderPageToPsd(page: Page) {
  const canvas = document.createElement("canvas");
  canvas.width = page.paperSize[0]
  canvas.height = page.paperSize[1]

  const viewport = new Viewport(canvas, () => {});

  const layeredCanvas = new LayeredCanvas(viewport, true);
  layeredCanvas.rootPaper.size = page.paperSize;

  const paperRendererLayer = new PaperRendererLayer(false, { bubbleRenderMode: BubbleRenderMode.All });
  layeredCanvas.rootPaper.addLayer(paperRendererLayer);

  paperRendererLayer.setFrameTree(page.frameTree);
  paperRendererLayer.setBubbles(page.bubbles);
  paperRendererLayer.setFontSizeCoefficientHolder(page);

  const {frames, bubbles} = paperRendererLayer.renderApart();

  const psd = {
    width: page.paperSize[0],
    height: page.paperSize[1],
    children: [
      {
        name: 'コマ',
        children: [] as any[]
      },
      {
        name: 'フキダシ',
        children: []
      }
    ]
  };

  frames.forEach(({content,border}, i) => {
    psd.children[0].children.push({
      name: `コマ内容 #${i+1}`,
      canvas: content
    });
    psd.children[0].children.push({
      name: `コマ枠線 #${i+1}`,
      canvas: border
    });
  });
  bubbles.forEach((canvas, i) => {
    psd.children[1].children.push({
      name: `フキダシ #${i+1}`,
      canvas
    });
  });

  const buffer = writePsd(psd);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  return blob;
}

export type RenderFrameCanvasesOptions = {
  includeBubbles?: boolean;
};

export function renderPageToFrameCanvases(page: Page, options: RenderFrameCanvasesOptions = {}): HTMLCanvasElement[] {
  const { includeBubbles = true } = options;

  const canvas = document.createElement("canvas");
  canvas.width = page.paperSize[0];
  canvas.height = page.paperSize[1];

  const viewport = new Viewport(canvas, () => {});

  const layeredCanvas = new LayeredCanvas(viewport, true);
  layeredCanvas.rootPaper.size = page.paperSize;

  const paperRendererLayer = new PaperRendererLayer(false, { bubbleRenderMode: BubbleRenderMode.All });
  layeredCanvas.rootPaper.addLayer(paperRendererLayer);

  paperRendererLayer.setFrameTree(page.frameTree);
  paperRendererLayer.setBubbles(page.bubbles);
  paperRendererLayer.setFontSizeCoefficientHolder(page);

  const paperSize = page.paperSize;
  const layout = calculatePhysicalLayout(page.frameTree, paperSize, [0, 0]);
  const renderData = paperRendererLayer.setUpRenderData(layout);
  const { foregrounds, embeddedBubbles, floatingBubbles } = renderData;

  function makeCanvas() {
    const canvas = makePlainCanvas(paperSize[0], paperSize[1]);
    const ctx = canvas.getContext('2d')!;
    return { canvas, ctx };
  }

  function isBubbleInLayout(bubble: Bubble, layout: Layout): boolean {
    const center = bubble.getPhysicalCenter(paperSize);
    return isPointInQuadrilateral(center, layout.corners);
  }

  // 親子関係を辞書化
  const childrenByParent = new Map<string, Bubble[]>();
  if (includeBubbles) {
    for (const bubble of floatingBubbles) {
      if (bubble.parent != null) {
        if (!childrenByParent.has(bubble.parent)) {
          childrenByParent.set(bubble.parent, []);
        }
        childrenByParent.get(bubble.parent)!.push(bubble);
      }
    }
  }

  // 親フキダシのみ（parent == null）を判定対象とする
  const parentBubbles = includeBubbles ? floatingBubbles.filter(b => b.parent == null) : [];

  // フキダシを含めない場合は空のMapを使用
  const effectiveEmbeddedBubbles = includeBubbles ? embeddedBubbles : new Map();

  const frameCanvases: HTMLCanvasElement[] = [];

  foregrounds.sort((a, b) => a.layout.element.z - b.layout.element.z);
  for (const { layout, inheritanceContext } of foregrounds) {
    if (layout.element.visibility < 1) { continue; }
    const { canvas, ctx } = makeCanvas();

    // 背景、コンテンツ、枠線を一緒にレンダリング
    paperRendererLayer.renderFrameBackground(ctx, layout, inheritanceContext);
    paperRendererLayer.renderFrameContent(ctx, layout, inheritanceContext, effectiveEmbeddedBubbles);
    paperRendererLayer.renderFrameBorder(ctx, layout, inheritanceContext);

    if (includeBubbles) {
      // floatingBubblesから中心がこのコマの中にある親フキダシを取得
      const parentsInFrame = parentBubbles.filter(bubble => isBubbleInLayout(bubble, layout));

      // 親フキダシと子フキダシを収集
      const bubblesInFrame: Bubble[] = [];
      for (const parent of parentsInFrame) {
        bubblesInFrame.push(parent);
        const children = childrenByParent.get(parent.uuid);
        if (children) {
          bubblesInFrame.push(...children);
        }
      }

      // フキダシをレンダリング
      if (bubblesInFrame.length > 0) {
        paperRendererLayer.renderBubblesWithPreference(ctx, bubblesInFrame);
      }
    }

    frameCanvases.push(canvas);
  }

  return frameCanvases;
}

