import { createCanvasFromBlob, createVideoFromBlob, createVideoFromDataUrl, getFirstFrameOfVideo } from "../tools/imageUtil";

export type DataTransferResult = {
  mediaResources: (HTMLCanvasElement | HTMLVideoElement | string)[];
  psdFiles: File[];
};

function isPsdFile(file: File): boolean {
  if (file.name.toLowerCase().endsWith('.psd')) return true;
  if (file.type === 'image/vnd.adobe.photoshop') return true;
  if (file.type === 'application/x-photoshop') return true;
  return false;
}

export async function handleDataTransferWithPsd(dataTransfer: DataTransfer): Promise<DataTransferResult> {
  // video/mp4があればそれを優先
  const url = dataTransfer.getData('video/mp4');
  if (url !== "") {
    console.log("video url", url);
    const video = await createVideoFromDataUrl(url);
    return { mediaResources: [video], psdFiles: [] };
  }

  let files = [...dataTransfer.files];
  if (files.length === 0 && dataTransfer.items) {
    files = [...dataTransfer.items]
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);
  }

  const psdFiles: File[] = [];
  const normalFiles: File[] = [];
  for (const file of files) {
    if (isPsdFile(file)) {
      psdFiles.push(file);
    } else {
      normalFiles.push(file);
    }
  }

  const result: (HTMLCanvasElement | HTMLVideoElement | string)[] = [];
  for (let i = 0; i < normalFiles.length; i++) {
    const file = normalFiles[i];
    console.log("file", i, file.type);
    if (file.type.startsWith('image/svg')) { continue; } // 念の為
    if (file.type.startsWith('image/')) {
      console.log("image file", file);
      const canvas = await createCanvasFromBlob(file);
      result.push(canvas);
    }
    if (file.type.startsWith('video/')) {
      console.log("video file", file);
      const video = await createVideoFromBlob(file);
      result.push(video);
    }
    if (file.type.startsWith('text/')) {
      console.log("text file", file);
      const text = await file.text();
      result.push(text);
    }
  }

  if (result.length === 0 && psdFiles.length === 0) {
    const uriListRaw = dataTransfer.getData('text/uri-list');
    if (uriListRaw) {
      const uri = uriListRaw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith('#'));
      if (uri) {
        try {
          const response = await fetch(uri);
          const blob = await response.blob();
          if (blob.type.startsWith('video/')) {
            const video = await createVideoFromBlob(blob);
            result.push(video);
          } else {
            const canvas = await createCanvasFromBlob(blob);
            result.push(canvas);
          }
        } catch (error) {
          console.warn('Failed to load media from uri-list', error);
        }
      }
    }
  }

  return { mediaResources: result, psdFiles };
}

// 後方互換のためにhandleDataTransferもそのまま残す
export async function handleDataTransfer(dataTransfer: DataTransfer): Promise<(HTMLCanvasElement | HTMLVideoElement | string)[]> {
  const { mediaResources } = await handleDataTransferWithPsd(dataTransfer);
  return mediaResources;
}


export function excludeTextFiles(mediaResources: (HTMLCanvasElement | HTMLVideoElement | string)[]): (HTMLCanvasElement | HTMLVideoElement)[] {
  const filteredResources = mediaResources.filter((resource) => {
    return !(typeof resource === 'string');
  });
  return filteredResources;
}

export function filterImageFiles(mediaResources: (HTMLCanvasElement | HTMLVideoElement | string)[]): HTMLCanvasElement[] {
  const filteredResources = mediaResources.filter((resource) => {
    return (resource instanceof HTMLCanvasElement);
  });
  return filteredResources as HTMLCanvasElement[];
}
