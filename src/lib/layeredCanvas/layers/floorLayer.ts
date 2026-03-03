import { LayerBase, sequentializePointer, type Picked } from "../system/layeredCanvas";
import { keyDownFlags } from "../system/keyCache";
import type { Vector } from '../tools/geometry/geometry';
import type { Viewport } from "../system/layeredCanvas";
import type { FocusKeeper } from "../tools/focusKeeper";

export class FloorLayer extends LayerBase {
  viewport: Viewport;
  onViewportChanged: () => void; // ここで責任とれないこと（例えばsvelteUI)
  onResidual: (media: HTMLCanvasElement | HTMLVideoElement | string) => void;
  backgroundColor: string;

  constructor(viewport: Viewport, onViewportChanged: () => void, onResidual: (media: HTMLCanvasElement | HTMLVideoElement | string) => void, private focusKeeper: FocusKeeper, backgroundColor: string) {
    super();
    this.viewport = viewport;
    this.onViewportChanged = onViewportChanged;
    this.onResidual = onResidual;
    this.backgroundColor = backgroundColor;
  }

  acceptDepths(): number[] {
    return [0];
  }

  renderDepths(): number[] { return [0]; }

  render(ctx: CanvasRenderingContext2D, depth: number) {
    const canvas = ctx.canvas;
    ctx.fillStyle = this.backgroundColor;
    // transformに関係なく一色にしたい
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }



  dropped(position: Vector, media: HTMLCanvasElement | HTMLVideoElement | string): boolean {
    console.log("floor received");
    this.onResidual(media);
    return true;
  }

  pasted(position: Vector, media: HTMLCanvasElement | HTMLVideoElement | string): boolean {
    console.log("floor received");
    this.onResidual(media);
    return true;
  }

  wheel(_position: Vector, delta: number) {
    let scale = this.viewport.scale;
    scale -= delta * 0.0001;
    if (scale < 0.1) scale = 0.1;
    if (scale > 10) scale = 10;
    scale = Math.round(scale * 100) / 100;
    this.viewport.translate[0] *= scale / this.viewport.scale;
    this.viewport.translate[1] *= scale / this.viewport.scale;
    this.viewport.scale = scale;
    this.viewport.dirty = true;
    this.redraw();
    this.onViewportChanged();
    return true;
  }

  async keyDown(position_: Vector, event: KeyboardEvent): Promise<boolean> {
    //  if ESC
    if (event.code === "Escape") {
      this.focusKeeper.setFocus(null);
      return true;
    }
    return false;
  }

  accepts(_point: Vector, button: number, depth: number): any {
    return keyDownFlags["Space"] || 0 < button;
  }

  *pointer(p: Vector) {
    const dragStart = p;
    const scale = this.viewport.scale;

    try {
      while (p = yield) {
        const dragOffset: Vector = [
          (p[0] - dragStart[0]) * scale,
          (p[1] - dragStart[1]) * scale
        ];
        this.viewport.viewTranslate = dragOffset;
        this.viewport.dirty = true;
        this.redraw();
      }
    }
    catch(e) {
      if (e === 'cancel') {
      } else {
        throw e;
      }
    }
    const t = this.viewport.translate;
    const v = this.viewport.viewTranslate;
    this.viewport.translate = [t[0] + v[0], t[1] + v[1]];
    this.viewport.viewTranslate = [0, 0];
    this.viewport.dirty = true;
    this.onViewportChanged();
  }
}
sequentializePointer(FloorLayer);
