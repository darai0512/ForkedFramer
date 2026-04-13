import { type Layer, LayerBase, sequentializePointer, type Picked, type Viewport } from "../system/layeredCanvas";
import { FrameElement, type Layout,type Border, type PaddingHandle, calculatePhysicalLayout, findLayoutAt, findLayoutOf, findBorderAt, findPaddingOn, findPaddingOf, makeBorderCorners, makeBorderFormalCorners, calculateOffsettedCorners, listLayoutsAt } from "../dataModels/frameTree";
import { Film, FilmStackTransformer } from "../dataModels/film";
import { type Media, ImageMedia, VideoMedia } from "../dataModels/media";
import { constraintRecursive, constraintLeaf, insertFrameLayers } from "../dataModels/frameTree";
import { translate, scale, rotate } from "../tools/pictureControl";
import { keyDownFlags } from "../system/keyCache";
import { ClickableSlate, ClickableIcon, ClickableSelfRenderer } from "../tools/draw/clickableIcon";
import { pointToQuadrilateralDistance, isPointInTrapezoid, trapezoidCorners, trapezoidPath, trapezoidBoundingRect, trapezoidCenter } from "../tools/geometry/trapezoid";
import { type Vector, type Rect, box2Rect, add2D, scale2D, lerp2D, distance2D, segmentIntersection, isTriangleClockwise, vectorEquals, getRectCenter, rectContains, denormalizePositionInRect } from '../tools/geometry/geometry';
import type { PaperRendererLayer } from "./paperRendererLayer";
import { type RectCornerHandle, rectCornerHandles } from "../tools/rectHandle";
import { drawSelectionFrame, calculateSheetRect, drawSheet } from "../tools/draw/selectionFrame";
import type { Trapezoid } from "../tools/geometry/trapezoid";
import { drawFilmStackBorders } from "../tools/draw/drawFilmStack";
import type { FocusKeeper } from "../tools/focusKeeper";
import { Grid } from "../tools/grid";
import paper from 'paper';
import { PaperOffset } from "paperjs-offset";
import { readVectorParam } from "../dataModels/proceduralEffects";
import type { FilmProceduralEffectType } from "../dataModels/proceduralEffects";
import { tailCoordToWorldCoord, worldCoordToTailCoord } from "../tools/geometry/bubbleGeometry";
// import * as Sentry from "@sentry/svelte";
import { sendMediaToMaterialCollection } from "../../../materialBucket/materialOperations";

const SHEET_Y_MARGIN = 48;

const iconUnit: Vector = [32,32];
const BORDER_MARGIN = 10;
const PADDING_HANDLE_INNER_WIDTH = 20;
const PADDING_HANDLE_OUTER_WIDTH = 20;

type ProceduralHandleContext = {
  film: Film;
  layout: Layout;
  frameCenter: Vector;
  matrix: DOMMatrix;
  inverseMatrix: DOMMatrix;
  baseSize: number;
};

type ProceduralHandleState = {
  context: ProceduralHandleContext;
  type: FilmProceduralEffectType;
  icons: ClickableIcon[];
  worldPositions: {
    focalPoint?: Vector;
    focalRange?: Vector;
    tailTip?: Vector;
    tailMid?: Vector;
    filmCenter: Vector;
  };
};

export class FrameLayer extends LayerBase {
  cursorPosition: Vector;

  splitHorizontalIcon: ClickableIcon;
  splitVerticalIcon: ClickableIcon;
  deleteIcon: ClickableIcon;
  duplicateIcon: ClickableIcon;
  shiftIcon: ClickableIcon;
  unshiftIcon: ClickableIcon;
  resetPaddingIcon: ClickableIcon;
  zplusIcon: ClickableIcon;
  zminusIcon: ClickableIcon;
  visibilityIcon: ClickableIcon;
  scaleIcon: ClickableIcon;
  rotateIcon: ClickableIcon;
  scribbleIcon: ClickableIcon;  
  flipHorizontalIcon: ClickableIcon;
  flipVerticalIcon: ClickableIcon;
  fitIcon: ClickableIcon;
  expandHorizontalIcon: ClickableIcon;
  slantHorizontalIcon: ClickableIcon;
  insertHorizontalIcon: ClickableIcon;
  expandVerticalIcon: ClickableIcon;
  slantVerticalIcon: ClickableIcon;
  insertVerticalIcon: ClickableIcon;
  deleteHorizontalIcon: ClickableIcon;
  deleteVerticalIcon: ClickableIcon;
  swapIcon: ClickableIcon;
  zvalue: ClickableSelfRenderer;

  frameIcons: ClickableSlate[];
  borderIcons: ClickableSlate[];
  litIcons: ClickableSlate[];

  proceduralOptionIcons: Record<string, ClickableIcon>;
  proceduralOptionEditActive: Record<string, boolean>;
  proceduralHandleState: ProceduralHandleState | null;

  litLayout: Layout | null = null;
  litBorder: Border | null = null;
  selectedLayout: Layout | null = null;
  selectedBorder: Border | null = null;
  litPadding: PaddingHandle | null = null;
  pointerHandler: any = null;
  canvasPattern!: CanvasPattern;

