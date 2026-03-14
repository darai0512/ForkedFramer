import JSZip from 'jszip';
import { readEnvelope, writeEnvelope } from './envelope';
import type { Book } from './book';

/**
 * 階層構造を表すノードの型定義
 */
export type HierarchyNode = {
  name: string;                   // ノード名（ファイル名またはフォルダ名）
  book?: Book;                    // 対応するBookオブジェクト（ファイルノードの場合）
  children?: HierarchyNode[];     // 子ノード（フォルダノードの場合）
  isFolder: boolean;              // フォルダかどうかのフラグ
};

/**
 * ファイル名やフォルダ名をサニタイズする
 * ZIPファイル内で使用できない文字を置き換える
 */
function sanitizeFileName(name: string): string {
  // 無効な文字の置き換え
  return name
    .replace(/[\/:*?"<>|\\]/g, '_') // Windows/ZIPで無効な文字を置き換え
    .replace(/\s+/g, ' ')           // 連続した空白を1つに
    .trim();                         // 先頭と末尾の空白を削除
}

/**
 * ノード数をカウントする補助関数
 */
function countNodes(node: HierarchyNode): number {
  let count = 1; // 自身をカウント
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * 同階層での名前重複を回避するためのユニーク名を生成する
 */
function uniqueName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  let i = 1;
  while (usedNames.has(`${name}_${i}`)) { i++; }
  const unique = `${name}_${i}`;
  usedNames.add(unique);
  return unique;
}

/**
 * 兄弟ノードリストを再帰的に処理する関数
 */
async function processNodes(
  nodes: HierarchyNode[],
  zip: JSZip,
  currentPath: string,
  onProgress: () => void
): Promise<void> {
  const usedNames = new Set<string>();
  for (const node of nodes) {
    const safeName = uniqueName(sanitizeFileName(node.name), usedNames);

    if (node.isFolder) {
      const newPath = currentPath ? `${currentPath}/${safeName}` : safeName;
      if (node.children) {
        await processNodes(node.children, zip, newPath, onProgress);
      }
    } else if (node.book) {
      const filePath = currentPath ? `${currentPath}/${safeName}.envelope` : `${safeName}.envelope`;
      const blob = await writeEnvelope(node.book, () => {});
      zip.file(filePath, blob);
      onProgress();
    }
  }
}

/**
 * 階層構造をZIPに変換するメイン関数
 */
export async function writeHierarchicalEnvelopeZip(
  nodes: HierarchyNode[],
  progress: (n: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  let processedCount = 0;
  let totalNodes = 0;
  for (const node of nodes) { totalNodes += countNodes(node); }

  await processNodes(nodes, zip, '', () => {
    processedCount++;
    progress(processedCount / totalNodes);
  });

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

/**
 * パスから階層構造を構築する補助関数
 */
function ensurePathInHierarchy(
  rootNode: HierarchyNode,
  path: string
): HierarchyNode {
  // パスがファイルを指していない場合はrootNodeを返す
  if (!path.endsWith('.envelope')) {
    return rootNode;
  }
  
  const parts = path.split('/');
  let currentNode = rootNode;
  
  // 最後の要素はファイル名なので別処理
  const fileName = parts.pop() || '';
  
  // ファイル名から.envelopeを削除してサニタイズ
  const fileNameWithoutExtension = fileName.substring(0, fileName.length - 9);
  const safeName = sanitizeFileName(fileNameWithoutExtension);
  
  // フォルダパスの各部分を処理
  for (const part of parts) {
    if (!part) continue; // 空の部分をスキップ
    
    // フォルダノードを探すか作成
    if (!currentNode.children) {
      currentNode.children = [];
    }
    
    const sanitizedPart = sanitizeFileName(part);
    let folderNode = currentNode.children.find(
      child => child.isFolder && sanitizeFileName(child.name) === sanitizedPart
    );
    
    if (!folderNode) {
      folderNode = {
        name: part,
        isFolder: true,
        children: []
      };
      currentNode.children.push(folderNode);
    }
    
    currentNode = folderNode;
  }
  
  // ファイルノードを作成（Bookは後で設定）
  if (!currentNode.children) {
    currentNode.children = [];
  }
  
  let fileNode = currentNode.children.find(
    child => !child.isFolder && sanitizeFileName(child.name) === safeName
  );
  
  if (!fileNode) {
    fileNode = {
      name: fileNameWithoutExtension,
      isFolder: false
    };
    currentNode.children.push(fileNode);
  }
  
  return fileNode;
}

/**
 * ZIPから階層構造を読み込む関数
 */
export async function readHierarchicalEnvelopeZip(
  blob: Blob,
  progress: (n: number) => void
): Promise<HierarchyNode[]> {
  const zip = await JSZip.loadAsync(blob);
  const virtualRoot: HierarchyNode = {
    name: '',
    isFolder: true,
    children: []
  };

  // 全てのファイルを収集
  const files = Object.keys(zip.files).filter(
    path => !zip.files[path].dir && path.endsWith('.envelope')
  );

  let processedCount = 0;
  const totalFiles = files.length;

  // 各ファイルを処理
  for (const filePath of files) {
    const fileNode = ensurePathInHierarchy(virtualRoot, filePath);
    const envelopeBlob = await zip.files[filePath].async('blob');
    const book = await readEnvelope(envelopeBlob, () => {});
    fileNode.book = book;

    processedCount++;
    progress(processedCount / totalFiles);
  }

  return virtualRoot.children || [];
}

/**
 * 平坦化された階層構造をBookの配列として取得
 */
export function getBooksFromHierarchy(node: HierarchyNode): Book[] {
  const books: Book[] = [];
  
  if (!node.isFolder && node.book) {
    books.push(node.book);
  }
  
  if (node.children) {
    for (const child of node.children) {
      books.push(...getBooksFromHierarchy(child));
    }
  }
  
  return books;
}

/**
 * 階層の深さを取得
 */
export function getHierarchyDepth(node: HierarchyNode): number {
  if (!node.children || node.children.length === 0) {
    return 0;
  }
  
  let maxChildDepth = 0;
  for (const child of node.children) {
    const childDepth = getHierarchyDepth(child);
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth;
    }
  }
  
  return maxChildDepth + 1;
}