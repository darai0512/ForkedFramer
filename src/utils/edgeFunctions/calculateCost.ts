// このモジュールはFramePlanner側で定義してコピーしているので、
// FramePlannerSupabaseで変更してはだめ

import type { ImagingMode, ImageToVideoModel, ImageToVideoResolution, ImageToVideoRequest, Padding, TextToImageRequest } from "$protocolTypes/imagingTypes";

/**
 * 画像サイズからメガピクセル単位でのコストを計算する
 * @param size 画像サイズ
 * @param costPerMegapixel メガピクセルあたりのコスト
 * @returns 計算されたコスト
 */
function calculateCostFromMegapixels(size: { width: number; height: number }, costPerMegapixel: number): number {
    const pixels = size.width * size.height;
    return Math.ceil(pixels / (1024 * 1024) * costPerMegapixel);
}

type CostSpec = { kind: 'fixed', value: number } | { kind: 'perMP', value: number };

// モード単位で単一仕様に一般化（ref画像数には非依存）
const COST_SPEC: Record<ImagingMode, CostSpec> = {
    // FLUX 系（面積比例）
    "schnell": { kind: 'perMP', value: 1 },
    "pro": { kind: 'perMP', value: 8 },
    "chibi": { kind: 'perMP', value: 7 },
    "comibg": { kind: 'perMP', value: 7 },
    "manga": { kind: 'perMP', value: 7 },
    // OpenAI 系（面積比例）
    "gpt-image-1/low": { kind: 'perMP', value: 2 },
    "gpt-image-1/medium": { kind: 'perMP', value: 7 },
    "gpt-image-1/high": { kind: 'perMP', value: 30 },
    // Qwen
    "qwen-image": { kind: 'perMP', value: 4 },
    // Kontext/Nano 系（固定 or 面積比例）
    "kontext/pro": { kind: 'fixed', value: 6 },
    "kontext/max": { kind: 'fixed', value: 13 },
    "kontext/inscene": { kind: 'perMP', value: 7 },
    "nano-banana": { kind: 'fixed', value: 6 },
    "seedream/v4": { kind: 'fixed', value: 5 },
};

// 互換のための内部ヘルパ（アスペクト比からピクセル数を推定）
function pixelsFrom(resolution: ImageToVideoResolution, aspectRatio: ImageToVideoRequest['aspectRatio']): number {
    const height = parseInt(resolution.replace('p', '')) || 720;
    const ratio = (() => {
        switch (aspectRatio) {
            case '1:1': return 1;
            case '16:9': return 16 / 9;
            case '9:16': return 9 / 16;
        }
    })();
    const width = Math.round(height * ratio);
    return width * height;
}

/**
 * 画像→動画の概算コスト（feathral）
 * VideoGenerator.svelte のモデル仕様に合わせる
 */
export function calculateI2VCost(
    model: ImageToVideoModel,
    duration: number,
    resolution: ImageToVideoResolution,
    aspectRatio: ImageToVideoRequest['aspectRatio']
): number {
    switch (model) {
        case 'FramePack':
            return duration * 5;
        case 'kling':
            return duration * 10;
        case 'seedance/lite': {
            const px = pixelsFrom(resolution, aspectRatio);
            return calculateSeedanceCost(1.8, duration, px);
        }
        case 'seedance/pro': {
            const px = pixelsFrom(resolution, aspectRatio);
            return calculateSeedanceCost(2.5, duration, px);
        }
        case 'wan/v2.2-a14b/turbo': {
            switch (resolution) {
                case '480p': return 8;
                case '720p': return 16;
                default: return 0; // 未対応
            }
        }
        case 'wan-25-preview/image-to-video': {
            switch (resolution) {
                case '480p': return 50;
                case '720p': return 80;
                case '1080p': return 120;
                default: return 0; // 未対応
            }
        }
        case 'decart/lucy-14b':
            return duration * 11;
        case 'minimax/hailuo-2.3-fast/standard/image-to-video': {
            switch (duration) {
                case 6: return 30;
                case 10: return 50;
                default: return 0; // 未対応
            }
        }
        case 'failure':
        default:
            return 0;
    }
}

// 旧つづり互換（未使用想定）
export function culculateI2vCost(model: ImageToVideoModel, duration: string): number {
    return calculateI2VCost(model, parseInt(duration, 10), '720p', '16:9');
}

export function calculateOutPaintingCost(size: { width: number; height: number }, padding: Padding) {
    if (padding.left === 0 && padding.right === 0 && padding.top === 0 && padding.bottom === 0) {
        return 0;
    }

    const expandedSize = {
        width: size.width + padding.left + padding.right,
        height: size.height + padding.top + padding.bottom
    };

    // outpainting costの算出
    // $0.05 per mega pixel (1feathral ≒ $0.01)
    return calculateCostFromMegapixels(expandedSize, 8);
}

export function calculateInPaintingCost(size: { width: number; height: number }) {
    // inpainting costの算出
    // $0.05 per mega pixel (1feathral ≒ $0.01)
    return calculateCostFromMegapixels(size, 8);
}

function calcFromSpec(spec: CostSpec, size: { width: number; height: number }): number {
    return spec.kind === 'fixed' ? spec.value : calculateCostFromMegapixels(size, spec.value);
}

/**
 * 統合: refImage の数に応じて t2i か textedit/i2i のコストを計算
 * refImageCount === 0 -> t2i, 1 以上 -> textedit/i2i
 */
export function calculateImagingCost(mode: ImagingMode, imageSize: { width: number; height: number }): number {
    return calcFromSpec(COST_SPEC[mode], imageSize);
}

// リクエストオブジェクトから直接コストを計算
export function calculateRequestCost(req: TextToImageRequest): number {
    return calculateImagingCost(req.mode, req.imageSize);
}

export function calculateSeedanceCost(baseCost: number, duration: number, pixels: number): number {
    console.log(`Calculating Seedance cost: baseCost=${baseCost}, duration=${duration}, pixels=${pixels}`);
    const tokens = pixels * 24 /*fps*/ * duration / 1024;
    // costs $baseCost per 1 million tokens
    const doller = tokens / 1_000_000 * baseCost;
    console.log(`Calculated cost: ${doller}, tokens: ${tokens}`);
    return Math.ceil(doller * 100 * 1.5); // 通常1.6倍にしているが、ピクセル数が微妙に少ないようなので1.5倍に調整
}
  