  constructor(
    private renderLayer: PaperRendererLayer,
    private focusKeeper: FocusKeeper,
    private frameTree: FrameElement, 
    private onFocus: (layout: Layout | null) => void,
    private onCommit: () => void, 
    private onRevert: () => void, 
    private onShift: (element: FrameElement) => void, 
    private onUnshift: (element: FrameElement) => void,
    private onSwap: (element0: FrameElement, element1: FrameElement) => void,
    private onInsert: (border: Border) => void,
    private onScribble: (element: FrameElement) => void,
  ) {
    super();

    this.cursorPosition = [-1, -1];

    const unit = iconUnit;
    const spinUnit: Vector = [unit[0], unit[1] * 1 / 6];
    const mp = () => this.paper.rscale;
    const isFrameActiveAndVisible = () => this.interactable && 0 < (this.selectedLayout?.element.visibility ?? 0);
    this.splitHorizontalIcon = new ClickableIcon(["frameLayer/split-horizontal.webp"],unit,[0,1],"hint.frame.splitHorizontal", isFrameActiveAndVisible, mp);
    this.splitVerticalIcon = new ClickableIcon(["frameLayer/split-vertical.webp"],unit,[0,1],"hint.frame.splitVertical", isFrameActiveAndVisible, mp);
    this.deleteIcon = new ClickableIcon(["frameLayer/delete.webp"],unit,[1,0],"hint.frame.delete", isFrameActiveAndVisible, mp);
    this.duplicateIcon = new ClickableIcon(["frameLayer/duplicate.webp"],unit,[1,0],"hint.frame.duplicate", isFrameActiveAndVisible, mp);
    this.shiftIcon = new ClickableIcon(["frameLayer/shift.webp"],unit,[1,0],"hint.frame.shiftImage", isFrameActiveAndVisible, mp);
    this.unshiftIcon = new ClickableIcon(["frameLayer/unshift.webp"],unit,[1,0],"hint.frame.unshiftImage", isFrameActiveAndVisible, mp);
    this.resetPaddingIcon = new ClickableIcon(["frameLayer/reset-padding.webp"],unit,[1,0],"hint.frame.resetPadding", isFrameActiveAndVisible, mp);
    this.zplusIcon = new ClickableIcon(["frameLayer/increment.webp"],spinUnit,[0,0],"hint.frame.zplus", isFrameActiveAndVisible, mp);
    this.zminusIcon = new ClickableIcon(["frameLayer/decrement.webp"],spinUnit,[0,0],"hint.frame.zminus", isFrameActiveAndVisible, mp);
    this.visibilityIcon = new ClickableIcon(["frameLayer/visibility1.webp","frameLayer/visibility2.webp","frameLayer/visibility3.webp"],unit,[0,0], ["hint.frame.visibility","hint.frame.visibility","hint.frame.visibility"], isFrameActiveAndVisible, mp);
    this.visibilityIcon.index = 2;
    this.zvalue = new ClickableSelfRenderer(
      (ctx: CanvasRenderingContext2D, csr: ClickableSelfRenderer) => {
        const rscale = this.paper.rscale;
        const b = csr.boundingRect;
        const l = this.selectedLayout;
        // const c = getRectCenter(b);
        const c = denormalizePositionInRect([0.45, 0.6], b)
        const fontSize = Math.floor(b[3] * 0.8);
        // ctx.fillStyle = "#222222";
        // ctx.fillRect(b[0], b[1], b[2], b[3]);
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#86C8FF";
        ctx.fillText((l!.element.z + 3).toString(), ...c);
      },
      unit, [0,0], "hint.frame.zvalue", isFrameActiveAndVisible, mp);

    const isImageActiveDraggable = () => this.interactable && 0 < (this.selectedLayout?.element.filmStack.films.length ?? 0);
    const isImageActive = () => this.interactable && 0 < (this.selectedLayout?.element.filmStack.films.length ?? 0) && !this.pointerHandler;
    const isFrameSelected = () => this.interactable && this.selectedLayout != null && !this.pointerHandler;
    this.scaleIcon = new ClickableIcon(["frameLayer/scale.webp"],unit,[1,1],"hint.frame.dragToScale", isImageActiveDraggable, mp);
    this.rotateIcon = new ClickableIcon(["frameLayer/rotate.webp"],unit,[1,1],"hint.frame.dragToRotate", isImageActiveDraggable, mp);
    this.scribbleIcon = new ClickableIcon(["frameLayer/scribble.webp"],unit,[1,1],"hint.frame.scribbleOnTop", isFrameSelected, mp);
    this.flipHorizontalIcon = new ClickableIcon(["frameLayer/flip-horizontal.webp"],unit,[1,1],"hint.frame.flipHorizontal", isFrameSelected, mp);
    this.flipVerticalIcon = new ClickableIcon(["frameLayer/flip-vertical.webp"],unit,[1,1],"hint.frame.flipVertical", isFrameSelected, mp);
    this.fitIcon = new ClickableIcon(["frameLayer/fit.webp"],unit,[1,1],"hint.frame.fit", isFrameSelected, mp);

    const isBorderActive = (dir: 'h' | 'v') => this.interactable && this.selectedBorder?.layout.dir === dir;
    const isBorderActiveAndDeletable = (dir: 'h' | 'v') => 
      this.interactable && 
      this.selectedBorder?.layout.dir === dir &&
      this.selectedBorder.layout.children![this.selectedBorder.index-1].element.isLeaf() &&
      this.selectedBorder.layout.children![this.selectedBorder.index].element.isLeaf();

    this.expandHorizontalIcon = new ClickableIcon(["frameLayer/expand-horizontal.webp"],unit,[0.5,1],"hint.frame.changeWidth", () => isBorderActive('h'), mp);
    this.slantHorizontalIcon = new ClickableIcon(["frameLayer/slant-horizontal.webp"], unit,[0.5,0],"hint.frame.slant", () => isBorderActive('h'), mp);
    this.insertHorizontalIcon = new ClickableIcon(["frameLayer/insert-horizontal.webp"],unit,[0.5,0],"hint.frame.insertFrame", () => isBorderActive('h'), mp);
    this.deleteHorizontalIcon = new ClickableIcon(["frameLayer/delete.webp"],unit,[0.5,0],"hint.frame.delete", () => isBorderActiveAndDeletable('h'), mp);
    this.expandVerticalIcon = new ClickableIcon(["frameLayer/expand-vertical.webp"],unit,[1,0.5],"hint.frame.changeWidth", () => isBorderActive('v'), mp);
    this.slantVerticalIcon = new ClickableIcon(["frameLayer/slant-vertical.webp"], unit,[0,0.5],"hint.frame.slant", () => isBorderActive('v'), mp);
    this.insertVerticalIcon = new ClickableIcon(["frameLayer/insert-vertical.webp"],unit,[0,0.5],"hint.frame.insertFrame", () => isBorderActive('v'), mp);
    this.deleteVerticalIcon = new ClickableIcon(["frameLayer/delete.webp"],unit,[0,0.5],"hint.frame.delete", () => isBorderActiveAndDeletable('v'), mp);

    const isSwapVisible = () => this.interactable && this.litLayout != null && this.selectedLayout != null && this.litLayout.element !== this.selectedLayout.element && !this.pointerHandler && 0 < this.litLayout.element.visibility;
    this.swapIcon = new ClickableIcon(["frameLayer/swap.webp"],unit,[0.5,0],"hint.frame.swapSelected", isSwapVisible, mp);

    this.frameIcons = [this.splitHorizontalIcon, this.splitVerticalIcon, this.deleteIcon, this.duplicateIcon, this.shiftIcon, this.unshiftIcon, this.resetPaddingIcon, this.zplusIcon, this.zminusIcon, this.visibilityIcon, this.scaleIcon, this.rotateIcon, this.scribbleIcon, this.flipHorizontalIcon, this.flipVerticalIcon, this.fitIcon, this.zvalue];
    this.borderIcons = [this.slantVerticalIcon, this.expandVerticalIcon, this.slantHorizontalIcon, this.expandHorizontalIcon, this.insertHorizontalIcon, this.insertVerticalIcon, this.deleteHorizontalIcon, this.deleteVerticalIcon];
    this.litIcons = [this.swapIcon];

    const handleVisibleFor = (type: FilmProceduralEffectType) => () => {
      if (!this.interactable) { return false; }
      const film = this.getProceduralFilmTarget();
      if (!film) { return false; }
      const effect = film.proceduralEffect;
      return !!effect && effect.type === type;
    };
    this.proceduralOptionIcons = {
      tail: new ClickableIcon(["bubbleLayer/tail-tip.webp"], iconUnit, [0.5, 0.5], "hint.frame.dragTail", handleVisibleFor('speed-lines'), mp),
      curve: new ClickableIcon(["bubbleLayer/tail-mid.webp"], iconUnit, [0.5, 0.5], "hint.frame.dragTailCurve", handleVisibleFor('speed-lines'), mp),
      circle: new ClickableIcon(["bubbleLayer/circle.webp"], iconUnit, [0.5, 0.5], "hint.frame.dragCircle", handleVisibleFor('motion-lines'), mp),
      radius: new ClickableIcon(["bubbleLayer/radius.webp"], iconUnit, [0.5, 0.5], "hint.frame.dragRadius", handleVisibleFor('motion-lines'), mp),
    };
    this.proceduralOptionEditActive = { focal: false, tail: false };
    this.proceduralHandleState = null;

    for (let icon of this.frameIcons) {
      if (icon instanceof ClickableIcon) {
        icon.shadowColor = "#448";
      }
    }
    this.zplusIcon.marginBottom = 16;
    this.zminusIcon.marginTop = 16;

    for (let key of Object.keys(this.proceduralOptionIcons)) {
      this.proceduralOptionIcons[key].shadowColor = "#fff";
    }

    this.makeCanvasPattern();

    focusKeeper.subscribe(this.changeFocus.bind(this));
  }

  calculateRootLayout(): Layout {
    return calculatePhysicalLayout(this.frameTree, this.getPaperSize(), [0, 0]);
  }

  rebuildPageLayouts(matrix: DOMMatrix): void {
    this.relayoutIcons();
  }


  makeCanvasPattern() {
    const pcanvas = document.createElement("canvas");
    pcanvas.width = 16;
    pcanvas.height = 16;
    const pctx = pcanvas.getContext("2d")!;
    pctx.strokeStyle = "rgba(0, 200, 200, 0.4)";
    pctx.lineWidth = 6;
    pctx.beginPath();

    const slope = 1;
    for (let y = -16; y < 32; y += 16) {
      pctx.moveTo(-8, y);
      pctx.lineTo(72, y + 80 * slope);
    }
    pctx.stroke();
    this.canvasPattern = pctx.createPattern(pcanvas, 'repeat')!;
  }

  renderDepths(): number[] { return [0,2]; }

  acceptDepths(): number[] {
    return [0,2];
  }

  prerender(_viewport: Viewport): void {
    this.renderLayer.setFrameTree(this.frameTree);
  }

  render(ctx: CanvasRenderingContext2D, depth: number): void {
    if (!this.interactable) { return; }

    if (depth === 2) {
      this.renderSelected(ctx);
    } else {
      this.renderOtheers(ctx, depth);
    }
  }

  renderSelected(ctx: CanvasRenderingContext2D): void { 
    if (this.selectedBorder) {
      const corners = this.selectedBorder.corners;
      const canvasPath = getTrapezoidPath(corners, BORDER_MARGIN, true);

      // 線のスタイルを設定して描画
      ctx.fillStyle = this.canvasPattern;
      ctx.fill(canvasPath);

      this.borderIcons.forEach(icon => icon.render(ctx));
    } else if (this.selectedLayout) {
      const [x0, y0, w, h] = trapezoidBoundingRect(this.selectedLayout.corners);
      ctx.save();
      ctx.translate(x0 + w * 0.5, y0 + h * 0.5);
      drawFilmStackBorders(ctx, this.selectedLayout.element.filmStack, this.getPaperSize());
      ctx.restore();

      // シート角丸
      if (0 < this.selectedLayout.element.visibility) {
        this.drawSheet(ctx, this.selectedLayout.corners);
      }

      // 選択枠
      if (this.selectedLayout.element.visibility === 0) {
        drawSelectionFrame(ctx, "rgba(0, 128, 255, 1)", this.selectedLayout.corners, 1, 2, false);
      } else {
        drawSelectionFrame(ctx, "rgba(0, 128, 255, 1)", this.selectedLayout.corners);
      }

      this.renderProceduralHandles(ctx);
      this.frameIcons.forEach(icon => icon.render(ctx));
    }
  }

