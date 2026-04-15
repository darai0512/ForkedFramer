import { loadGoogleFontForCanvas } from "../lib/layeredCanvas/tools/googleFont";

export async function loadFonts(fonts: { family: string, weight: string }[]): Promise<boolean> {
  let result = false;
  for (let font of fonts) {
    if (await loadFont(font.family, font.weight)) {
      result = true;
    }
  }
  return result;
}

const localFontFiles: { [key: string]: string } = {
  '源暎アンチック': 'GenEiAntiqueNv5-M',
  '源暎エムゴ': 'GenEiMGothic2-Black',
  '源暎ぽっぷる': 'GenEiPOPle-Bk',
  '源暎ラテゴ': 'GenEiLateMinN_v2',
  '源暎ラテミン': 'GenEiLateMinN_v2',
  '源暎きわみゴ': 'GenEiKiwamiGo',
  "ふい字": 'HuiFont29',
  "まきばフォント": 'MakibaFont13',
  '瀞ノグリッチ黒体H1': 'ToronoGlitchH1',
  '瀞ノグリッチ黒体H2': 'ToronoGlitchH2',
  '瀞ノグリッチ黒体H3': 'ToronoGlitchH3',
  '瀞ノグリッチ黒体H4': 'ToronoGlitchH4',
  'ひび割れ文字': 'hibiware_jp',
  '851チカラヨワク': '851CHIKARA-YOWAKU_002',
  'DoublePop': 'DoublePopDemo-R',
  'DragonQuestFC': 'DragonQuestFC',
  'ZeroGothic': 'ZeroGothic',
}

const cache = new Set<string>();

// キャッシュ機構(重複管理など)はFontFace APIが持っているので、基本的には余計なことはしなくてよい
// と思いきや一瞬ちらつくようなのでキャッシュする
export async function loadFont(family: string, weight: string): Promise<boolean> {
  if (cache.has(`${family}:${weight}`)) { return false; }

  try {
    const localFile = localFontFiles[family];
    console.log("load font", family, weight, localFile)
    if (localFile) {
      const url = `/fonts/${localFile}.woff2`;
      const font = new FontFace(family, `url(${url}) format('woff2')`, { style: 'normal', weight });
      await font.load();
      document.fonts.add(font);
    } else {
      await loadGoogleFontForCanvas(family, [weight]);
    }
    cache.add(`${family}:${weight}`);
    return true;
  }
  catch (e) {
    console.error(e);
    return false;
  }
}
