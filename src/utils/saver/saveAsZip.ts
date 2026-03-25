import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { Page } from '../../lib/book/book';
import { renderPage, renderPageToPsd, renderPageToFrameCanvases } from './renderPage';
import { upscaleCanvasWithoutDialog } from '../upscaleImage';
import { canvasToBlob } from '../../lib/layeredCanvas/tools/imageUtil';
import { collectLeaves } from '../../lib/layeredCanvas/dataModels/frameTree';

function sanitizeFileName(name: string): string {
  // Windows: \ / : * ? " < > |
  // macOS/Linux: / \0
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

export async function makeZip(pages: Page[], render: (page: Page) => Promise<Blob>, ext: string, folderName: string): Promise<Blob> {
  const zip = new JSZip();
  const effectiveFolderName = sanitizeFileName(folderName) || 'book';
  const folder = zip.folder(effectiveFolderName)!;

  const digits = Math.max(2, String(pages.length).length);
  for (let i = 0; i < pages.length; i++) {
    const pic = await render(pages[i]);
    folder.file(`page-${String(i+1).padStart(digits, '0')}.${ext}`, pic);
  }

  const zipFile = await zip.generateAsync({type: 'blob'});
  return zipFile;
}

export async function saveAsPngZip(pages: Page[], upscales: boolean, zipName: string) {
  async function makeBlob(page: Page): Promise<Blob> {
    let canvas = await renderPage(page);
    if (upscales) {
      const newCanvas = await upscaleCanvasWithoutDialog(canvas);
      if (newCanvas) {
        canvas = newCanvas;
      }
    }
    return canvasToBlob(canvas, "image/png");
  }

  const effectiveName = sanitizeFileName(zipName) || 'book';
  const zipFile = await makeZip(pages, makeBlob, 'png', effectiveName);
  saveAs(zipFile, `${effectiveName}.zip`);
}

export async function saveAsPsdZip(pages: Page[], zipName: string) {
  const effectiveName = sanitizeFileName(zipName) || 'book';
  const zipFile = await makeZip(pages, renderPageToPsd, 'psd', effectiveName);
  saveAs(zipFile, `${effectiveName}.psd.zip`);
}

export type SaveAsFramePngZipOptions = {
  includeBubbles?: boolean;
};

export async function saveAsFramePngZip(page: Page, zipName: string, options: SaveAsFramePngZipOptions = {}) {
  const { includeBubbles = true } = options;
  const frameCanvases = renderPageToFrameCanvases(page, { includeBubbles });
  const zip = new JSZip();
  const effectiveFolderName = sanitizeFileName(zipName) || 'frames';
  const folder = zip.folder(effectiveFolderName)!;

  const digits = Math.max(2, String(frameCanvases.length).length);
  for (let i = 0; i < frameCanvases.length; i++) {
    const blob = await canvasToBlob(frameCanvases[i], "image/png");
    folder.file(`frame-${String(i+1).padStart(digits, '0')}.png`, blob);
  }

  const zipFile = await zip.generateAsync({type: 'blob'});
  const effectiveName = sanitizeFileName(zipName) || 'frames';
  const suffix = includeBubbles ? '_frames' : '_frames_no_bubbles';
  saveAs(zipFile, `${effectiveName}${suffix}.zip`);
}

export async function saveAsLoraDataZip(page: Page, zipName: string, pageNumber: number) {
  const zip = new JSZip();

  // ROOT_start.png: ページ全体をレンダリング
  const pageCanvas = await renderPage(page);
  const pageBlob = await canvasToBlob(pageCanvas, "image/png");
  zip.file('ROOT_start.png', pageBlob);

  // ROOT_end.png, ROOT_end2.png, ...: 各コマをレンダリング（フキダシなし）
  const frameCanvases = renderPageToFrameCanvases(page, { includeBubbles: false });
  for (let i = 0; i < frameCanvases.length; i++) {
    const blob = await canvasToBlob(frameCanvases[i], "image/png");
    const fileName = i === 0 ? 'ROOT_end.png' : `ROOT_end${i + 1}.png`;
    zip.file(fileName, blob);
  }

  const zipFile = await zip.generateAsync({type: 'blob'});
  const effectiveName = sanitizeFileName(zipName) || 'lora';
  saveAs(zipFile, `${effectiveName}-${pageNumber}.zip`);
}

export async function saveAsMaterialsZip(pages: Page[], zipName: string) {
  const zip = new JSZip();
  const effectiveFolderName = sanitizeFileName(zipName) || 'materials';
  const folder = zip.folder(effectiveFolderName)!;

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    const leaves = collectLeaves(page.frameTree);
    const p = String(pi + 1).padStart(3, '0');

    for (let fi = 0; fi < leaves.length; fi++) {
      const frame = leaves[fi];
      const f = String(fi + 1).padStart(3, '0');
      const films = frame.filmStack.films;

      for (let li = 0; li < films.length; li++) {
        const film = films[li];
        if (film.content.kind !== 'media') continue;
        const media = film.content.media;
        const l = String(li + 1).padStart(3, '0');
        const baseName = `p${p}_f${f}_l${l}`;

        const source = media.persistentSource;
        if (source instanceof HTMLCanvasElement) {
          const blob = await canvasToBlob(source, 'image/png');
          folder.file(`${baseName}.png`, blob);
        } else if (source instanceof HTMLVideoElement) {
          const blob = await fetch(source.src).then(res => res.blob());
          folder.file(`${baseName}.mp4`, blob);
        }
      }
    }
  }

  const zipFile = await zip.generateAsync({type: 'blob'});
  const effectiveName = sanitizeFileName(zipName) || 'materials';
  saveAs(zipFile, `${effectiveName}_materials.zip`);
}