  renderOtheers(ctx: CanvasRenderingContext2D, depth: number): void {
    function fillTrapezoid(corners: Trapezoid, color: string) {
      ctx.fillStyle = color;
      ctx.beginPath();
      trapezoidPath(ctx, corners);
      ctx.fill();
    }

    function strokeTrapezoid(corners: Trapezoid, color: string, width: number) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      trapezoidPath(ctx, corners);
      ctx.stroke();
    }

    function strokeConnectors(corners0: Trapezoid, corners1: Trapezoid, color: string, width: number) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (let position of trapezoidCorners) {
        ctx.beginPath();
        ctx.moveTo(...corners0[position]);
        ctx.lineTo(...corners1[position]);
        ctx.stroke();
      }
    }

    if (this.litPadding) {
      fillTrapezoid(this.litPadding.corners, "rgba(200,200,0, 0.7)");
    }

    if (this.litBorder) {
      const corners = this.litBorder.corners;
      const canvasPath = getTrapezoidPath(corners, BORDER_MARGIN, true);

      // 線のスタイルを設定して描画
      ctx.fillStyle = "rgba(0, 200, 200, 0.2)";
      ctx.fill(canvasPath);
    } else if (this.litLayout) {
      if (this.litLayout.element != this.selectedLayout?.element) {
        fillTrapezoid(this.litLayout.corners, "rgba(0, 0, 255, 0.2)");
        strokeTrapezoid(this.litLayout.formalCorners, "rgba(0, 0, 255, 0.4)", 1);
        strokeTrapezoid(this.litLayout.corners, "rgba(192, 192, 255, 1)", 3);
        strokeConnectors(this.litLayout.corners, this.litLayout.formalCorners, "rgba(0, 0, 255, 0.4)", 1);
      }

      this.litIcons.forEach(icon => icon.render(ctx));
    }
  }

  calculateSheetRect(corners: Trapezoid): Rect {
    return calculateSheetRect(trapezoidBoundingRect(corners), [320, 320], SHEET_Y_MARGIN, this.paper.rscale);
  }

  drawSheet(ctx: CanvasRenderingContext2D, corners: Trapezoid) {
    drawSheet(ctx, corners, this.calculateSheetRect(corners), "rgba(64, 64, 128, 0.7)");
  }

  private getProceduralFilmTarget(): Film | null {
    if (!this.selectedLayout) { return null; }
    const films = this.selectedLayout.element.filmStack.films;
    if (!films || films.length === 0) { return null; }

    const proceduralFilms = films.filter(film => film.isProcedural() && film.visible);
    if (proceduralFilms.length === 0) { return null; }

    const selectedProcedural = proceduralFilms.filter(film => film.selected);
    const anySelected = films.some(film => film.selected);

    if (selectedProcedural.length === 1) {
      return selectedProcedural[0];
    }

    if (!anySelected) {
      return proceduralFilms[0];
    }

    return null;
  }

  private getProceduralFilmContext(): ProceduralHandleContext | null {
    if (!this.selectedLayout) { return null; }
    const film = this.getProceduralFilmTarget();
    if (!film) { return null; }

    const paperSize = this.getPaperSize();
    const matrix = film.makeMatrix(paperSize);
    matrix.scaleSelf(film.reverse[0], film.reverse[1]);
    const inverseMatrix = matrix.inverse();

    const frameCenter = trapezoidCenter(this.selectedLayout.corners);
    const [contentWidth, contentHeight] = film.getContentSize(paperSize);
    const baseSize = Math.max(contentWidth, contentHeight);

    return {
      film,
      layout: this.selectedLayout,
      frameCenter,
      matrix,
      inverseMatrix,
      baseSize,
    };
  }

  private filmLocalToWorld(context: ProceduralHandleContext, local: Vector): Vector {
    const point = context.matrix.transformPoint(new DOMPoint(local[0], local[1]));
    return [point.x + context.frameCenter[0], point.y + context.frameCenter[1]];
  }

  private filmWorldToLocal(context: ProceduralHandleContext, world: Vector): Vector {
    const relative: Vector = [world[0] - context.frameCenter[0], world[1] - context.frameCenter[1]];
    const point = context.inverseMatrix.transformPoint(new DOMPoint(relative[0], relative[1]));
    return [point.x, point.y];
  }

  private prepareProceduralHandleIcons(): ProceduralHandleState | null {
    const context = this.getProceduralFilmContext();
    if (!context) {
      this.proceduralHandleState = null;
      return null;
    }

    const effect = context.film.proceduralEffect;
    if (!effect) {
      this.proceduralHandleState = null;
      return null;
    }

    const icons: ClickableIcon[] = [];
    const worldPositions: ProceduralHandleState['worldPositions'] = {
      filmCenter: this.filmLocalToWorld(context, [0, 0]),
    };

    if (effect.type === 'motion-lines') {
      const focalPointLocal = readVectorParam(effect, 'focalPoint', [0, 0]);
      const defaultRange: Vector = [0, context.baseSize * 0.25];
      const focalRangeLocal = readVectorParam(effect, 'focalRange', defaultRange);
      const focalPointWorld = this.filmLocalToWorld(context, focalPointLocal);
      const rangeWorld = this.filmLocalToWorld(context, [focalPointLocal[0] + focalRangeLocal[0], focalPointLocal[1] + focalRangeLocal[1]]);

      this.proceduralOptionIcons.circle.position = focalPointWorld;
      this.proceduralOptionIcons.radius.position = rangeWorld;

      icons.push(this.proceduralOptionIcons.circle, this.proceduralOptionIcons.radius);
      worldPositions.focalPoint = focalPointWorld;
      worldPositions.focalRange = rangeWorld;
    } else if (effect.type === 'speed-lines') {
      const tailTipLocal = readVectorParam(effect, 'tailTip', [context.baseSize * 0.25, 0]);
      const tailMidParam = readVectorParam(effect, 'tailMid', [0.5, 0]);
      const tailTipWorld = this.filmLocalToWorld(context, tailTipLocal);
      const tailMidLocal = tailCoordToWorldCoord([0, 0], tailTipLocal, tailMidParam);
      const tailMidWorld = this.filmLocalToWorld(context, tailMidLocal);

      this.proceduralOptionIcons.tail.position = tailTipWorld;
      this.proceduralOptionIcons.curve.position = tailMidWorld;

      icons.push(this.proceduralOptionIcons.tail, this.proceduralOptionIcons.curve);
      worldPositions.tailTip = tailTipWorld;
      worldPositions.tailMid = tailMidWorld;
    }

    if (icons.length === 0) {
      this.proceduralHandleState = null;
      return null;
    }

    const state: ProceduralHandleState = {
      context,
      type: effect.type,
      icons,
      worldPositions,
    };
    this.proceduralHandleState = state;
    return state;
  }

  private renderProceduralHandles(ctx: CanvasRenderingContext2D): void {
    const state = this.prepareProceduralHandleIcons();
    if (!state) { return; }

    const { icons, worldPositions } = state;

    if (this.proceduralOptionEditActive.focal && worldPositions.focalPoint && worldPositions.focalRange) {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 255, 0.3)";
      ctx.beginPath();
      ctx.moveTo(worldPositions.focalPoint[0], worldPositions.focalPoint[1]);
      ctx.lineTo(worldPositions.focalRange[0], worldPositions.focalRange[1]);
      ctx.stroke();
      ctx.restore();
    }

    if (this.proceduralOptionEditActive.tail && worldPositions.tailTip && worldPositions.filmCenter) {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 255, 0.3)";
      ctx.beginPath();
      ctx.moveTo(worldPositions.filmCenter[0], worldPositions.filmCenter[1]);
      ctx.lineTo(worldPositions.tailTip[0], worldPositions.tailTip[1]);
      ctx.stroke();
      if (worldPositions.tailMid) {
        ctx.beginPath();
        ctx.moveTo(worldPositions.tailTip[0], worldPositions.tailTip[1]);
        ctx.lineTo(worldPositions.tailMid[0], worldPositions.tailMid[1]);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const icon of icons) {
      icon.render(ctx);
    }
  }

  dropped(position: Vector, media: HTMLCanvasElement | HTMLVideoElement | string): boolean {
    if (!this.interactable) { return false; }

    let layoutlet = this.findReceiverLayout(position);
    if (!layoutlet) { return false; }

    if (media instanceof HTMLCanvasElement) {
      this.importMedia(layoutlet.element, new ImageMedia(media));
    }
    if (media instanceof HTMLVideoElement) {
      this.importMedia(layoutlet.element, new VideoMedia(media));
      if (this.selectedLayout?.element === layoutlet.element) {
        this.startVideo(layoutlet);
      }
    }
    this.onFocus(layoutlet);
    this.onCommit();
    return true;
  }

  pasted(position: Vector, media: HTMLCanvasElement | HTMLVideoElement | string): boolean {
    console.log("PASTED", position, media)

    let layoutlet = this.findReceiverLayout(position);
    if (!layoutlet) { 
      if (this.selectedLayout) {
        layoutlet = this.selectedLayout;
      } else {
        layoutlet = this.calculateRootLayout();
        while (layoutlet && layoutlet.children && layoutlet.children.length > 0) {
          layoutlet = layoutlet.children[0];
        }
      }
    }
    if (!layoutlet) { return false; }

    if (media instanceof HTMLCanvasElement) {
      this.importMedia(layoutlet.element, new ImageMedia(media));
    }

    this.onFocus(layoutlet);
    this.onCommit();
    return true;
  }

  findReceiverLayout(position: Vector): Layout | null {
    if (!this.interactable) { return null; }

    if (this.selectedLayout) {
      const r = this.calculateSheetRect(this.selectedLayout.corners);
      if (rectContains(r, position)) {
        return this.selectedLayout;
      }
    }

    const layout = this.calculateRootLayout();
    return findLayoutAt(layout, position, PADDING_HANDLE_OUTER_WIDTH);
  }

  pointerHover(position: Vector, depth: number): Layer | null {
    this.cursorPosition = position;
    if (depth === 2) {
      return this.pointerHoverSelected(position);
    } else {
      return this.pointerHoverOthers(position);
    }
  }

  pointerHoverSelected(position: Vector): Layer | null {
    const hintIfContains = (a: ClickableSlate[]): boolean => {
      for (let e of a) {
        if (e.hintIfContains(position, this.hint)) {
          return true;
        }
      }
      return false;
    }

    if (this.selectedBorder) {
      if (hintIfContains(this.borderIcons)) {
        return this;
      }
      if (isPointInTrapezoid(position, this.selectedBorder.corners)) {
        this.hint([...trapezoidCenter(this.selectedBorder.corners), 0, 0], "hint.frame.dragToMove");
        this.litBorder = this.selectedBorder;
        return this;
      }
    }
    if (this.selectedLayout) {
      const r = this.calculateSheetRect(this.selectedLayout.corners);
      if (hintIfContains(this.frameIcons)) {
        return this;
      }

      const proceduralState = this.prepareProceduralHandleIcons();
      if (proceduralState) {
        for (const icon of proceduralState.icons) {
          if (icon.hintIfContains(position, this.hint)) {
            return this;
          }
        }
      }

      if (rectContains(r, position)) {
        if (pointToQuadrilateralDistance(position, this.selectedLayout.corners, false) < PADDING_HANDLE_OUTER_WIDTH) {
          const padding = findPaddingOn(this.selectedLayout, position, PADDING_HANDLE_INNER_WIDTH, PADDING_HANDLE_OUTER_WIDTH);
          this.litPadding = padding;
          if (padding) {
            this.hint(r, "hint.frame.dragToChangePadding");
            return this;
          }           
        }
        this.litLayout = this.selectedLayout;
        return this;
      } else {
        this.litPadding = null;
      }
    }
    return null;
  }

  pointerHoverOthers(position: Vector): Layer | null {
    const rootLayout = this.calculateRootLayout();

    const border = findBorderAt(rootLayout, position, BORDER_MARGIN);
    if (border != this.litBorder) { this.redraw(); }
    this.litBorder = border;
    if (border) {
      if (isPointInTrapezoid(position, border.corners)) {
        this.hint([...trapezoidCenter(border.corners), 0, 0], "hint.frame.clickToSelect");
      }
      return this;
    }
    const layout = findLayoutAt(rootLayout, position, PADDING_HANDLE_OUTER_WIDTH);
    if (layout != this.litLayout) { this.redraw(); }
    this.litLayout = layout;
    if (layout) {
      this.relayoutLitIcons(layout);
      if (this.swapIcon.hintIfContains(position, this.hint)) {
        return this;
      }
      if (0 < layout.element.visibility) {
        const r = trapezoidBoundingRect(layout.corners);
        this.hint(r, "hint.frame.dropImage");
      }
      return this;
    }

    return null;
  }

  pointerUnhover(litLayer: Layer): void {
    if (litLayer === this) { return; }
    if (this.litLayout || this.litBorder) {
      this.litLayout = null;
      this.litBorder = null;
      this.redraw();
    }
  }

  pick(point: Vector): Picked[] {
    const layout = this.calculateRootLayout();
    return listLayoutsAt(layout, point, PADDING_HANDLE_OUTER_WIDTH).map(
      layout => {
        return {
          selected: layout.element === this.selectedLayout?.element,
          action: () => this.selectLayout(layout),
        };
      });
  }

  accepts(point: Vector, button: number, depth: number): any {
    if (!this.interactable) {return null;}

    if (depth == 2) {
      const q = this.acceptsForeground(point, button);
      return q;
    } else {
      const q = this.acceptsBackground(point, button);
      return q;
    }
  }

  acceptsForeground(point: Vector, _button: number): any {
    if (keyDownFlags["KeyT"]) {
      if (this.litBorder) {
        return { action: "transpose-border", border: this.litBorder };
      }
      return null;
    }

    if (this.selectedLayout) {
      const q = this.acceptsOnSelectedFrameIcons(point);
      if (q) {
        return q;
      }

      const proceduralAction = this.acceptsProceduralHandles(point);
      if (proceduralAction) {
        return proceduralAction;
      }

      if (this.selectedLayout.element.visibility === 0) {
        if (pointToQuadrilateralDistance(point, this.selectedLayout.corners, false) < PADDING_HANDLE_OUTER_WIDTH) {
          return { action: "pierce" };
        }
      } else {
        const r = this.calculateSheetRect(this.selectedLayout.corners);

        if (rectContains(r, point)) {
          if (this.litPadding) {
            return { action: "move-padding", padding: this.litPadding };
          }
          if (this.selectedLayout.element.filmStack.films.length !== 0) {
            if (keyDownFlags["ControlLeft"] || keyDownFlags["ControlRight"]) {
              return { action: "scale", layout: this.selectedLayout };
            } else if (keyDownFlags["AltLeft"] || keyDownFlags["AltRight"]) {
              return { action: "rotate", layout: this.selectedLayout };
            } else {
              return { action: "translate", layout: this.selectedLayout };
            }
          } else {
            return { action: "pierce" };
          }
        }

        if (this.litLayout && this.litLayout.element != this.selectedLayout.element) {
          if (this.swapIcon.contains(point)) {
            return { action: "swap", element0: this.selectedLayout.element, element1: this.litLayout.element };
          }
        }
      }
      return null;
    }

    // 選択ボーダー操作
    if (this.selectedBorder) {
      const r = this.acceptsOnSelectedBorder(point);
      if (r) {
        return r;
      }
    }
    return null;
  }

  acceptsOnSelectedBorder(p: Vector): any {
    if (
      keyDownFlags["ControlLeft"] || keyDownFlags["ControlRight"] ||
      this.expandHorizontalIcon.contains(p) ||this.expandVerticalIcon.contains(p)) {
      return { action: "expand-border" , border: this.selectedBorder };
    } else if (
      keyDownFlags["ShiftLeft"] || keyDownFlags["ShiftRight"] ||
      this.slantHorizontalIcon.contains(p) || this.slantVerticalIcon.contains(p)) {
      return { action: "slant-border" , border: this.selectedBorder};
    } else if (keyDownFlags["KeyT"]) {
      return { action: "transpose-border", border: this.selectedBorder };
    } else if (
      this.insertHorizontalIcon.contains(p) || this.insertVerticalIcon.contains(p)) {
      return { action: "insert", border: this.selectedBorder };
    } else if (
      this.deleteHorizontalIcon.contains(p) || this.deleteVerticalIcon.contains(p)) {
      return { action: "delete-border", border: this.selectedBorder };
    } else if (pointToQuadrilateralDistance(p, this.selectedBorder!.corners, false) < BORDER_MARGIN) {
      return { action: "move-border" , border: this.selectedBorder };
    }
    return null;
  }

  acceptsOnSelectedFrameIcons(point: Vector): any {
    const layout = this.selectedLayout;
    if (this.splitHorizontalIcon.contains(point)) {
      return { action: "split-horizontal", layout: layout };
    }
    if (this.splitVerticalIcon.contains(point)) {
      return { action: "split-vertical", layout: layout };
    }
    if (this.deleteIcon.contains(point)) {
      return { action: "erase", layout: layout };
    }
    if (this.duplicateIcon.contains(point)) {
      return { action: "duplicate", layout: layout };
    }
    if (this.shiftIcon.contains(point)) {
      return { action: "shift", layout: layout };
    }
    if (this.unshiftIcon.contains(point)) {
      return { action: "unshift", layout: layout };
    }
    if (this.resetPaddingIcon.contains(point)) {
      return { action: "reset-padding", layout: layout };
    }
    if (this.zplusIcon.contains(point)) {
      return { action: "zplus", layout: layout };
    }
    if (this.zminusIcon.contains(point)) {
      return { action: "zminus", layout: layout };
    }
    if (this.visibilityIcon.contains(point)) {
      return { action: "visibility", layout: layout };
    }
    if (this.scribbleIcon.contains(point)) {
      return { action: "scribble", layout: layout };
    } 
    if (this.flipHorizontalIcon.contains(point)) {
      return { action: "flip-horizontal", layout: layout };
    } 
    if (this.flipVerticalIcon.contains(point)) {
      return { action: "flip-vertical", layout: layout };
    } 
    if (this.fitIcon.contains(point)) {
      return { action: "fit", layout: layout };
    } 
    if (this.scaleIcon.contains(point)) {
      return { action: "scale", layout: layout };
    }
    if (this.rotateIcon.contains(point)) {
      return { action: "rotate", layout: layout };
    }
    return null;
  }

  private acceptsProceduralHandles(point: Vector): any {
    const state = this.prepareProceduralHandleIcons();
    if (!state) { return null; }

    if (state.type === 'motion-lines') {
      if (this.proceduralOptionIcons.circle.contains(point)) {
        return { action: 'procedural-focalPoint', state };
      }
      if (this.proceduralOptionIcons.radius.contains(point)) {
        return { action: 'procedural-focalRange', state };
      }
    } else if (state.type === 'speed-lines') {
      if (this.proceduralOptionIcons.tail.contains(point)) {
        return { action: 'procedural-tailTip', state };
      }
      if (this.proceduralOptionIcons.curve.contains(point)) {
        return { action: 'procedural-tailMid', state };
      }
    }

    return null;
  }

  acceptsBackground(point: Vector, _button: number): any {
    const layout = this.calculateRootLayout();

    const border = findBorderAt(layout, point, BORDER_MARGIN);
    if (border) {
      return { action: "select-border", border: border };
    }

    const layoutlet = findLayoutAt(layout, point, PADDING_HANDLE_OUTER_WIDTH, null);
    if (layoutlet) {
      const r = this.acceptsOnFrame(layoutlet);
      if (r) {
        return r;
      }
    }

    this.selectLayout(null);
    this.redraw();
    return null; 
  }

  acceptsOnFrame(layout: Layout): any {
    if (keyDownFlags["KeyQ"]) {
      return { action: "erase", layout: layout };
    }
    if (keyDownFlags["KeyW"]) {
      return { action: "split-horizontal", layout: layout };
    }
    if (keyDownFlags["KeyS"]) {
      return { action: "split-vertical", layout: layout };
    }
    if (keyDownFlags["KeyD"]) {
      return { action: "discard-films", layout: layout };
    }
    if (keyDownFlags["KeyT"]) {
      return { action: "flip-horizontal", layout: layout };
    }
    if (keyDownFlags["KeyY"]) {
      return { action: "flip-vertical", layout: layout };
    }
    if (keyDownFlags["KeyE"]) {
      return { action: "fit", layout: layout };
    }
    return { action: "select", layout: layout };
  }

  changeFocus(layer: Layer | null) {
    if (layer != this) {
      if (this.selectedLayout || this.selectedBorder) {
        this.stopVideo(this.selectedLayout);
        this.selectedBorder = null;
        this.doSelectLayout(null);
      }
    }
  }

  async *pointer(p: Vector, payload: any) {
    switch (payload.action) {
      case "transpose-border":
        this.transposeBorder(this.litBorder!);
        break;
      case "swap":
        this.swapContent(payload.element0, payload.element1);
        break;
  
      case "move-padding":
        yield* this.expandPadding(p, payload.padding);
        break;
      case "reset-padding":
        this.resetPadding();
        this.onCommit();
        this.redraw();
        return "done";

      case "select-border":
        this.selectLayout(null);
        this.selectedBorder = payload.border;
        this.relayoutBorderIcons(payload.border);
        this.redraw();
        break;
      case "expand-border":
        yield* this.expandBorder(p, payload.border);
        break;
      case "slant-border":
        yield* this.slantBorder(p, payload.border);
        break;
      case "move-border":
        yield* this.moveBorder(p, payload.border);
        break;

      case "select":
        this.selectedBorder = null;
        this.selectLayout(payload.layout);
        this.relayoutIcons();
        this.redraw();
        break;
      case "split-horizontal":
        FrameElement.splitElementHorizontal(
          this.frameTree,
          payload.layout.element
        );
        this.litLayout = null;
        this.selectLayout(null);
        this.onCommit();
        this.redraw();
        break;
      case "split-vertical":
        FrameElement.splitElementVertical(
          this.frameTree,
          payload.layout.element
        );
        this.litLayout = null;
        this.selectLayout(null);
        this.onCommit();
        this.redraw();
        break;
      case "erase":
        FrameElement.eraseElement(this.frameTree, payload.layout.element);
        this.litLayout = null;
        this.selectLayout(null);
        this.onCommit();
        this.redraw();
        break;
      case "duplicate":
        FrameElement.duplicateElement(this.frameTree, payload.layout.element);
        this.litLayout = null;
        this.selectLayout(null);
        this.onCommit();
        this.redraw();
        break;
      case "shift":
        this.onShift(payload.layout.element);
        this.redraw();
        break;
      case "unshift":
        this.onUnshift(payload.layout.element);
        this.redraw();
        break;
      case "insert":
        this.onInsert(this.selectedBorder!);
        this.selectedBorder = null;
        break;
      case "delete-border":
        this.deleteBorder(this.selectedBorder!);
        this.selectedBorder = null;
        break;

      case "zplus":
        payload.layout.element.z += 1;
        this.onCommit();
        this.redraw();
        break;
      case "zminus":
        payload.layout.element.z -= 1;
        this.onCommit();
        this.redraw();
        break;
      case "visibility":
        this.visibilityIcon.increment();
        payload.layout.element.visibility = this.visibilityIcon.index;
        this.onCommit();
        this.redraw();
        break;


      case "scribble":
        this.onScribble(payload.layout.element);
        this.redraw();
        break;
      case "flip-horizontal":
        payload.layout.element.filmStack.films.forEach((film: Film) => {
          film.reverse[0] *= -1;
        });
        this.redraw();
        break;
      case "flip-vertical":
        payload.layout.element.filmStack.films.forEach((film: Film) => {
          film.reverse[1] *= -1;
        });
        this.redraw();
        break;
      case "fit":
        const paperSize = this.getPaperSize();
        const transformer = new FilmStackTransformer(paperSize, payload.layout.element.filmStack.getOperationTargetFilms());
        transformer.scale(0.01);
        constraintLeaf(paperSize, payload.layout);
        this.onCommit();
        this.redraw();
        break;
      case "discard-films":
        payload.layout.element.filmStack.films = [];
        this.redraw();
        break;

      case "scale":
        yield* this.scaleImage(p, payload.layout);
        break;
      case "rotate":
        yield* this.rotateImage(p, payload.layout);
        break;
      case "translate":
        yield* this.translateImage(p, payload.layout);
        break;

      case 'procedural-focalPoint':
        yield* this.adjustProceduralFocalPoint(p, payload.state as ProceduralHandleState);
        break;
      case 'procedural-focalRange':
        yield* this.adjustProceduralFocalRange(p, payload.state as ProceduralHandleState);
        break;
      case 'procedural-tailTip':
        yield* this.adjustProceduralTailTip(p, payload.state as ProceduralHandleState);
        break;
      case 'procedural-tailMid':
        yield* this.adjustProceduralTailMid(p, payload.state as ProceduralHandleState);
        break;

      case "ignore":
        break;
      case "pierce":
        this.pierce();
        break;

      default:
        console.error("unknown action", payload.action);
    }
  }

  *scaleImage(p: Vector, layout: Layout) {
    const paperSize = this.getPaperSize();
    const element = layout.element;
    const films = element.filmStack.getOperationTargetFilms();

    try {
      const transformer = new FilmStackTransformer(paperSize, films);

      yield* scale(this.getPaperSize(), p, (q: Vector) => {
        transformer.scale(Math.max(q[0], q[1]))
        if (keyDownFlags["ShiftLeft"] || keyDownFlags["ShiftRight"]) {
          constraintLeaf(paperSize, layout);
        }
        this.redraw();
      });
      this.onCommit();
    } catch (e) {
      if (e === "cancel") {
        this.onRevert();
      }
    }
  }

  *rotateImage(p: Vector, layout: Layout) {
    const paperSize = this.getPaperSize();
    const element = layout.element;
    const films = element.filmStack.getOperationTargetFilms();

    try {
      const transformer = new FilmStackTransformer(paperSize, films);

      yield* rotate(p, (q: number) => {
        transformer.rotate(q*-0.2);
        if (keyDownFlags["ShiftLeft"] || keyDownFlags["ShiftRight"]) {
          constraintLeaf(paperSize, layout);
        }
        this.redraw();
      });
      this.onCommit();
    } catch (e) {
      if (e === "cancel") {
        this.onRevert();
      }
    }
  }

  *translateImage(p: Vector, layout: Layout) {
    // クリック判定と兼用
    const startingTime = performance.now();

    const paperSize = this.getPaperSize();
    const element = layout.element;
    const films = element.filmStack.getOperationTargetFilms();
    const origins = films.map(film => film.getShiftedTranslation(paperSize));

    try {
      let lastq = null;
      yield* translate(p, (q: Vector) => {
        lastq = [...q];
        films.forEach((film, i) => {
          film.setShiftedTranslation(paperSize, [origins[i][0] + q[0], origins[i][1] + q[1]]);
        });
        if (keyDownFlags["ShiftLeft"] || keyDownFlags["ShiftRight"]) {
          constraintLeaf(paperSize, layout);
        }
        this.redraw();
      });
      if (lastq![0] !== 0 || lastq![1] !== 0) {
        this.onCommit();
      }
    } catch (e) {
      if (e === "cancel") {
        this.onRevert();
      }
    }

    if (performance.now() - startingTime < 200) {
      // クリック判定
      this.pierce();
    }
  }

  *moveBorder(p: Vector, border: Border) {
    const layout = border.layout;
    const index = border.index;

    let i0 = index - 1;
    let i1 = index;
    if (layout.dir === "h") {[i0, i1] = [i1, i0];}

    const child0 = layout.children![i0];
    const child1 = layout.children![i1];

    const c0 = child0.element;
    const c1 = child1.element;
    const rawSpacing = layout.children![index-1].element.divider.spacing; // dont use i0
    const rawSum = c0.rawSize + rawSpacing + c1.rawSize;

    function getRect(): Rect {
      return box2Rect([child0.origin, add2D(child1.origin, child1.size)]);
    }

    function getBalance(p: Vector) {
      const r = getRect();
      // 0.0 - 1.0, 0.0: top or left of box0, 1.0: right or bottom of box1
      if (layout.dir == "h") {
        return (p[0] - r[0]) / r[2];
      } else {
        const r = getRect();
        return (p[1] - r[1]) / r[3];
      }
    }

    try {
      const s: Vector = p;
      let q = p;
      const startBalance = (c0.rawSize + rawSpacing * 0.5) / rawSum;
      const delta = getBalance(p) - startBalance;
      while ((p = yield)) {
        const balance = getBalance(p) - delta;
        const t = balance * rawSum;
        c0.rawSize = t - rawSpacing * 0.5;
        c1.rawSize = rawSum - t - rawSpacing * 0.5;
        this.updateBorder(border);
        this.redraw();
        q = p;
      }
      if (!vectorEquals(s, q)) {
        this.onCommit();  
      }
    } catch (e) {
      if (e === 'cancel') {
        this.onRevert();
      }
    }
  }

  *adjustProceduralFocalPoint(p: Vector, state: ProceduralHandleState) {
    const effect = state.context.film.proceduralEffect;
    if (!effect || effect.type !== 'motion-lines') { return; }

    const startValue = readVectorParam(effect, 'focalPoint', [0, 0]);
    const startPointerLocal = this.filmWorldToLocal(state.context, p);
    let changed = false;

    this.proceduralOptionEditActive.focal = true;
    try {
      while ((p = yield)) {
        const currentLocal = this.filmWorldToLocal(state.context, p);
        const delta: Vector = [currentLocal[0] - startPointerLocal[0], currentLocal[1] - startPointerLocal[1]];
        effect.params.focalPoint = [startValue[0] + delta[0], startValue[1] + delta[1]];
        changed = true;
        this.redraw();
      }
    } catch (e) {
      if (e === 'cancel') {
        effect.params.focalPoint = [...startValue] as Vector;
        changed = false;
        this.redraw();
      } else {
        throw e;
      }
    } finally {
      this.proceduralOptionEditActive.focal = false;
      if (changed) {
        this.onCommit();
      }
      this.redraw();
    }
  }

  *adjustProceduralFocalRange(p: Vector, state: ProceduralHandleState) {
    const effect = state.context.film.proceduralEffect;
    if (!effect || effect.type !== 'motion-lines') { return; }

    const startFocal = readVectorParam(effect, 'focalPoint', [0, 0]);
    const defaultRange: Vector = [0, state.context.baseSize * 0.25];
    const startRange = readVectorParam(effect, 'focalRange', defaultRange);
    const startPointerLocal = this.filmWorldToLocal(state.context, p);
    const maxRadius = Math.hypot(state.context.baseSize * 0.5, state.context.baseSize * 0.5);
    let changed = false;

    this.proceduralOptionEditActive.focal = true;
    try {
      while ((p = yield)) {
        const currentLocal = this.filmWorldToLocal(state.context, p);
        const delta: Vector = [currentLocal[0] - startPointerLocal[0], currentLocal[1] - startPointerLocal[1]];
        let nextRange: Vector = [startRange[0] + delta[0], startRange[1] + delta[1]];
        const magnitude = Math.hypot(nextRange[0], nextRange[1]);
        if (Number.isFinite(magnitude) && magnitude > maxRadius) {
          const scale = maxRadius / magnitude;
          nextRange = [nextRange[0] * scale, nextRange[1] * scale];
        }
        effect.params.focalRange = nextRange;
        changed = true;
        this.redraw();
      }
    } catch (e) {
      if (e === 'cancel') {
        effect.params.focalRange = [...startRange] as Vector;
        changed = false;
        this.redraw();
      } else {
        throw e;
      }
    } finally {
      this.proceduralOptionEditActive.focal = false;
      if (changed) {
        this.onCommit();
      }
      this.redraw();
    }
  }

  *adjustProceduralTailTip(p: Vector, state: ProceduralHandleState) {
    const effect = state.context.film.proceduralEffect;
    if (!effect || effect.type !== 'speed-lines') { return; }

    const startTip = readVectorParam(effect, 'tailTip', [state.context.baseSize * 0.25, 0]);
    const startPointerLocal = this.filmWorldToLocal(state.context, p);
    const maxLength = state.context.baseSize;
    let changed = false;

    this.proceduralOptionEditActive.tail = true;
    try {
      while ((p = yield)) {
        const currentLocal = this.filmWorldToLocal(state.context, p);
        let nextTip: Vector = [startTip[0] + currentLocal[0] - startPointerLocal[0], startTip[1] + currentLocal[1] - startPointerLocal[1]];
        const length = Math.hypot(nextTip[0], nextTip[1]);
        if (Number.isFinite(length) && length > maxLength) {
          const scale = maxLength / length;
          nextTip = [nextTip[0] * scale, nextTip[1] * scale];
        }
        effect.params.tailTip = nextTip;
        changed = true;
        this.redraw();
      }
    } catch (e) {
      if (e === 'cancel') {
        effect.params.tailTip = [...startTip] as Vector;
        changed = false;
        this.redraw();
      } else {
        throw e;
      }
    } finally {
      this.proceduralOptionEditActive.tail = false;
      if (changed) {
        this.onCommit();
      }
      this.redraw();
    }
  }

  *adjustProceduralTailMid(p: Vector, state: ProceduralHandleState) {
    const effect = state.context.film.proceduralEffect;
    if (!effect || effect.type !== 'speed-lines') { return; }

    const tailTip = readVectorParam(effect, 'tailTip', [state.context.baseSize * 0.25, 0]);
    const startMid = readVectorParam(effect, 'tailMid', [0.5, 0]);
    let changed = false;

    this.proceduralOptionEditActive.tail = true;
    try {
      while ((p = yield)) {
        const currentLocal = this.filmWorldToLocal(state.context, p);
        const nextMid = worldCoordToTailCoord([0, 0], tailTip, currentLocal);
        effect.params.tailMid = [nextMid[0], nextMid[1]];
        changed = true;
        this.redraw();
      }
    } catch (e) {
      if (e === 'cancel') {
        effect.params.tailMid = [...startMid] as Vector;
        changed = false;
        this.redraw();
      } else {
        throw e;
      }
    } finally {
      this.proceduralOptionEditActive.tail = false;
      if (changed) {
        this.onCommit();
      }
      this.redraw();
    }
  }

  *expandBorder(p: Vector, border: Border) {
    const element = border.layout.element;
    const dir = border.layout.dir == "h" ? 0 : 1;
    const prev = border.layout.children![border.index-1].element;
    const curr = border.layout.children![border.index].element;
    const startSpacing = prev.divider.spacing;
    const s = p;
    const startPrevRawSize = prev.rawSize;
    const startCurrRawSize = curr.rawSize;
    const factor = 0.005 * (startPrevRawSize + startCurrRawSize) * border.layout.size[dir] / this.getPaperSize()[dir];

    try {
      while ((p = yield)) {
        const op = p[dir] - s[dir];
        prev.divider.spacing = Math.max(0, startSpacing + op * factor * 0.1);
        const diff = prev.divider.spacing - startSpacing;
  
        prev.rawSize = startPrevRawSize - diff*0.5;
        curr.rawSize = startCurrRawSize - diff*0.5;
  
        element.calculateLengthAndBreadth();
        this.updateBorder(border);
        this.redraw();
      }
    } catch (e) {
      if (e === 'cancel') {
        this.onRevert();
      }
    }

    this.onCommit();
  }

  *slantBorder(p: Vector, border: Border) {
    const dir = border.layout.dir == "h" ? 0 : 1;
    const prev = border.layout.children![border.index-1].element;
    const rawSlant = prev.divider.slant;

    const s = p;
    try {
      while ((p = yield)) {
        const op = p[dir] - s[dir];
        let newSlant = rawSlant + op * 0.2;
        if (keyDownFlags["AltLeft"] || keyDownFlags["AltRight"]) {
          newSlant = Math.round(newSlant / 15) * 15;
        }
        prev.divider.slant = Math.max(-42, Math.min(42, newSlant));
        this.updateBorder(border);
        this.redraw();
      }
    } catch (e) {
      if (e === 'cancel') {
        this.onRevert();
      }
    }

    this.onCommit();
  }

  *expandPadding(p: Vector, padding: PaddingHandle) {
    const element = padding.layout.element;
    const rawSize = padding.layout.rawSize;
    const corners = padding.layout.corners;
    const handle = padding.handle;

    try {
      if ((rectCornerHandles as string[]).indexOf(handle) !== -1) {
        // padding.handleが角の場合
        const cornerHandle = handle as RectCornerHandle;
        const q = element.cornerOffsets[cornerHandle];
        const s = p;
        while ((p = yield)) {
          const delta = [p[0] - s[0], p[1] - s[1]];
          (element.cornerOffsets as any)[handle] = [q[0] + delta[0] / rawSize[0], q[1] + delta[1] / rawSize[1]];
          this.updateSelectedLayout();
          this.redraw();
        }
      } else {
        // padding.handleが辺の場合
        let c0: RectCornerHandle, c1: RectCornerHandle;
        let direction: string;
        switch (handle) {
          case "top":
            c0 = "topLeft";
            c1 = "topRight";
            direction = "vertical";
            break;
          case "bottom":
            c0 = "bottomLeft";
            c1 = "bottomRight";
            direction = "vertical";
            break;
          case "left":
            c0 = "topLeft";
            c1 = "bottomLeft";
            direction = "horizontal";
            break;
          case "right":
            c0 = "topRight";
            c1 = "bottomRight";
            direction = "horizontal";
            break;
          default:
            throw new Error("unknown handle");
        }

        const offsettedCorners = calculateOffsettedCorners(rawSize, corners, element.cornerOffsets);

        const s = p;
        if (direction === "vertical") {
          const y0 = offsettedCorners[c0][1] - corners[c0][1];
          const y1 = offsettedCorners[c1][1] - corners[c1][1];
          while ((p = yield)) {
            const delta = p[1] - s[1];
            element.cornerOffsets[c0][1] = (y0 + delta) / rawSize[1];
            element.cornerOffsets[c1][1] = (y1 + delta) / rawSize[1];
            this.updateSelectedLayout();
            this.redraw();
          }
        } else {
          const x0 = offsettedCorners[c0][0] - corners[c0][0];
          const x1 = offsettedCorners[c1][0] - corners[c1][0];
          while ((p = yield)) {
            const delta = p[0] - s[0];
            element.cornerOffsets[c0][0] = (x0 + delta) / rawSize[0];
            element.cornerOffsets[c1][0] = (x1 + delta) / rawSize[0];
            this.updateSelectedLayout();
            this.redraw();
          }
        }
      }
  
    } catch (e) {
      if (e === 'cancel') {
        this.onRevert();
      } else {
        console.error(e);
      }
    }

    this.onCommit();
  }

  constraintAll(): void {
    const paperSize = this.getPaperSize();
    const layout = this.calculateRootLayout();
    constraintRecursive(paperSize, layout);
  }

  importMedia(element: FrameElement, media: Media): void {
    const paperSize = this.getPaperSize();
    const film = Film.fromMedia(media);
    insertFrameLayers(this.frameTree, paperSize, element, element.filmStack.films.length, [film]);

    sendMediaToMaterialCollection(media).catch(e => console.error("Auto material collection failed", e));

    this.onCommit();
    this.redraw();
  }

  updateSelectedLayout(): void {
    if (!this.selectedLayout) { return; }
    const rootLayout = this.calculateRootLayout();
    this.selectLayout(findLayoutOf(rootLayout, this.selectedLayout.element));

    if (this.litPadding) {
      const handle = this.litPadding.handle;
      this.litPadding = findPaddingOf(this.selectedLayout, handle, PADDING_HANDLE_INNER_WIDTH, PADDING_HANDLE_OUTER_WIDTH);
    }
  }

  updateBorder(border: Border): void {
    const rootLayout = this.calculateRootLayout();
    const newLayout = findLayoutOf(rootLayout, border.layout.element)!;
    border.layout = newLayout;
    this.updateBorderTrapezoid(border);
  }

  updateBorderTrapezoid(border: Border): void {
    const corners = makeBorderCorners(border.layout, border.index, 0);
    const formalCorners = makeBorderFormalCorners(border.layout, border.index);
    border.corners = corners;
    border.formalCorners = formalCorners;
    this.relayoutBorderIcons(border);
  }

  deleteBorder(border: Border): void {
    FrameElement.deleteBorder(this.frameTree, border.layout.element, border.index);
    this.litLayout = null;
    this.selectLayout(null);
    this.onCommit();
    this.redraw();
  }

  relayoutIcons() {
    if (this.selectedLayout) {
      this.relayoutFrameIcons(this.selectedLayout);
      this.redraw();
    }

    if (this.selectedBorder) {
      this.relayoutBorderIcons(this.selectedBorder);
      this.redraw();
    } 
  }

  relayoutFrameIcons(layout: Layout): void {
    const grid = this.makeGrid(layout);
    const cp = grid.calcPosition.bind(grid);

    this.visibilityIcon.position = cp([0,0],[0,0]);
    this.visibilityIcon.index = layout.element.visibility;
    this.zplusIcon.position = cp([0,0],[1,-0.05]);
    this.zminusIcon.position = cp([0,0],[1,0.9]);
    this.zvalue.position = cp([0,0],[1.025,-0.075]);

    this.deleteIcon.position = cp([1,0],[0,0]);
    this.duplicateIcon.position = cp([1,0],[-1,0]);
    this.shiftIcon.position = cp([1,0],[-2,0]);
    this.unshiftIcon.position = cp([1,0],[-3,0]);
    this.resetPaddingIcon.position = cp([1,0],[-4,0]);

    this.splitHorizontalIcon.position = cp([0,1],[0,0]);
    this.splitVerticalIcon.position = cp([0,1],[1,0]);

    this.scribbleIcon.position = cp([1,1], [-5.5,0]);
    this.flipHorizontalIcon.position = cp([1,1], [-4.5,0]);
    this.flipVerticalIcon.position = cp([1,1], [-3.5,0]);
    this.fitIcon.position = cp([1,1], [-2.5,0]);

    this.scaleIcon.position = cp([1,1],[0,0]);
    this.rotateIcon.position = cp([1,1],[-1,0]);
  }

  makeGrid(layout: Layout) {
    const unit: Vector = scale2D([...iconUnit], this.paper.rscale);
    const grid = new Grid(this.calculateSheetRect(layout.corners), -10, unit)
    return grid;
  }

  relayoutBorderIcons(border: Border): void {
    const bt = border.corners;
    this.slantVerticalIcon.position = [bt.topLeft[0],(bt.topLeft[1] + bt.bottomLeft[1]) * 0.5];
    this.expandVerticalIcon.position = [(bt.topRight[0] + bt.topRight[0]) * 0.5, (bt.topRight[1] + bt.bottomRight[1]) * 0.5];
    this.insertVerticalIcon.position = [bt.topLeft[0]-40,(bt.topLeft[1] + bt.bottomLeft[1]) * 0.5];
    this.deleteVerticalIcon.position = [bt.topLeft[0]-80,(bt.topLeft[1] + bt.bottomLeft[1]) * 0.5];
    this.slantHorizontalIcon.position = [(bt.topLeft[0] + bt.topRight[0]) * 0.5,bt.topLeft[1]];
    this.expandHorizontalIcon.position = [(bt.bottomLeft[0] + bt.bottomRight[0]) * 0.5, (bt.bottomLeft[1] + bt.bottomRight[1]) * 0.5];
    this.insertHorizontalIcon.position = [(bt.topLeft[0] + bt.topRight[0]) * 0.5,bt.topLeft[1]-40];
    this.deleteHorizontalIcon.position = [(bt.topLeft[0] + bt.topRight[0]) * 0.5,bt.topLeft[1]-80];
  }

  relayoutLitIcons(layout: Layout): void {
    const center = lerp2D(layout.corners.topLeft, layout.corners.topRight, 0.5);
    getRectCenter([...layout.origin, ...layout.size]);
    this.swapIcon.position = center;    
  }

  resetPadding(): void {
    if (!this.selectedLayout) { return; }
    const element = this.selectedLayout.element;
    element.cornerOffsets = {
      topLeft: [0, 0],
      topRight: [0, 0],
      bottomLeft: [0, 0],
      bottomRight: [0, 0],
    }
    this.updateSelectedLayout();
    this.redraw();
  }

  swapContent(a: FrameElement, b: FrameElement): void {
    console.log("swap", a, b);
    this.onSwap(a, b);
    this.onCommit();
    this.redraw();
  }

  beforeDoubleClick(p: Vector): boolean {
    for (let e of this.frameIcons) {
      if (e.contains(p)) {
        return true;
      }
    }
    for (let e of this.borderIcons) {
      if (e.contains(p)) {
        return true;
      }
    }
    for (let e of this.litIcons) {
      if (e.contains(p)) {
        return true;
      }
    }
    return false;
  }

  // 基本的には直接呼び出さない
  // changeFocusとselectLayoutからのみ
  doSelectLayout(layout: Layout | null): void {
    if (layout?.element !== this.selectedLayout?.element) {
      this.stopVideo(this.selectedLayout);
      this.startVideo(layout);
    }

    this.selectedLayout = layout;
    this.litPadding = null;
    this.relayoutIcons();
    this.onFocus(layout);
  }

  stopVideo(layout: Layout | null) {
    if (layout) {
      for (const film of layout.element.filmStack.films) {
        if (film.content.kind !== 'media') { continue; }
        film.content.media.player?.pause();
      }
    }
  }

  startVideo(layout: Layout | null) {
    if (!layout) { return; }

    for (const film of layout.element.filmStack.films) {
      if (film.content.kind !== 'media') { continue; }
      if (film.content.media.player) {
        film.content.media.player.play();
      }
    }
    // rAFは中央ループでtick()から発火
  }

  selectLayout(layout: Layout | null): void {
    // 先にFocusKeeperに通知することで、古いFrameLayerのクリアが先に行われる
    this.focusKeeper.setFocus(layout == null ? null : this);
    this.doSelectLayout(layout);
  }

  tick(_now: number): void {
    if (this.selectedLayout) {
      const films = this.selectedLayout.element.filmStack.films;
      for (const film of films) {
        if (film.content.kind !== 'media') { continue; }
        const src = film.content.media.drawSource as any;
        if (src instanceof HTMLVideoElement) {
          if (!src.paused && !src.ended) {
            this.redraw();
            break;
          }
        }
      }
    }
  }

  drawFilmBorders(ctx: CanvasRenderingContext2D, layout: Layout) {
    const element = layout.element;

    const paperSize = this.getPaperSize();
    const [x0, y0, w, h] = trapezoidBoundingRect(layout.corners);
    ctx.save();
    ctx.translate(x0 + w * 0.5, y0 + h * 0.5);
    drawFilmStackBorders(ctx, element.filmStack, paperSize);
    ctx.restore();
  }

  transposeBorder(border: Border): void {
    const target = border.layout.element.children[border.index-1];
    FrameElement.transposeDivider(this.frameTree, target);
    this.onCommit();
    this.litLayout = null;
    this.selectedBorder = null;
    this.litBorder = null;
    this.selectLayout(null);
    this.redraw();
  }

  get interactable(): boolean { return this.mode == null; }

  tearDown() {
    // 選択中のレイアウトの動画を停止
    if (this.selectedLayout) {
      this.stopVideo(this.selectedLayout);
    }

    // 基底クラスのtearDownを呼び出す
    super.tearDown();
  }
}
sequentializePointer(FrameLayer);

