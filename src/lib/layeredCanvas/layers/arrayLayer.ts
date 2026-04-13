import { type Layer, LayerBase, Paper, type Viewport, type Picked } from '../system/layeredCanvas';
import { PaperArray } from '../system/paperArray';
import type { Vector } from "../tools/geometry/geometry";
import { ClickableIcon } from "../tools/draw/clickableIcon";
import { keyDownFlags } from "../system/keyCache";
import { drawSelectionFrame } from "../tools/draw/selectionFrame";
import { rectToTrapezoid } from '../tools/geometry/trapezoid';
import { ulid } from 'ulid';

export class ArrayLayer extends LayerBase {
  ulid: string;

  array: PaperArray;
  onInsert: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (from: number[], to: number) => void;
  onDup: (from: number[], to: number) => void;
  onCopyToClipboard: (index: number) => void;
  onEditBubbles: (index: number) => void;
  onTweak: (index: number) => void;

  trashIcons: ClickableIcon[] = [];
  markIcons: ClickableIcon[] = [];
  insertIcons: ClickableIcon[] = [];
  bubblesIcons: ClickableIcon[] = [];
  copyIcons: ClickableIcon[] = [];
  tweakIcons: ClickableIcon[] = [];
  markFlags: boolean[] = [];

  constructor(
    papers: Paper[], 
    marks: boolean[],
    fold: number, 
    gapX: number, 
    gapY: number,
    direction: number, 
    onInsert: (index: number) => void, 
    onDelete: (index: number) => void,
    onMove: (from: number[], to: number) => void,
    onDup: (from: number[], to: number) => void,
    onCopyToClipboard: (index: number) => void,
    onEditBubbles: (index: number) => void,
    onTweak: (index: number) => void) { 

    super();
    this.ulid = ulid();

    this.array = new PaperArray(papers, fold, gapX, gapY, direction);
    this.markFlags = marks;
    this.onInsert = onInsert;
    this.onDelete = onDelete;
    this.onMove = onMove;
    this.onDup = onDup;
    this.onCopyToClipboard = onCopyToClipboard;
    this.onEditBubbles = onEditBubbles;
    this.onTweak = onTweak;

    const mp = () => this.paper.rscale;
    for (let i = 0; i < this.array.papers.length; i++) {
      const trashIcon = new ClickableIcon(["page-trash.webp"],[24,24],[0.5,0],"hint.array.deletePage", () => 1 < this.array.papers.length, mp);
      this.trashIcons.push(trashIcon);
      const markIcon = new ClickableIcon(["page-mark.webp", "page-mark-on.webp"],[24,24],[0.5,0],"hint.array.markPage", null, mp);
      this.markIcons.push(markIcon);
      const editBubblesIcon = new ClickableIcon(["page-bubbles.webp"],[24,24],[0.5,0],"hint.array.editBubbles", null, mp);
      this.bubblesIcons.push(editBubblesIcon);
      const copyIcon = new ClickableIcon(["page-clipboard.webp"],[24,24],[0.5,0],"hint.array.copyToClipboard", null, mp);
      this.copyIcons.push(copyIcon);
      const tweakIcon = new ClickableIcon(["page-tweak.webp"],[24,24],[0.5,0],"hint.array.tweakPage", null, mp);
      this.tweakIcons.push(tweakIcon);
      this.markFlags[i] = false;
    }
    for (let i = 0; i <= this.array.papers.length; i++) {
      const insertIcon = new ClickableIcon(
        ["page-insert.webp", "page-insert-vertical.webp", "page-paste.webp"],[24,24],[0.5,0],
        ["hint.array.insertNewPage", "hint.array.insertNewPage", "hint.array.moveMarkedPages"], null, mp);
      this.insertIcons.push(insertIcon);
    }
    this.calculateIconPositions();
  }

