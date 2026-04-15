import seedrandom from "seedrandom";
import type { Vector } from "../geometry/geometry";
import rgba from 'color-rgba';

/**
 * 特殊SFXの描画
 * ガスブラシと同じ色をベースに、グリッチフォント＋プロシージャル効果で
 * オノマトペなどを描画する機能
 */

// ガスブラシと同じRGB
const DEFAULT_BASE_COLOR = '#E3C27F';
const GLITCH_FONT_FAMILY = '瀞ノグリッチ黒体H4';
const FALLBACK_FONT_FAMILY = '源暎きわみゴ';

interface GlitchSfxOptions {
  randomSeed: number;
  baseColor: string;
  gradientStrength: number;
  blurAmount: number;
  blurIterations: number;
  scratchDensity: number;    // フォントが割れていない場合のかすれ線密度
  sizeJitter: number;
  rotationJitter: number;
  motionBlurAngle: number;
  motionBlurLength: number;
  opacity: number;
  _fontFamily?: string;
  _fontWeight?: string;
  _outlineWidth?: number;
  _outlineColor?: string;
}

function getFontFamily(customFamily?: string, customWeight?: string): string {
  if (customFamily) {
    if (document.fonts.check(`${customWeight ?? '400'} 20px '${customFamily}'`)) {
      return customFamily;
    }
  }
  // グリッチフォントが利用可能かチェック
  if (document.fonts.check(`20px '${GLITCH_FONT_FAMILY}'`)) {
    return GLITCH_FONT_FAMILY;
  }
  return FALLBACK_FONT_FAMILY;
}

/**
 * glitch-sfx shape の fill 描画
 * テキスト+エフェクトを一括で描画する（通常の drawBubbleText はスキップ）
 */
export function drawGlitchSfxBubble(
  context: CanvasRenderingContext2D,
  method: string,
  seed: string,
  size: Vector,
  opts: GlitchSfxOptions,
  text: string,
  direction: string,
  fontSize: number,
) {
  if (method !== "fill") return; // stroke/clipは何もしない
  if (!text || text.trim() === '') return;

  const [w, h] = size;
  const rng = seedrandom(String(opts.randomSeed ?? seed));

  const baseColor = opts.baseColor || DEFAULT_BASE_COLOR;
  const gradientStrength = opts.gradientStrength ?? 0.6;
  const blurAmount = opts.blurAmount ?? 8;
  const blurIterations = opts.blurIterations ?? 3;
  const sizeJitter = opts.sizeJitter ?? 0.3;
  const rotationJitter = opts.rotationJitter ?? 15;
  const motionBlurAngle = (opts.motionBlurAngle ?? 0) * Math.PI / 180;
  const motionBlurLength = opts.motionBlurLength ?? 0;
  const scratchDensity = opts.scratchDensity ?? 0;
  const opacity = opts.opacity ?? 0.85;

  const fontFamily = getFontFamily(opts._fontFamily, opts._fontWeight);
  const fontWeight = opts._fontWeight ?? '400';
  const outlineWidth = opts._outlineWidth ?? 0;
  const outlineColor = opts._outlineColor ?? '#000000';

  // テキストを文字配列に分解（改行も考慮）
  const lines = text.split('\n');
  const chars: string[] = [];
  for (const line of lines) {
    for (const ch of line) {
      chars.push(ch);
    }
    chars.push('\n');
  }
  // 末尾の改行除去
  if (chars[chars.length - 1] === '\n') chars.pop();

  context.save();

  // 描画位置の基準
  const isVertical = direction === 'v';

  // 文字ごとの描画
  const lineChars: string[][] = [[]];
  for (const ch of chars) {
    if (ch === '\n') {
      lineChars.push([]);
    } else {
      lineChars[lineChars.length - 1].push(ch);
    }
  }

  // 最大行長を求める
  const maxLineLen = Math.max(...lineChars.map(l => l.length));
  if (maxLineLen === 0) {
    context.restore();
    return;
  }

  const numLines = lineChars.length;

  // 文字サイズの計算
  let charSize: number;
  if (isVertical) {
    // 縦書き: 列方向に文字を並べる
    const maxH = h * 0.9 / maxLineLen;
    const maxW = w * 0.9 / numLines;
    charSize = Math.min(maxH, maxW, fontSize);
  } else {
    // 横書き
    const maxW = w * 0.9 / maxLineLen;
    const maxH = h * 0.9 / numLines;
    charSize = Math.min(maxW, maxH, fontSize);
  }

  charSize = Math.max(charSize, 8); // 最小サイズ

  for (let lineIdx = 0; lineIdx < lineChars.length; lineIdx++) {
    const lineC = lineChars[lineIdx];

    for (let charIdx = 0; charIdx < lineC.length; charIdx++) {
      const ch = lineC[charIdx];
      if (ch === ' ' || ch === '　') continue;

      // 文字ごとのジッター
      const sizeScale = 1.0 + (rng() - 0.5) * 2 * sizeJitter;
      const charFontSize = charSize * sizeScale;
      const rotation = (rng() - 0.5) * 2 * rotationJitter * Math.PI / 180;

      // 位置計算
      let cx: number, cy: number;
      if (isVertical) {
        // 縦書き: 右から左に列、上から下に文字
        const colCount = numLines;
        cx = (w * 0.5) - (lineIdx + 0.5) * (w / colCount);
        cy = (-h * 0.5) + (charIdx + 0.5) * (h / Math.max(lineC.length, 1)) + (rng() - 0.5) * charFontSize * 0.15;
      } else {
        // 横書き
        cx = (-w * 0.5) + (charIdx + 0.5) * (w / Math.max(lineC.length, 1)) + (rng() - 0.5) * charFontSize * 0.15;
        cy = (-h * 0.5) + (lineIdx + 0.5) * (h / numLines);
      }

      // 文字ごとのオフスクリーンCanvas描画
      drawSingleChar(
        context, ch, cx, cy, charFontSize, fontFamily, fontWeight, outlineWidth, outlineColor, rotation,
        baseColor, gradientStrength, blurAmount, blurIterations,
        motionBlurAngle, motionBlurLength, scratchDensity, opacity, rng
      );
    }
  }

  context.restore();
}

