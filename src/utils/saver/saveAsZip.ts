import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { Page } from '../../lib/book/book';
import { renderPage, renderPageToPsd } from './renderPage';
import { upscaleCanvasWithoutDialog } from '../upscaleImage';
import { canvasToBlob } from '../../lib/layeredCanvas/tools/imageUtil';

function sanitizeFileName(name: string): string {
  // Windows: \ / : * ? " < > |
  // macOS/Linux: / \0
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

export async function makeZip(pages: Page[], render: (page: Page) => Promise<Blob>, ext: string, folderName: string): Promise<Blob> {
  const zip = new JSZip();
  const effectiveFolderName = sanitizeFileName(folderName) || 'book';
  const folder = zip.folder(effectiveFolderName)!;

  for (let i = 0; i < pages.length; i++) {
    const pic = await render(pages[i]);
    folder.file(`page-${i+1}.${ext}`, pic);
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