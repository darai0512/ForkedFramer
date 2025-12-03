import { ulid } from 'ulid';
import { type Media, ImageMedia } from './media';
import { Computron, JFACompute, FloatField } from 'fastsdf';
import parseColor from 'color-parse';

const isTestEnvironment = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST);

let jfaPromise: Promise<JFACompute | null> | null = null;
let webGPUAvailable = true;

async function ensureJFA(): Promise<JFACompute | null> {
  if (!jfaPromise) {
    jfaPromise = (async () => {
      try {
        const c = new Computron();
        await c.init();

        const jfa = new JFACompute(c);
        await jfa.init();
        return jfa;
      } catch (error) {
        console.warn("WebGPU not available, OutlineEffect disabled:", error);
        webGPUAvailable = false;
        return null;
      }
    })();
  }

  return jfaPromise;
}
if (!isTestEnvironment) {
  ensureJFA();
}

export function isWebGPUAvailable(): boolean {
  return webGPUAvailable;
}

export class Effect {
  ulid: string;
  inputMedia: Media | null;
  outputMedia: Media | null;

  constructor() {
    this.ulid = ulid();
    this.inputMedia = null;
    this.outputMedia = null;
  }

  get tag(): string {
    return this.constructor.name;
  }

  clone(): Effect {
    throw new Error("Not implemented");
  }

  cleanInput() {
    this.inputMedia = null;
  }

  setOutputDirty() {
    this.outputMedia = null;
  }

  async apply(inputMedia: Media): Promise<Media> { 
    throw new Error("Not implemented");
  }

  decompile(): any {
    throw new Error("Not implemented");
  }

  static compile(markUp: any) {
    switch (markUp.tag) {
      case "OutlineEffect":
        const p = markUp.properties;
        return new OutlineEffect(p.color, p.width, p.sharp);
      default:
        throw new Error("Unknown effect tag: " + markUp.tag);
    }
  }
}

export class OutlineEffect extends Effect {
  rawDistanceField: FloatField | null = null;

  constructor(public color: string, public width: number, public sharp: number) {
    super();
  }

  clone(): Effect {
    return new OutlineEffect(this.color, this.width, this.sharp);
  }

  async apply(inputMedia: Media): Promise<Media> {
    const jfa = await ensureJFA();
    if (!jfa) {
      // WebGPU非対応時は入力をそのまま返す
      return inputMedia;
    }

    if (this.inputMedia != inputMedia) {
      const inputCanvas = (inputMedia as ImageMedia).drawSource;

      const plainImage = FloatField.createFromImageOrCanvas(inputCanvas);
      const seedMap = JFACompute.createJFASeedMap(plainImage, 0.5, false);
      this.rawDistanceField = await jfa.compute(seedMap);
      this.inputMedia = inputMedia;
    }

    const inputCanvas = (inputMedia as ImageMedia).drawSource;

    // 入力自体へんかしている
    const baseWidth = Math.max(inputMedia.naturalWidth, inputMedia.naturalHeight);
    const width = this.width * baseWidth;

    const c = parseColor(this.color);
    const color = {r: c.values[0] / 255, g: c.values[1] / 255, b: c.values[2] / 255};
    const dull = 1.0 - this.sharp;
    const f = (t: number) => dull <= t ? 1 : t * (1.0 / dull);
    const distanceField = JFACompute.generateDistanceField(
      this.rawDistanceField!, color, width, f);

    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = inputCanvas.width;
    targetCanvas.height = inputCanvas.height;
    const ctx = targetCanvas.getContext('2d')!;
    ctx.drawImage(inputCanvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(distanceField.toCanvas(), 0, 0);

    this.outputMedia = new ImageMedia(targetCanvas);
    return this.outputMedia;
  }

  decompile(): any {
    return {
      color: this.color,
      width: this.width,
      sharp: this.sharp,
    };
  }
}