function drawSingleChar(
  ctx: CanvasRenderingContext2D,
  ch: string,
  cx: number,
  cy: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  outlineWidth: number,
  outlineColor: string,
  rotation: number,
  baseColor: string,
  gradientStrength: number,
  blurAmount: number,
  blurIterations: number,
  motionBlurAngle: number,
  motionBlurLength: number,
  scratchDensity: number,
  opacity: number,
  rng: () => number,
) {
  // オフスクリーンCanvasで文字を描画してエフェクトを適用
  const padding = Math.ceil(fontSize * 0.5 + blurAmount * 2 + motionBlurLength * fontSize + 8);
  const canvasSize = Math.ceil(fontSize * 2 + padding * 2);

  const offscreen = document.createElement('canvas');
  offscreen.width = canvasSize;
  offscreen.height = canvasSize;
  const octx = offscreen.getContext('2d')!;

  const ccx = canvasSize / 2;
  const ccy = canvasSize / 2;

  const fontStr = `${fontWeight} ${fontSize}px '${fontFamily}'`;
  octx.font = fontStr;
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';

  // グラデーション方向（文字ごとにランダム）
  const gradAngle = rng() * Math.PI * 2;
  const gr = fontSize * 0.6;
  const gradient = octx.createLinearGradient(
    ccx - Math.cos(gradAngle) * gr,
    ccy - Math.sin(gradAngle) * gr,
    ccx + Math.cos(gradAngle) * gr,
    ccy + Math.sin(gradAngle) * gr,
  );

  const baseRgba = rgba(baseColor);
  const whiteStop = `rgba(255, 255, 255, ${opacity})`;
  const baseStop = baseRgba
    ? `rgba(${baseRgba[0]}, ${baseRgba[1]}, ${baseRgba[2]}, ${opacity})`
    : `rgba(212, 184, 122, ${opacity})`;

  gradient.addColorStop(0, baseStop);
  gradient.addColorStop(gradientStrength, baseStop);
  gradient.addColorStop(1, whiteStop);

  // --- ブレ描画（複数回重ね） ---
  for (let i = 0; i < blurIterations; i++) {
    const ox = (rng() - 0.5) * blurAmount;
    const oy = (rng() - 0.5) * blurAmount;

    octx.save();
    octx.fillStyle = gradient;
    octx.shadowBlur = blurAmount * (0.3 + rng() * 0.7);
    octx.shadowColor = baseColor;
    octx.shadowOffsetX = ox * 0.3;
    octx.shadowOffsetY = oy * 0.3;
    octx.globalAlpha = 1.0 / blurIterations + 0.3;
    octx.fillText(ch, ccx + ox, ccy + oy);
    octx.restore();
  }

  // --- メイン文字描画 ---
  octx.save();
  octx.fillStyle = gradient;
  octx.shadowBlur = 0;
  octx.globalAlpha = 1.0;
  octx.fillText(ch, ccx, ccy);
  octx.restore();

  // --- アウトライン（フチ）描画 ---
  if (outlineWidth > 0) {
    octx.save();
    octx.globalCompositeOperation = 'destination-over';
    octx.strokeStyle = outlineColor;
    octx.lineWidth = outlineWidth;
    octx.lineJoin = 'round';
    octx.strokeText(ch, ccx, ccy);
    octx.restore();
  }

  // --- かすれ線（フォントにグリッチがない場合のフォールバック） ---
  if (scratchDensity > 0) {
    const scratchCount = Math.floor(scratchDensity * fontSize * 0.4);
    octx.globalCompositeOperation = 'destination-out';
    octx.strokeStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < scratchCount; i++) {
      octx.lineWidth = 0.5 + rng() * 1.5;
      const y = ccy - fontSize * 0.5 + rng() * fontSize;
      const angle = (rng() - 0.5) * 0.6;
      octx.beginPath();
      octx.moveTo(ccx - fontSize * 0.6, y);
      octx.lineTo(ccx + fontSize * 0.6, y + Math.tan(angle) * fontSize);
      octx.stroke();
    }
    octx.globalCompositeOperation = 'source-over';
  }

  // --- モーションブラー ---
  if (motionBlurLength > 0) {
    const mbLen = motionBlurLength * fontSize;
    const mbDx = Math.cos(motionBlurAngle) * mbLen;
    const mbDy = Math.sin(motionBlurAngle) * mbLen;
    const steps = Math.max(3, Math.ceil(mbLen / 2));

    // 新しいオフスクリーンに合成
    const mbCanvas = document.createElement('canvas');
    mbCanvas.width = canvasSize;
    mbCanvas.height = canvasSize;
    const mbCtx = mbCanvas.getContext('2d')!;

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      mbCtx.globalAlpha = (1 - t) * 0.4 / steps;
      mbCtx.drawImage(offscreen, mbDx * t, mbDy * t);
    }
    // メイン
    mbCtx.globalAlpha = 1.0;
    mbCtx.drawImage(offscreen, 0, 0);

    // 描き先キャンバスに転送
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.drawImage(mbCanvas, -canvasSize / 2, -canvasSize / 2);
    ctx.restore();
  } else {
    // モーションブラーなし→直接転送
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.drawImage(offscreen, -canvasSize / 2, -canvasSize / 2);
    ctx.restore();
  }
}
