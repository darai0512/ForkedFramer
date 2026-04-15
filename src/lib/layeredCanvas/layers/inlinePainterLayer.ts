import { LayerBase, sequentializePointer } from "../system/layeredCanvas";
import type { Film } from '../dataModels/film';
import { ImageMedia } from '../dataModels/media';
import type { Vector } from "../tools/geometry/geometry";
import { type Trapezoid, trapezoidBoundingRect } from "../tools/geometry/trapezoid";
import type { FrameLayer } from "./frameLayer";
import { drawSelectionFrame } from "../tools/draw/selectionFrame";
import paper from 'paper';
import { getStroke } from 'perfect-freehand'

export class InlinePainterLayer extends LayerBase {
  frameLayer: FrameLayer;

  film: Film | null = null;
  surfaceCorners: Trapezoid | null = null;
  depth: number | null = null;
  translation: Vector;
  scale: Vector;
  maskPath: paper.PathItem | null;
  history: HTMLCanvasElement[];
  historyIndex: number;
  onAutoGenerate: () => void;

  drawsBackground: boolean;
  path: Path2D | null = null;
  brushStamps: { x: number, y: number, size: number, opacity: number }[] | null = null;
  strokeOptions: any = {}; // perfect-freehandのオプション

  constructor(frameLayer: FrameLayer, onAutoGenerate: () => void) {
    super();
    this.frameLayer = frameLayer;

    this.translation = [0, 0];
    this.scale = [1,1];
    this.maskPath = null;
    this.history = [];
    this.historyIndex = 0;
    this.onAutoGenerate = onAutoGenerate;
    this.drawsBackground = false;
  }

  renderDepths(): number[] { return [0,1]; }

  acceptDepths(): number[] { return [0]; }

  render(ctx: CanvasRenderingContext2D, depth: number): void {
    if (!this.canvas) {return;}
    if (depth !== this.depth) { return; }

    this.drawFilmFrame(ctx);
    drawSelectionFrame(ctx, "rgba(0, 128, 255, 1)", this.surfaceCorners!);

    if (this.maskPath) {
      ctx.beginPath();
      ctx.fillStyle = "rgb(0, 0, 0, 0.5)";
      ctx.fill(new Path2D(this.maskPath.pathData));
    }

    if (this.path) {
      ctx.save();
      this.applyBrush(ctx);
      this.drawPath(ctx);
      ctx.restore();
    }

    if (this.brushStamps && this.brushStamps.length > 0) {
      ctx.save();
      this.drawBrushStamps(ctx, this.brushStamps);
      ctx.restore();
    }
  }

  accepts(_point: Vector, _button: number, depth: number): any {
    if (!this.canvas) {return null;}
    return {};
  }

  async *pointer(q: Vector, payload: any): AsyncGenerator<void, void, Vector> {
    if (this.strokeOptions.strokeOperation === 'brush') {
      yield* this.pointerBrush(q);
    } else {
      yield* this.pointerFreehand(q);
    }
  }

  private async *pointerFreehand(q: Vector): AsyncGenerator<void, void, Vector> {
    const rawStroke: Vector[] = [];

    let p: Vector;
    while (p = yield) {
      rawStroke.push(p);

      const stroke: Vector[] = getStroke(rawStroke, this.strokeOptions) as Vector[];

      this.path = new Path2D();
      this.path.moveTo(...stroke[0]);
      for (let i = 1; i < stroke.length; i++) {
        this.path.lineTo(...stroke[i]);
      }
      this.path.closePath();

      this.redraw();      
    }
    this.snapshot();
    this.path = null;
    this.redraw();
    this.onAutoGenerate();
  }

