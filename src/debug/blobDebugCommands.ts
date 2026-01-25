import { get as storeGet } from "svelte/store";
import { developmentFlag } from "../utils/developmentFlagStore";
import { mainBookFileSystem } from "../filemanager/fileManagerStore";

declare global {
  export interface Window {
    fpListBlobs?: () => Promise<{ id: string; bin: boolean; meta: boolean }[]>;
    fpCorruptBlob?: (id: string, mode?: string, opts?: { truncateTo?: number; sizeDelta?: number }) => Promise<void>;
  }
}

type BlobMeta = { type?: string; size?: number };
type BlobEntryStatus = { id: string; bin: boolean; meta: boolean };
type CorruptOptions = { truncateTo?: number; sizeDelta?: number };

export function registerBlobDebugCommands(): void {
  if (!storeGet(developmentFlag)) return;

  const getBlobDirHandle = async (): Promise<FileSystemDirectoryHandle> => {
    const fs = storeGet(mainBookFileSystem);
    const blobStore = (fs as any)?.blobStore as { dirHandle?: FileSystemDirectoryHandle } | undefined;
    if (!fs || !blobStore?.dirHandle) {
      throw new Error('FSA blobStore is not available');
    }
    return blobStore.dirHandle;
  };

  window.fpListBlobs = async (): Promise<BlobEntryStatus[]> => {
    const dirHandle = await getBlobDirHandle();
    const map = new Map<string, BlobEntryStatus>();
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue;
      const match = entry.name.match(/^(.*)\.(bin|meta)$/);
      if (!match) continue;
      const id = match[1];
      const kind = match[2] as 'bin' | 'meta';
      const current = map.get(id) ?? { id, bin: false, meta: false };
      current[kind] = true;
      map.set(id, current);
    }
    const list = Array.from(map.values());
    console.table(list);
    return list;
  };

  window.fpCorruptBlob = async (id: string, mode = 'delete-bin', opts: CorruptOptions = {}) => {
    const dirHandle = await getBlobDirHandle();
    const binName = `${id}.bin`;
    const metaName = `${id}.meta`;

    if (mode === 'delete-bin') {
      await dirHandle.removeEntry(binName);
      console.log(`deleted: ${binName}`);
      return;
    }
    if (mode === 'delete-meta') {
      await dirHandle.removeEntry(metaName);
      console.log(`deleted: ${metaName}`);
      return;
    }
    if (mode === 'bad-meta') {
      const metaHandle = await dirHandle.getFileHandle(metaName, { create: true });
      const metaWritable = await metaHandle.createWritable({ keepExistingData: false });
      await metaWritable.write('{ broken json');
      await metaWritable.close();
      console.log(`corrupted: ${metaName} (invalid json)`);
      return;
    }
    if (mode === 'mismatch-size') {
      const metaHandle = await dirHandle.getFileHandle(metaName, { create: true });
      let meta: BlobMeta = {};
      try {
        const metaText = await (await metaHandle.getFile()).text();
        meta = JSON.parse(metaText) ?? {};
      } catch {}
      const binHandle = await dirHandle.getFileHandle(binName);
      const binFile = await binHandle.getFile();
      const sizeDelta = opts.sizeDelta ?? 1;
      const metaWritable = await metaHandle.createWritable({ keepExistingData: false });
      await metaWritable.write(JSON.stringify({ type: meta.type ?? 'application/octet-stream', size: binFile.size + sizeDelta }));
      await metaWritable.close();
      console.log(`corrupted: ${metaName} (size mismatch)`);
      return;
    }
    if (mode === 'truncate') {
      const binHandle = await dirHandle.getFileHandle(binName);
      const binFile = await binHandle.getFile();
      const targetSize = Math.max(0, Math.min(opts.truncateTo ?? Math.floor(binFile.size / 2), binFile.size));
      const buf = await binFile.arrayBuffer();
      const truncated = buf.slice(0, targetSize);
      const writable = await binHandle.createWritable({ keepExistingData: false });
      await writable.write(truncated);
      await writable.close();
      console.log(`corrupted: ${binName} (truncated to ${targetSize})`);
      return;
    }

    throw new Error(`unknown mode: ${mode}`);
  };
}