// paper.jsをvitest環境で読み込むとエラーが出るようなので
// trapezoid.tsに置けない
// https://github.com/paperjs/paper.js/issues/1805
export function getTrapezoidPath(t: Trapezoid, margin: number, ignoresInverted: boolean): Path2D {
  const [A, B, C, D] = [[...t.topLeft] as Vector, [...t.topRight] as Vector, [...t.bottomRight] as Vector, [...t.bottomLeft] as Vector];

  // PaperOffset.offsetが縮退ポリゴンを正しく扱えていないため、小細工
  let flag = true;
  while (flag) {
    flag = false;
    if (distance2D(A, B) < 0.05) {
      B[0] += 0.1;
      flag = true;
    }
    if (distance2D(B, C) < 0.05) {
      C[1] += 0.1;
      flag = true;
    }
    if (distance2D(C, D) < 0.05) {
      D[0] -= 0.1;
      flag = true;
    }
    if (distance2D(D, A) < 0.05) {
      A[1] -= 0.1;
      flag = true;
    }
  }

  const path = new paper.Path();
  const join = "round";

  try {
    function addTriangle(a: Vector, b: Vector, c: Vector) {
      if (!ignoresInverted || isTriangleClockwise([a, b, c])) {
        path.add(a, b, c);
        path.closed = true;
        return 1;
      }
      return 0;
    }

    // A C
    // |X|
    // D B
    const q = segmentIntersection([A, B], [C, D]);
    if (q) {
      let n = 0;
      n += addTriangle(A, q, D);
      n += addTriangle(C, q, B);
      if (n == 0) { return new Path2D(); }
      try {
        const offsetPath = PaperOffset.offset(path, margin, { join });
        const result = new Path2D(offsetPath.pathData);
        offsetPath.remove();
        return result;
      }
      catch(e) {
  /*
        Sentry.captureException(e, {
          extra: {
            A, B, C, D, margin, ignoresInverted,
          },
        });
  */
        return new Path2D(path.pathData);
      }
    }

    // A-B
    //  X
    // C-D
    const q2 = segmentIntersection([A, D], [B, C]);
    if (q2) {
      let n = 0;
      n += addTriangle(A, B, q2);
      n += addTriangle(q2, C, D);
      if (n == 0) { return new Path2D(); }
      try {
        const offsetPath = PaperOffset.offset(path, margin, { join });
        const result = new Path2D(offsetPath.pathData);
        offsetPath.remove();
        return result;
      }
      catch (e) {
  /*
        Sentry.captureException(e, {
          extra: {
            A, B, C, D, margin, ignoresInverted,
          },
        });
  */
        return new Path2D(path.pathData);
      }
    }

    // A-B
    // | |
    // D-C
    if (ignoresInverted || isTriangleClockwise([A, B, C])) {
      path.add(A, B, C, D);
      path.closed = true;
      try {
        const offsetPath = PaperOffset.offset(path, margin, { join });
        const result = new Path2D(offsetPath.pathData);
        offsetPath.remove();
        return result;
      }
      catch (e) {
  /*
        Sentry.captureException(e, {
          extra: {
            A, B, C, D, margin, ignoresInverted,
          },
        });
  */
        return new Path2D(path.pathData);
      }
    }

    return new Path2D();
  }
  finally {
    path.remove();
  }
}
