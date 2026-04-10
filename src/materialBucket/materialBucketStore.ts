import { writable } from "svelte/store";

export const materialBucketOpen = writable(false);

// 素材集の更新をトリガーするためのストア
export const materialCollectionUpdateToken = writable(false);

export interface DraggedMaterialInfo {
  media: any;
  bindId: string;
  sourceNodeId: string;
}
export const draggedMaterial = writable<DraggedMaterialInfo | null>(null);
