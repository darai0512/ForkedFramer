#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const EMBEDS_DIR = './public/ads/jonigata/embeds';
const LIST_JSON = join(EMBEDS_DIR, 'list.json');

// 既存のファイルから次の番号を取得
function getNextNumber() {
  const files = readdirSync(EMBEDS_DIR);
  const tweetFiles = files.filter(f => f.startsWith('tweet') && f.endsWith('.html'));

  const numbers = tweetFiles.map(f => {
    const match = f.match(/tweet(\d+)\.html/);
    return match ? parseInt(match[1], 10) : 0;
  });

  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

// list.jsonを読み込み
function loadListJson() {
  const content = readFileSync(LIST_JSON, 'utf-8');
  return JSON.parse(content);
}

// list.jsonに新しいエントリを追加
function addToList(filename) {
  const list = loadListJson();

  // 既に存在しないか確認
  if (list.embeds.includes(filename)) {
    console.log(`⚠️  ${filename} は既に list.json に登録されています`);
    return false;
  }

  list.embeds.push(filename);
  writeFileSync(LIST_JSON, JSON.stringify(list, null, 2) + '\n', 'utf-8');
  return true;
}

// 空のHTMLテンプレート（完全に空）
const HTML_TEMPLATE = '';

// メイン処理
function main() {
  const nextNum = getNextNumber();
  const filename = `tweet${String(nextNum).padStart(4, '0')}.html`;
  const filepath = join(EMBEDS_DIR, filename);

  // HTMLファイルを作成
  writeFileSync(filepath, HTML_TEMPLATE, 'utf-8');
  console.log(`✅ 作成: ${filepath}`);

  // list.jsonに追加
  if (addToList(filename)) {
    console.log(`✅ list.json に ${filename} を追加しました`);
  }

  console.log(`\n📝 次の作業:`);
  console.log(`   1. ${filepath} を編集してツイートの埋め込みコードを貼り付けてください`);
  console.log(`   2. 必要に応じて list.json の順序を調整してください`);
}

main();
