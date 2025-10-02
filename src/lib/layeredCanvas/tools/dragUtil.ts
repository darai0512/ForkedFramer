export interface AttachFileOptions {
  downloadUrl?: string | null;
  revokeAfterMs?: number;
  setUriList?: boolean;
}

export function attachFileToDataTransfer(
  dataTransfer: DataTransfer,
  file: File,
  options: AttachFileOptions = {}
): string {
  try {
    dataTransfer.items.add(file);
  } catch (error) {
    console.warn('Failed to add file to DataTransfer', error);
  }

  const type = file.type || 'application/octet-stream';
  const name = file.name || 'download';
  const url = options.downloadUrl ?? URL.createObjectURL(file);

  const payload = `${type}:${name}:${url}`;
  try {
    dataTransfer.setData('DownloadURL', payload);
  } catch (error) {
    console.warn('Failed to set DownloadURL drag data', error);
  }

  if (options.setUriList) {
    try {
      dataTransfer.setData('text/uri-list', url);
    } catch (error) {
      console.warn('Failed to set text/uri-list drag data', error);
    }
  }

  if (!options.downloadUrl) {
    const delay = options.revokeAfterMs ?? 30000;
    if (delay >= 0) {
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, delay);
    }
  }

  return url;
}
