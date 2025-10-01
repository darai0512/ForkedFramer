import { type Layer, LayerBase, sequentializePointer, type Picked } from "../system/layeredCanvas";
import { type Vector, subtract2D } from '../tools/geometry/geometry';
import { type Layout, type FrameElement, calculatePhysicalLayout, findLayoutAt } from "../dataModels/frameTree";
import { Bubble } from "../dataModels/bubble";
import type { FocusKeeper } from "../tools/focusKeeper";
import { keyDownFlags } from "../system/keyCache";
import { ClickableIcon } from "../tools/draw/clickableIcon";
import { type FilmStack } from "../dataModels/film";
import { drawSelectionFrame } from "../tools/draw/selectionFrame";
import { rectToTrapezoid } from "../tools/geometry/trapezoid";

export class ViewerLayer extends LayerBase {
  private selected: Layout | Bubble | null = null;
  private playIcon: ClickableIcon;
  private dashPhase: number = 0;
  private lastNow: number | null = null;
  private readonly dashSpeed: number = 10; // px/sec 相当（ゆっくり）
  private readonly showPlayButton: boolean;
  private readonly showDottedBorder: boolean;
  private onVisibilityChangeBound: (() => void) | null = null;

  constructor(
    private frameTree: FrameElement,
    private bubbles: Bubble[],
    private onFocus: (target: Layout | Bubble | null) => void,
    private focusKeeper: FocusKeeper,
    showPlayButton: boolean,
    showDottedBorder: boolean,
  ) {
    super();

    this.playIcon = new ClickableIcon(["viewerLayer/play.webp"],[32,32],[1,1],"再生", () => true, () => this.paper.matrix);

    focusKeeper.subscribe(this.changeFocus.bind(this));

    this.showPlayButton = showPlayButton;
    this.showDottedBorder = showDottedBorder;

    // タブ復帰時に選択中ターゲットの動画再生を確実に再開する
    this.onVisibilityChangeBound = this.onVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
  }

  renderDepths(): number[] { return [0,1]; }

  calculateRootLayout(): Layout {
    return calculatePhysicalLayout(this.frameTree, this.getPaperSize(), [0, 0]);
  }

  render(ctx: CanvasRenderingContext2D, depth: number): void {
    if (depth === 0) {
      const layout = this.calculateRootLayout();

      if (this.interactable) { 
        // クリック可能な領域を可視化(デバッグ用)
        this.renderLayoutRecursive(ctx, layout);
      }
      this.renderFramePlayButtons(ctx, layout);
    }
    if (depth === 1) {
      this.renderBubblePlayButtons(ctx);
    }
  }

  private renderLayoutRecursive(ctx: CanvasRenderingContext2D, layout: Layout): void {
    // レイアウトの境界を描画
    ctx.strokeStyle = 'rgba(0, 200, 200, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...layout.corners.topLeft);
    ctx.lineTo(...layout.corners.topRight);
    ctx.lineTo(...layout.corners.bottomRight);
    ctx.lineTo(...layout.corners.bottomLeft);
    ctx.closePath();
    ctx.stroke();

    // 子レイアウトを再帰的に描画
    layout.children?.forEach(child => {
      this.renderLayoutRecursive(ctx, child);
    });
  }

  private renderFramePlayButtons(ctx: CanvasRenderingContext2D, layout: Layout): void {
    if (this.hasVideo(layout?.element.filmStack)) {
      // 動画枠の点線（ゆっくり回転するマーチングアリ）
      if (this.showDottedBorder) {
        drawSelectionFrame(
          ctx,
          "rgba(128, 128, 128, 1)",
          layout.corners,
          2,
          5,
          false,
          this.dashPhase,
          [20, 20]
        );
      }

      // 再生ボタンを描画
      if (this.showPlayButton) {
        this.playIcon.position = subtract2D(layout.corners.bottomRight, [8,8]);
        this.playIcon.pivot = [1, 1];      
        this.playIcon.shadowColor = "rgba(0, 0, 0, 0.5)";
        this.playIcon.render(ctx);
      }
    }

    // 子レイアウトを再帰的に描画
    layout.children?.forEach(child => {
      this.renderFramePlayButtons(ctx, child);
    });
  }

  private renderBubblePlayButtons(ctx: CanvasRenderingContext2D): void {
    for (const bubble of this.bubbles) {
      if (this.hasVideo(bubble.filmStack)) {
        const paperSize = this.getPaperSize();
        const [x0, y0, w, h] = bubble.getPhysicalRect(paperSize);
        const p: Vector = [x0 + w / 2, y0];

        // 動画フキダシの点線（回転）
        if (this.showDottedBorder) {
          drawSelectionFrame(
            ctx,
            "rgba(128, 128, 128, 1)",
            rectToTrapezoid([x0, y0, w, h]),
            2,
            5,
            false,
            this.dashPhase,
            [20, 20]
          );
        }

        // 再生ボタンを描画
        if (this.showPlayButton) {
          this.playIcon.position = p;
          this.playIcon.pivot = [0.5, 0];
          this.playIcon.shadowColor = "rgba(0, 0, 0, 0.5)";
          this.playIcon.render(ctx);
        }
      }
    }
  }

  private handleClick(target: Layout | Bubble): void {
    this.selectTarget(target);
  }

  acceptDepths(): number[] {
    return [0,1];
  }

