import type { Page } from '../../lib/book/book';
import { saveAs } from 'file-saver';

export function exportDialogues(pages: Page[], title: string) {
  const lines: string[] = [];

  for (let pi = 0; pi < pages.length; pi++) {
    lines.push(`## Page ${pi + 1}`);
    lines.push('');

    for (const bubble of pages[pi].bubbles) {
      if (!bubble.text || bubble.text === 'empty') continue;
      lines.push(bubble.text);
      lines.push('');
    }
  }

  const md = lines.join('\n');
  const blob = new Blob([md], { type: 'text/markdown' });
  const effectiveName = title.replace(/[\\/:*?"<>|]/g, '_') || 'dialogues';
  saveAs(blob, `${effectiveName}_dialogues.md`);
}
