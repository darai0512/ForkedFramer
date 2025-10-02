import { createCanvasFromBlob, createVideoFromBlob, createVideoFromDataUrl, getFirstFrameOfVideo } from "../tools/imageUtil";

export async function handleDataTransfer(dataTransfer: DataTransfer): Promise<(HTMLCanvasElement | HTMLVideoElement | string)[]> {
  const result: (HTMLCanvasElement | HTMLVideoElement | string)[] = [];

  // video/mp4があればそれを優先（従来挙動を維持）
  const videoUrl = dataTransfer.getData('video/mp4');
  if (videoUrl !== "") {
    console.log("video url", videoUrl);
    const video = await createVideoFromDataUrl(videoUrl);
    return [video];
  }

  const collectFromUrls = async (urls: string[]) => {
    for (const url of urls) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        if (blob.type.startsWith('image/')) {
          const canvas = await createCanvasFromBlob(blob);
          result.push(canvas);
        } else if (blob.type.startsWith('video/')) {
          const video = await createVideoFromBlob(blob);
          result.push(video);
        }
      } catch (error) {
        console.warn('Failed to resolve drag URL', url, error);
      }
    }
  };

  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    const urls = uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    await collectFromUrls(urls);
    if (result.length > 0) {
      return result;
    }
  }

  const plainText = dataTransfer.getData('text/plain');
  if (plainText) {
    const trimmed = plainText.trim();
    if (/^(blob:|https?:|data:)/.test(trimmed)) {
      await collectFromUrls([trimmed]);
      if (result.length > 0) {
        return result;
      }
    }
  }

  const files = [...dataTransfer.files]; // なぜかこうしないとawaitの間に変化するらしく、うまく列挙できない
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
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

  return result;
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
