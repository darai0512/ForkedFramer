import type { CharacterLocal } from '../lib/book/book';
import { canvasToBlob, createCanvasFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
import { buildNullableMedia } from '../lib/layeredCanvas/dataModels/media';
import { ulid } from 'ulid';

export interface CharacterExternalFormat {
  name: string;
  personality: string;
  appearance: string;
  themeColor: string;
  portrait: string | null;
  version: string;
}

export async function characterToBlob(character: CharacterLocal): Promise<Blob> {
  let portraitBase64: string | null = null;
  
  if (character.portrait && character.portrait !== 'loading') {
    const canvas = character.portrait.persistentSource as HTMLCanvasElement;
    const blob = await canvasToBlob(canvas);
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    portraitBase64 = dataUrl.split(',')[1];
  }

  const externalFormat: CharacterExternalFormat = {
    name: character.name,
    personality: character.personality,
    appearance: character.appearance,
    themeColor: character.themeColor,
    portrait: portraitBase64,
    version: '1.0.0'
  };

  const json = JSON.stringify(externalFormat, null, 2);
  return new Blob([json], { type: 'application/json' });
}

export async function blobToCharacter(blob: Blob): Promise<CharacterLocal> {
  const text = await blob.text();
  const externalFormat: CharacterExternalFormat = JSON.parse(text);

  let portrait = null;
  if (externalFormat.portrait) {
    const dataUrl = `data:image/png;base64,${externalFormat.portrait}`;
    const response = await fetch(dataUrl);
    const imageBlob = await response.blob();
    const canvas = await createCanvasFromBlob(imageBlob);
    portrait = buildNullableMedia(canvas);
  }

  const character: CharacterLocal = {
    name: externalFormat.name,
    personality: externalFormat.personality,
    appearance: externalFormat.appearance,
    themeColor: externalFormat.themeColor,
    ulid: ulid(),
    portrait: portrait
  };

  return character;
}

function sanitizeFilename(name: string): string {
  // ファイル名に使えない文字を置換
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')  // Windows/Unix で使えない文字
    .replace(/[\s]+/g, '_')  // 連続するスペースをアンダースコアに
    .replace(/^\.+/, '_')  // 先頭のドットを置換
    .replace(/\.+$/, '_')  // 末尾のドットを置換
    .trim() || 'character';  // 空の場合のフォールバック
}

export async function saveCharacterToFile(character: CharacterLocal, filename?: string): Promise<void> {
  const sanitizedName = sanitizeFilename(character.name);
  const defaultFilename = `${sanitizedName}.character`;
  const finalFilename = filename || defaultFilename;
  const blob = await characterToBlob(character);
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  a.click();
  
  URL.revokeObjectURL(url);
}

export async function loadCharacterFromFile(): Promise<CharacterLocal | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.character';
    
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      
      try {
        const character = await blobToCharacter(file);
        resolve(character);
      } catch (error) {
        console.error('Failed to load character:', error);
        resolve(null);
      }
    };
    
    input.click();
  });
}