  private async *pointerBrush(q: Vector): AsyncGenerator<void, void, Vector> {
    const stamps: { x: number, y: number, size: number, opacity: number }[] = [];
    const brushSize = this.strokeOptions.size;
    const brushOpacity = this.strokeOptions.brushOpacity ?? 0.3;
    const spacing = Math.max(2, brushSize * 0.15);
    let lastPoint: Vector | null = null;

    let p: Vector;
    while (p = yield) {
      if (lastPoint) {
        const dx = p[0] - lastPoint[0];
        const dy = p[1] - lastPoint[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.floor(dist / spacing));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          stamps.push({
            x: lastPoint[0] + dx * t,
            y: lastPoint[1] + dy * t,
            size: brushSize,
            opacity: brushOpacity,
          });
        }
      } else {
        stamps.push({ x: p[0], y: p[1], size: brushSize, opacity: brushOpacity });
      }
      lastPoint = p;
      this.brushStamps = stamps;
      this.redraw();
    }
    this.snapshotBrush(stamps);
    this.brushStamps = null;
    this.redraw();
    this.onAutoGenerate();
  }

  snapshot(): void {
    const [w, h] = [this.canvas!.width, this.canvas!.height];
    console.log("snapshot", [w,h]);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.history[this.historyIndex-1], 0, 0);

    if (this.path) {
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(this.film!.rotation * Math.PI / 180);
      ctx.scale(1/this.scale[0], 1/this.scale[1]);
      ctx.translate(-this.translation[0], -this.translation[1]);
      this.applyBrush(ctx);
      this.drawPath(ctx);
      ctx.restore();
    }

    const ctx2 = this.canvas!.getContext('2d')!;
    ctx2.clearRect(0, 0, w, h);
    ctx2.drawImage(canvas, 0, 0, w, h);

    const dataUrl = canvas.toDataURL();
    this.history.length = this.historyIndex;
    this.history.push(canvas);
    this.historyIndex++;
    console.log("snapshot", this.historyIndex, this.history.length);
  }

  setSurface(film: Film | null, trapezoid: Trapezoid | null, depth: number): void {
    this.film = film;
    this.surfaceCorners = trapezoid;
    this.depth = depth;
    this.maskPath = null;
    if (film == null) { 
      this.redraw();
      return; 
    }

    if (film.content.kind !== 'media') {
      this.film = null;
      this.redraw();
      return;
    }

    const paperSize = this.frameLayer.getPaperSize();
    const [x0, y0, w, h] = trapezoidBoundingRect(trapezoid!);
    const filmTranslation = film.getShiftedTranslation(paperSize);
    const filmScale = film.getShiftedScale(paperSize);
    const translation: Vector = [
      x0 + w * 0.5 + filmTranslation[0], 
      y0 + h * 0.5 + filmTranslation[1]
    ];
    const scale: Vector = [
      filmScale * film.reverse[0],
      filmScale * film.reverse[1]
    ];

    const media = film.content.media;
    const [iw, ih] = [media.naturalWidth, media.naturalHeight];

    this.translation = translation;
    this.scale = scale;
    console.log("setSurface", translation, scale, [iw, ih]);

    const windowPath = new paper.Path();
    windowPath.moveTo(trapezoid!.topLeft);
    windowPath.lineTo(trapezoid!.topRight);
    windowPath.lineTo(trapezoid!.bottomRight);
    windowPath.lineTo(trapezoid!.bottomLeft);
    windowPath.closed = true;

    const paperPath = new paper.CompoundPath({children: [new paper.Path.Rectangle([0,0], this.getPaperSize())]});
    this.maskPath = paperPath.subtract(windowPath);
    // this.maskPath = paperPath;
    console.log(this.maskPath.pathData);

    const canvas = document.createElement('canvas');
    canvas.width = iw;
    canvas.height = ih;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(media.drawSource, 0, 0);

    this.history=[canvas];
    this.historyIndex = 1;
    this.redraw();
  }

  get canvas(): HTMLCanvasElement | null{
    if (!this.film) { return null; }
    if (this.film.content.kind !== 'media') {
      return null;
    }
    const media = this.film.content.media;
    if (!(media instanceof ImageMedia)) {
      return null;
    }
    return media.drawSourceCanvas;
  }

  async undo() {
    console.log("inlinePainterLayer.undo", this.historyIndex, this.history.length)
    if (this.historyIndex <= 1) { return; }

    this.historyIndex--;
    const prevCanvas = this.history[this.historyIndex - 1];
    const ctx = this.canvas!.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    ctx.drawImage(prevCanvas, 0, 0);
    this.redraw();
  }

  async redo() {
    console.log("inlinePainterLayer.redo", this.historyIndex, this.history.length)
    if (this.history.length <= this.historyIndex) { return; }

    this.historyIndex++;
    const nextCanvas = this.history[this.historyIndex - 1];
    const ctx = this.canvas!.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    ctx.drawImage(nextCanvas, 0, 0);
    this.redraw();
  }

  // paperRenderLayerからコピペ
  drawFilmFrame(ctx: CanvasRenderingContext2D): void {
    const [w, h] = [this.canvas!.width, this.canvas!.height];

    ctx.save();
    ctx.translate(this.translation[0], this.translation[1]);
    ctx.scale(this.scale[0], this.scale[1]);
    ctx.rotate(-this.film!.rotation * Math.PI / 180);
    ctx.translate(-w * 0.5, -h * 0.5);
    ctx.strokeStyle = "rgba(128, 128, 128, 0.5)";
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  }

  applyBrush(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.strokeOptions.fill;
    ctx.strokeStyle = this.strokeOptions.stroke;
    ctx.lineWidth = this.strokeOptions.strokeWidth;
  }

  drawPath(ctx: CanvasRenderingContext2D) {
    if (this.strokeOptions.strokeOperation == 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill(this.path!);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      if (0 < this.strokeOptions.strokeWidth) {
        ctx.lineJoin = "round";
        ctx.stroke(this.path!);
      }
      if (this.strokeOptions.strokeOperation == 'strokeWithFill') {
        ctx.fill(this.path!);
      }
    }
  }

  drawBrushStamps(ctx: CanvasRenderingContext2D, stamps: { x: number, y: number, size: number, opacity: number }[]) {
    const color = this.strokeOptions.fill || '#000000';
    for (const stamp of stamps) {
      const r = stamp.size * 0.5;
      const gradient = ctx.createRadialGradient(stamp.x, stamp.y, 0, stamp.x, stamp.y, r);
      gradient.addColorStop(0, this.hexToRgba(color, stamp.opacity));
      gradient.addColorStop(0.6, this.hexToRgba(color, stamp.opacity * 0.5));
      gradient.addColorStop(1, this.hexToRgba(color, 0));
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(stamp.x, stamp.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(0,0,0,${alpha})`;
    return `rgba(${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)},${alpha})`;
  }

  snapshotBrush(stamps: { x: number, y: number, size: number, opacity: number }[]): void {
    const [w, h] = [this.canvas!.width, this.canvas!.height];

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.history[this.historyIndex-1], 0, 0);

    // ブラシスタンプを描画
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(this.film!.rotation * Math.PI / 180);
    ctx.scale(1/this.scale[0], 1/this.scale[1]);
    ctx.translate(-this.translation[0], -this.translation[1]);
    this.drawBrushStamps(ctx, stamps);
    ctx.restore();

    const ctx2 = this.canvas!.getContext('2d')!;
    ctx2.clearRect(0, 0, w, h);
    ctx2.drawImage(canvas, 0, 0, w, h);

    this.history.length = this.historyIndex;
    this.history.push(canvas);
    this.historyIndex++;
  }

}
sequentializePointer(InlinePainterLayer);
