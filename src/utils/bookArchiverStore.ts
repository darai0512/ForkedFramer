import { type Writable, writable } from "svelte/store";

export type BookArchiveOperation =
  'download' |
  'download-after-upscale' |
  'copy' |
  'copy-after-upscale' |
  'export-psd' |
  'download-frames' |
  'download-frames-no-bubbles' |
  'download-lora-data' |
  'aipictors' |
  'envelope' |
  'export-prompts' |
  'publish' |
  'download-publication-files' |
  'download-materials' |
  'share-book';

export const bookArchiver: Writable<BookArchiveOperation[]> = writable([]);
