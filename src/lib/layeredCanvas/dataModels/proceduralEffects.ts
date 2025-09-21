import type { Vector } from '../tools/geometry/geometry';

export type FilmProceduralEffectType = 'motion-lines' | 'speed-lines' | 'dots';

export type FilmProceduralParamValue = number | string | boolean | Vector;

export type FilmProceduralParams = Record<string, FilmProceduralParamValue>;

export interface FilmProceduralEffect {
  type: FilmProceduralEffectType;
  params: FilmProceduralParams;
}

export function cloneProceduralParamValue(value: FilmProceduralParamValue): FilmProceduralParamValue {
  return Array.isArray(value) ? [...value] as Vector : value;
}

export function cloneProceduralParams(params: FilmProceduralParams): FilmProceduralParams {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, cloneProceduralParamValue(value)])
  ) as FilmProceduralParams;
}

export function readVectorParam(effect: FilmProceduralEffect, key: string, fallback: Vector): Vector {
  const raw = effect.params[key];
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return [x, y];
    }
  }
  return [...fallback] as Vector;
}


export type FilmProceduralOption =
  | { type: 'number'; min: number; max: number; step: number; init: () => number }
  | { type: 'color'; init: () => string }
  | { type: 'text'; init: () => string; placeholder?: string; placeholderKey?: string }
  | { type: 'handle'; icon: string; hint: string; init: () => Vector };

const numberOption = (min: number, max: number, step: number, init: () => number): FilmProceduralOption => ({
  type: 'number',
  min,
  max,
  step,
  init,
});

const colorOption = (init: () => string): FilmProceduralOption => ({
  type: 'color',
  init,
});


const handleOption = (icon: string, hint: string, init: () => Vector): FilmProceduralOption => ({
  type: 'handle',
  icon,
  hint,
  init,
});

export const filmProceduralOptionSets: Record<FilmProceduralEffectType, Record<string, FilmProceduralOption>> = {
  'motion-lines': {
    focalPoint: handleOption('circle', '内円の中心', () => [0, 0]),
    focalRange: handleOption('radius', '内円の範囲', () => [0, 40]),
    randomSeed: numberOption(0, 100, 1, () => 0),
    lineCount: numberOption(100, 300, 1, () => 200),
    lineWidth: numberOption(0.01, 0.1, 0.01, () => 0.05),
    angleJitter: numberOption(0, 0.2, 0.01, () => 0.05),
    startJitter: numberOption(0, 1, 0.01, () => 0.5),
    color: colorOption(() => '#000000'),
  },
  'speed-lines': {
    tailTip: handleOption('tail', '流線の先端', () => [40, 0]),
    tailMid: handleOption('curve', '流線の途中', () => [0.5, 0]),
    randomSeed: numberOption(0, 100, 1, () => 0),
    lineCount: numberOption(10, 200, 1, () => 70),
    lineWidth: numberOption(0.01, 1, 0.01, () => 0.2),
    laneJitter: numberOption(0, 0.2, 0.01, () => 0.05),
    startJitter: numberOption(0, 0.5, 0.01, () => 0.3),
    color: colorOption(() => '#000000'),
  },
  'dots': {
    horizontalSpacing: numberOption(1, 10, 0.1, () => 5),
    verticalSpacing: numberOption(1, 10, 0.1, () => 5),
    dotRadius: numberOption(0.1, 10, 0.1, () => 1),
    evenRowOffset: numberOption(0, 0.5, 0.01, () => 0.5),
    positionJitter: numberOption(0, 1, 0.01, () => 0),
    sizeJitter: numberOption(0, 1, 0.01, () => 0),
    randomSeed: numberOption(0, 100, 1, () => 0),
    color: colorOption(() => '#00000080'),
  },
};

export type ProceduralEffectParamSpec =
  | { kind: 'number'; label: string; labelKey?: string; min: number; max: number; step: number }
  | { kind: 'color'; label: string; labelKey?: string }
  | { kind: 'text'; label: string; labelKey?: string; placeholder?: string; placeholderKey?: string };

const sharedLabelKeys = new Map<string, string>([
  ['color', 'film.procedural.shared.color'],
  ['randomSeed', 'film.procedural.shared.randomSeed'],
]);

function optionToParamSpec(
  effectType: FilmProceduralEffectType,
  key: string,
  option: FilmProceduralOption,
): ProceduralEffectParamSpec | null {
  const labelKey = sharedLabelKeys.get(key) ?? `film.procedural.${effectType}.${key}`;

  switch (option.type) {
    case 'number':
      return {
        kind: 'number',
        label: key,
        labelKey,
        min: option.min,
        max: option.max,
        step: option.step,
      };
    case 'color':
      return {
        kind: 'color',
        label: key,
        labelKey,
      };
    case 'text':
      return {
        kind: 'text',
        label: key,
        labelKey,
        placeholder: option.placeholder,
        placeholderKey: option.placeholderKey,
      };
    case 'handle':
      return null;
  }
}

function optionDefault(option: FilmProceduralOption): FilmProceduralParamValue {
  return option.init();
}

export const proceduralEffectParamSpecs: Record<FilmProceduralEffectType, Record<string, ProceduralEffectParamSpec>> =
  Object.fromEntries(
    Object.entries(filmProceduralOptionSets).map(([type, options]) => {
      const effectType = type as FilmProceduralEffectType;
      return [
        effectType,
        Object.fromEntries(
          Object.entries(options)
            .map(([key, option]) => {
              const spec = optionToParamSpec(effectType, key, option);
              return spec ? [key, spec] as [string, ProceduralEffectParamSpec] : null;
            })
            .filter((entry): entry is [string, ProceduralEffectParamSpec] => entry !== null)
        ),
      ];
    })
  ) as Record<FilmProceduralEffectType, Record<string, ProceduralEffectParamSpec>>;

const defaultParams: Record<FilmProceduralEffectType, Record<string, FilmProceduralParamValue>> =
  Object.fromEntries(
    Object.entries(filmProceduralOptionSets).map(([type, options]) => [
      type,
      Object.fromEntries(
        Object.entries(options).map(([key, option]) => [key, optionDefault(option)])
      ),
    ])
  ) as Record<FilmProceduralEffectType, Record<string, FilmProceduralParamValue>>;

export function createProceduralEffect(
  type: FilmProceduralEffectType,
  overrides: Partial<Record<string, FilmProceduralParamValue>> = {}
): FilmProceduralEffect {
  const base = defaultParams[type];
  const initial = cloneProceduralParams(base);
  const merged = { ...initial } as FilmProceduralParams;
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = cloneProceduralParamValue(value as FilmProceduralParamValue);
  }
  return {
    type,
    params: merged,
  };
}