  rebuildPageLayouts(matrix: DOMMatrix) {
    this.array.recalculatePaperCenter();
    for (let paper of this.array.papers) {
      let m = matrix.translate(...paper.center);
      paper.paper.rebuildPageLayouts(m, this.paper.dpr);
    }

    this.calculateIconPositions();
  }

  calculateIconPositions() {
    for (let i = 0; i < this.array.papers.length; i++) {
      const paper = this.array.papers[i];
      const s = paper.paper.size;
      const c = paper.center;
      const trashIcon = this.trashIcons[i];
      const markIcon = this.markIcons[i];
      const copyIcon = this.copyIcons[i];
      const bubblesIcon = this.bubblesIcons[i];
      const tweakIcon = this.tweakIcons[i];
      markIcon.index = this.markFlags[i] ? 1 : 0;

      const baseX = c[0] + s[0] * 0.5 + 24;

      // Bottom right group (stacked upwards from the bottom)
      // We will place them starting from bottom edge and moving up, with step 64.
      let bottomY = c[1] + s[1] * 0.5 - 32;
      const step = 64;

      trashIcon.pivot = [0, 0.5];
      trashIcon.position = [baseX, bottomY];
      
      tweakIcon.pivot = [0, 0.5];
      tweakIcon.position = [baseX, bottomY - step];
      
      copyIcon.pivot = [0, 0.5];
      copyIcon.position = [baseX, bottomY - step * 2];
      
      bubblesIcon.pivot = [0, 0.5];
      bubblesIcon.position = [baseX, bottomY - step * 3];

      markIcon.pivot = [0, 0.5];
      markIcon.position = [baseX, bottomY - step * 4];
    }
    for (let i = 0; i < this.array.papers.length; i++) {
      const paper = this.array.papers[i];
      const s = paper.paper.size;
      const c = paper.center;
      const insertIcon = this.insertIcons[i];
      if (this.array.fold === 1) {
        const gap = this.array.gapY;
        insertIcon.index = 1;
        insertIcon.pivot = [0, 0.5];
        insertIcon.position = [c[0] + s[0] * 0.5 + 24, c[1] - s[1] * 0.5 - gap * 0.5];
      } else {
        const gap = this.array.gapX;
        const offset = (s[0] * 0.5 + gap * 0.5) * -this.array.direction;
        insertIcon.index = 0;
        insertIcon.pivot = [0.5, 0];
        insertIcon.position = [c[0] + offset, c[1] + s[1] * 0.5 + 16];
      }
    }

    // 最後のページの挿入アイコン
    const paper = this.array.papers[this.array.papers.length - 1];
    const s = paper.paper.size;
    const c = paper.center;
    const insertIcon = this.insertIcons[this.array.papers.length];
    if (this.array.fold === 1) {
      const gap = this.array.gapY;
      insertIcon.index = 1;
      insertIcon.pivot = [0, 0.5];
      insertIcon.position = [c[0] + s[0] * 0.5 + 60, c[1] + s[1] * 0.5 + gap * 0.5];
    } else {
      const gap = this.array.gapX;
      const offset = (s[0] * 0.5 + gap * 0.5) * this.array.direction;
      insertIcon.index = 0;
      insertIcon.pivot = [0.5, 0];
      insertIcon.position = [c[0] + offset, c[1] + s[1] * 0.5 + 32];
    }
    if (this.markFlags.some(e => e)) {
      for (let i = 0; i <= this.array.papers.length; i++) {
        this.insertIcons[i].index = 2;
      }
    }
  }

  pointerHover(p: Vector, depth: number): Layer | null {
    if (!this.interactable) { return null; }

    this.hint(null, null);

    const {paper, position} = this.array.parentPositionToNearestChildPosition(p);
    const litLayer = paper.handlePointerHover(position, depth);
    if (litLayer) {
      return litLayer;
    }

    for (let icons of [this.trashIcons, this.markIcons, this.copyIcons, this.bubblesIcons, this.tweakIcons]) {
      for (let icon of icons) {
        if (icon.hintIfContains(p, this.hint.bind(this))) {
          return this;
        }
      }
    }

    if (this.markFlags.some(e => e)) {
      for (let icon of this.insertIcons) {
        if (icon.hintIfContains(p, this.hint.bind(this))) {
          return this;
        }
      }
    }

    return null;
  }

