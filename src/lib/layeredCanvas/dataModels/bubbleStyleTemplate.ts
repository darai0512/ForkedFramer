import parseColor from 'color-parse';

// fillColorの振る舞い: 固定色 or テーマカラーベース
export type FillColorMode =
  | { kind: 'fixed'; color: string }
  | { kind: 'themeColor'; whitenRatio: number };

export interface BubbleStyleEntry {
  fontFamily: string;
  fontWeight: string;
  n_fontSize: number;
  fontColor: string;
  direction: 'v' | 'h';
  fillColorMode: FillColorMode;
  strokeColor: string;
  n_strokeWidth: number;
  outlineColor: string;
  n_outlineWidth: number;
  optionOverrides: Record<string, any>;
}

export interface BubbleStyleTemplate {
  name: string;
  defaultStyle: BubbleStyleEntry;
  shapeOverrides?: Partial<Record<string, Partial<BubbleStyleEntry>>>;
  semanticsOverrides?: Partial<Record<string, Partial<BubbleStyleEntry>>>;
}

function mergeStyle(base: BubbleStyleEntry, override: Partial<BubbleStyleEntry>): BubbleStyleEntry {
  return {
    ...base,
    ...override,
    optionOverrides: { ...base.optionOverrides, ...(override.optionOverrides ?? {}) },
    fillColorMode: override.fillColorMode ?? base.fillColorMode,
  };
}

export function resolveStyleForShape(
  template: BubbleStyleTemplate,
  shape: string
): BubbleStyleEntry {
  const base = template.defaultStyle;
  const override = template.shapeOverrides?.[shape];
  if (!override) return base;
  return mergeStyle(base, override);
}

export function resolveStyleForSemantics(
  template: BubbleStyleTemplate,
  semantics: string
): BubbleStyleEntry | null {
  const override = template.semanticsOverrides?.[semantics];
  if (!override) return null;
  return mergeStyle(template.defaultStyle, override);
}

export function whitenColor(s: string, ratio: number): string {
  const c = parseColor(s);
  if (ratio < 0 || ratio > 1) {
    throw new Error("Ratio must be between 0 and 1");
  }
  const r = Math.round(c.values[0] * (1 - ratio) + 255 * ratio);
  const g = Math.round(c.values[1] * (1 - ratio) + 255 * ratio);
  const b = Math.round(c.values[2] * (1 - ratio) + 255 * ratio);
  return "#" +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0');
}

export function resolveFillColor(mode: FillColorMode, themeColor: string): string {
  if (mode.kind === 'fixed') return mode.color;
  return whitenColor(themeColor, mode.whitenRatio);
}

export const STANDARD_BUBBLE_STYLE_ENTRY: BubbleStyleEntry = {
  fontFamily: "源暎アンチック",
  fontWeight: "400",
  n_fontSize: 32 / 840,
  fontColor: "#000000FF",
  direction: 'v',
  fillColorMode: { kind: 'fixed', color: '#ffffffE6' },
  strokeColor: "#000000FF",
  n_strokeWidth: 3 / 840,
  outlineColor: "#000000FF",
  n_outlineWidth: 0,
  optionOverrides: {},
};

export const GOTHIC_BUBBLE_STYLE_ENTRY: BubbleStyleEntry = {
  fontFamily: "源暎エムゴ",
  fontWeight: "400",
  n_fontSize: 0.03,
  fontColor: "#000000FF",
  direction: 'v',
  fillColorMode: { kind: 'themeColor', whitenRatio: 0.85 },
  strokeColor: "#000000FF",
  n_strokeWidth: 3 / 840,
  outlineColor: '#ffffff',
  n_outlineWidth: 0.005,
  optionOverrides: { shapeExpand: 0.06 },
};

export const TITLE_SEMANTICS_STYLE: Partial<BubbleStyleEntry> = {
  fontFamily: "Kiwi Maru",
  n_fontSize: 0.05,
  direction: 'h',
  fillColorMode: { kind: 'fixed', color: '#ffffff00' },
  n_outlineWidth: 0,
};

export const DEFAULT_BUBBLE_STYLE_TEMPLATES: BubbleStyleTemplate[] = [
  {
    name: "スタンダード",
    defaultStyle: { ...STANDARD_BUBBLE_STYLE_ENTRY },
    semanticsOverrides: { title: { ...TITLE_SEMANTICS_STYLE } },
  },
  {
    name: "ゴシック",
    defaultStyle: { ...GOTHIC_BUBBLE_STYLE_ENTRY },
    semanticsOverrides: { title: { ...TITLE_SEMANTICS_STYLE, fontFamily: "源暎きわみゴ" } },
  },
];
