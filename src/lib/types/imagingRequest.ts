// 共有型定義（下位モジュール用）
// imagingTypes.d.ts から分離した純粋な型定義

export type ImagingBackground = "auto" | "opaque" | "transparent";

export type ImagingAction =
  | "texttoimage"
  | "imagetovideo"
  | "inpaint"
  | "outpaint"
  | "vision"
  | "upscale"
  | "removebg"
  | "eraser"
  | "layerize"
  | "textmask"
  | "texteraser";

export type ImagingModel =
  | "schnell"
  | "pro"
  | "chibi"
  | "manga"
  | "comibg"
  | "gpt-image-1/low"
  | "gpt-image-1/medium"
  | "gpt-image-1/high"
  | "gpt-image-1.5/low"
  | "gpt-image-1.5/medium"
  | "gpt-image-1.5/high"
  | "qwen-image"
  | "kontext/pro"
  | "kontext/max"
  | "kontext/inscene"
  | "nano-banana"
  | "nano-banana-pro"
  | "chrono-edit"
  | "seedream/v4"
  | "seedream/v4.5"
  | "seedream/v5-lite"
  | "qwen-image-edit/multiple-angles"
  | "flux-2-dev"
  | "flux-2-pro"
  | "flux-2-flex"
  | "z-image"
  | "kling-image/o1";

export type ImagingProvider = "flux" | "gpt-image-1" | "gpt-image-1.5" | "qwen" | "seedream" | "decart";

export type Angle = {
  horizontal_angle: number; // 0-360°
  vertical_angle: number;   // -30～90°
  zoom: number;             // 0-10, default: 5
};

export type TextToImageOption =
  | { kind: "none" }
  | { kind: "angle"; angle: Angle };

export type TextToImageRequest = {
  provider: ImagingProvider;
  prompt: string;
  imageSize: {
    width: number;
    height: number;
  };
  numImages: number;
  model: ImagingModel;
  background: ImagingBackground;
  option: TextToImageOption;
  imageDataUrls: string[];
};

export type Padding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type OutPaintRequest = {
  dataUrl: string;
  size: {
    width: number;
    height: number;
  };
  padding: Padding;
};

export type RemoveBgRequest = {
  dataUrl: string;
};

export type ImageToVideoModel =
  | "kling"
  | "FramePack"
  | "seedance/pro"
  | "seedance/lite"
  | "wan/v2.2-a14b/turbo"
  | "wan-25-preview/image-to-video"
  | "decart/lucy-14b"
  | "minimax/hailuo-2.3-fast/standard/image-to-video"
  | "failure";

export type ImageToVideoResolution = "480p" | "720p" | "1080p";

export type ImageToVideoRequest = {
  prompt: string;
  imageUrl: string;
  duration: "1" | "2" | "3" | "4" | "5" | "6" | "10";
  aspectRatio: "1:1" | "16:9" | "9:16";
  resolution: ImageToVideoResolution;
  model: ImageToVideoModel;
};

export type UpscaleRequest = {
  dataUrl: string;
  scale: "2x" | "4x";
  provider: "standard";
};

export type EraserRequest = {
  maskDataUrl: string;
  imageDataUrl: string;
};

export type InPaintRequest = {
  maskDataUrl: string;
  imageDataUrl: string;
  prompt: string;
};

export type TextEraserRequest = {
  imageDataUrl: string;
};