  pointerUnhover(layer: Layer) {
    if (!this.interactable) {return;}

    for (let paper of this.array.papers) {
      paper.paper.handlePointerUnhover(layer);
    }
  }

  accepts(p: Vector, button: number, depth: number): any {

    const {paper, index, position} = this.array.parentPositionToNearestChildPosition(p);
    const innerDragging = paper.handleAccepts(position, button, depth);
    if (innerDragging) {
      return { paper, index, innerDragging };
    }
    if (0 < depth) {return null;}

    for (let [i, e] of this.insertIcons.entries()) {
      if (e.contains(p)) {
        if (this.markFlags.some(e => e)) {
          if (keyDownFlags["ControlLeft"] || keyDownFlags["ControlRight"]) {
            this.onDup(this.markFlags.map((e, i) => e ? i : -1).filter(e => 0 <= e), i);
          } else {
          // markFlagsが立っているページが前にある場合、その分indexを減らす
          const n = this.markFlags.slice(0, i).filter(e => e).length;
            this.onMove(this.markFlags.map((e, i) => e ? i : -1).filter(e => 0 <= e), i - n);
          }
          return null;
        }
      }      
    }
    for (let [i, e] of this.trashIcons.entries()) {
      if (e.contains(p)) {
        this.onDelete(i);
        return null;
      }      
    }
    for (let [i, e] of this.markIcons.entries()) {
      if (e.contains(p)) {
        this.markFlags[i] = !this.markFlags[i];
        this.calculateIconPositions();
        this.redraw();
        return null;
      }      
    }
    for (let [i, e] of this.copyIcons.entries()) {
      if (e.contains(p)) {
        this.onCopyToClipboard(i);
        return null;
      }      
    }

    for (let [i, e] of this.bubblesIcons.entries()) {
      if (e.contains(p)) {
        this.onEditBubbles(i);
        return null;
      }      
    }
    for (let [i, e] of this.tweakIcons.entries()) {
      if (e.contains(p)) {
        this.onTweak(i);
        return null;
      }      
    }

    return null;
  }

  pointerDown(p: Vector, payload: any): void {
    const { paper, index, innerDragging } = payload;
    const q = this.array.parentPositionToChildPosition(index, p);
    paper.handlePointerDown(q, innerDragging);
  }

  pointerMove(p: Vector, payload: any): void {
    const { paper, index, innerDragging } = payload;
    const q = this.array.parentPositionToChildPosition(index, p);
    paper.handlePointerMove(q, innerDragging);
  }

  pointerUp(p: Vector, payload: any): void {
    const { paper, index, innerDragging } = payload;
    const q = this.array.parentPositionToChildPosition(index, p);
    paper.handlePointerUp(q, innerDragging);
  }

  pointerCancel(p: Vector, payload: any): void {
    const { paper, index, innerDragging } = payload;
    const q = this.array.parentPositionToChildPosition(index, p);
    paper.handleCancel(q, innerDragging);
  }

  prerender(viewport: Viewport): void {
    for (let i = 0; i < this.array.papers.length; i++) {
      this.array.papers[i].paper.prerender(viewport);
    }
  }