  accepts(point: Vector, button: number, depth: number): any {
    // if (!this.interactable) { return null; }　// 破壊的ではないので敢えて無視
    if (keyDownFlags["Space"]) { return null; }

    if (depth === 1) {
      for (const bubble of this.bubbles) {
        const paperSize = this.getPaperSize();
        if (!this.hasVideo(bubble.filmStack)) { continue; }
        if (bubble.contains(paperSize, point)) {
          return { action: "click", layout: bubble };
        }
      }
      return null;
    } else {
      const layout = this.calculateRootLayout();
      const clickedLayout = findLayoutAt(layout, point, 0);
      
      if (clickedLayout) {
        return { action: "click", layout: clickedLayout };
      }
      this.selectTarget(null);
      return null;
    }
  }

  async *pointer(p: Vector, payload: any) {
    if (payload.action === "click") {
      this.handleClick(payload.layout);
    }
  }

  async keyDown(_position: Vector, event: KeyboardEvent): Promise<boolean> {
    if (event.code === "Escape") {
      this.selectTarget(null);
      return true;
    }
    return false;
  }

  changeFocus(layer: Layer | null) {
    if (layer !== this) {
      // フォーカスが他のレイヤーに移った場合のみ処理
      this.onFocus(null);
      this.redraw();
    }
  }

  private isSameTarget(a: Layout | Bubble | null, b: Layout | Bubble | null): boolean {
    if (a === b) { return true; }
    if (!a || !b) { return false; }
    const isLayout = (x: any): x is Layout => (x as Layout).element !== undefined;
    if (isLayout(a) && isLayout(b)) {
      return a.element === b.element;
    }
    if (!isLayout(a) && !isLayout(b)) {
      // Bubble は参照同一性で十分
      return a === b;
    }
    return false;
  }

  selectTarget(target: Layout | Bubble | null): void {
    // Layout は毎回再構築されるため参照ではなく要素同一性で比較
    if (this.isSameTarget(target, this.selected)) { return; }
    this.stopVideo(this.selected);
    this.selected = target;
    this.startVideo(target);
    this.onFocus(target);
    // フォーカスの変更を通知
    this.focusKeeper.setFocus(target ? this : null);
    this.redraw();
  }

  stopVideo(target: Layout | Bubble | null) {
    if (target) {
      const filmStack = this.getFilmStack(target);
      for (const film of filmStack.films) {
        if (film.content.kind !== 'media') { continue; }
        film.content.media.player?.pause();
      }
    }
  }

  startVideo(target: Layout | Bubble | null) {
    if (!target) { return; }

    const filmStack = this.getFilmStack(target);
    for (const film of filmStack.films) {
      if (film.content.kind !== 'media') { continue; }
      if (film.content.media.player) {
        film.content.media.player.play();
      }
    }
    // rAFは中央ループからのtickで処理
  }

  private onVisibilityChange() {
    // タブがアクティブ化されたら、選択中ターゲットの動画を再生しておく
    if (!document.hidden && this.selected) {
      const filmStack = this.getFilmStack(this.selected);
      for (const film of filmStack.films) {
        if (film.content.kind !== 'media') { continue; }
        const src = film.content.media.drawSource as any;
        if (src instanceof HTMLVideoElement) {
          if (src.paused && film.content.media.player) {
            film.content.media.player.play();
          }
        }
      }
    }
  }

  tick(now: number): void {
    // 点線回転を進める（動画がある場合のみ）
    if (this.hasAnyVideo() && this.showDottedBorder) {
      if (this.lastNow == null) { this.lastNow = now; }
      const dt = now - this.lastNow;
      this.lastNow = now;
      this.dashPhase = (this.dashPhase + (this.dashSpeed * dt) / 1000) % 10000;
      this.redraw();
    }

    // 再生中動画があればレイヤーを更新（従来のロジック）
    if (this.selected) {
      const filmStack = this.getFilmStack(this.selected);
      for (const film of filmStack.films) {
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

  getFilmStack(target: Layout | Bubble): FilmStack {
    if (target instanceof Bubble) {
      return target.filmStack;
    } else {
      return target.element.filmStack;
    }
  }

  hasVideo(filmStack: FilmStack): boolean {
    for (const film of filmStack.films) {
      if (film.content.kind !== 'media') { continue; }
      if (film.content.media.player) {
        return true;
      }
    }
    return false;
  }

  // レイアウト再計算を避けるため、FrameElement ツリーを直接走査
  private hasAnyVideoInFrames(element: FrameElement): boolean {
    if (this.hasVideo(element.filmStack)) { return true; }
    if (element.children) {
      for (const child of element.children) {
        if (this.hasAnyVideoInFrames(child)) { return true; }
      }
    }
    return false;
  }

  private hasAnyVideo(): boolean {
    if (this.hasAnyVideoInFrames(this.frameTree)) { return true; }
    for (const b of this.bubbles) {
      if (this.hasVideo(b.filmStack)) { return true; }
    }
    return false;
  }

  get interactable(): boolean { return this.mode == null; }

  tearDown() {
    // リスナー解除と動画停止（選択中があれば）
    if (this.onVisibilityChangeBound) {
      document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
      this.onVisibilityChangeBound = null;
    }
    if (this.selected) {
      this.stopVideo(this.selected);
    }
    super.tearDown();
  }
}

sequentializePointer(ViewerLayer);