  render(ctx: CanvasRenderingContext2D, depth: number): void {
    if (this.interactable && depth === 0) {
      ctx.save();
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      if (this.markFlags.some(e => e)) {
        this.insertIcons.forEach(e => {
          e.render(ctx);
        });
      }
      this.trashIcons.forEach(e => {
        e.render(ctx);
      });
      this.markIcons.forEach((e, i) => {
        e.render(ctx);
        const r = e.boundingRect;
        const rscale = e.rscale;
        ctx.font = `${Math.floor(18*rscale)}px sans-serif`;
        ctx.fillText((i+1).toString(), r[0]+16*rscale, r[1]+19*rscale);
      });
      this.copyIcons.forEach(e => {
        e.render(ctx);
      });

      this.bubblesIcons.forEach(e => {
        e.render(ctx);
      });
      this.tweakIcons.forEach(e => {
        e.render(ctx);
      });
      ctx.restore();
    }
    this.array.papers.forEach((paper, i) => { 
      ctx.save();
      ctx.translate(...paper.center);
      paper.paper.render(ctx, depth);
      ctx.restore();
      if (this.markFlags[i]) {
        const r = this.array.getPaperRect(i);
        drawSelectionFrame(ctx, "rgba(255, 128, 128, 1)", rectToTrapezoid(r));
      }
    });
  }

  dropped(p: Vector, media: HTMLCanvasElement | HTMLVideoElement | string): boolean {
    const {paper, position} = this.array.parentPositionToNearestChildPosition(p);
    return paper.handleDrop(position, media);
  }

  pasted(p: Vector, media: HTMLCanvasElement | HTMLVideoElement | string): boolean {
    const {paper, position} = this.array.parentPositionToNearestChildPosition(p);
    return paper.handlePaste(position, media);
  }

  beforeDoubleClick(p: Vector): boolean { 
    const {paper, position} = this.array.parentPositionToNearestChildPosition(p);
    return paper.handleBeforeDoubleClick(position);
  }

  doubleClicked(p: Vector): boolean { 
    const {paper, position} = this.array.parentPositionToNearestChildPosition(p);
    if (paper.contains(position)) {
      return paper.handleDoubleClicked(position);
    }
    return false;
  }

  async keyDown(p: Vector, event: KeyboardEvent): Promise<boolean> { 
    const {index, paper, position} = this.array.parentPositionToNearestChildPosition(p);
    return await paper.handleKeyDown(position, event);
  }

  wheel(p: Vector, delta: number): boolean { 
    const {paper, position} = this.array.parentPositionToNearestChildPosition(p);
    return paper.handleWheel(position, delta);
  }

  flushHints(viewport: Viewport): void {
    for (let paper of this.array.papers) {
      paper.paper.flushHints(viewport);
    }
  }

  tick(now: number): void {
    for (let paper of this.array.papers) {
      paper.paper.tick(now);
    }
  }

  renderDepths(): number[] { 
    // paper全部から集めてsort/uniq
    const depths = this.array.papers.flatMap(p => p.paper.renderDepths());
    return [...new Set(depths)].sort((a,b) => a - b);
  }

  acceptDepths(): number[] { 
    // paper全部から集めてsort/uniq
    const depths = this.array.papers.flatMap(p => p.paper.acceptDepths());
    return [...new Set(depths)].sort((a,b) => a - b);
  }

  pick(p: Vector): Picked[] {
    const {paper, position} = this.array.parentPositionToNearestChildPosition(p);
    if (paper.contains(position)) {
      return paper.pick(position);
    }
    return [];
  }

  get redrawRequired(): boolean {
    return this.array.redrawRequired;
  }
  set redrawRequired(value: boolean) {
    this.array.redrawRequired = value;
  }

  get pierceRequired(): boolean {
    return this.array.pierceRequired;
  }
  set pierceRequired(value: boolean) {
    this.array.pierceRequired = value;
  }

  set mode(mode: any) { 
    super.mode = mode;
    this.array.mode = mode; 
  }
  get mode() { return super.mode; }

  get interactable(): boolean {return this.mode == null; }

  tearDown() {
    // PaperArrayのクリーンアップ
    if (this.array) {
      for (const paper of this.array.papers) {
        paper.paper.tearDown();
      }
      this.array.papers = [];
    }

    // 基底クラスのtearDownを呼び出す
    super.tearDown();
  }
}
