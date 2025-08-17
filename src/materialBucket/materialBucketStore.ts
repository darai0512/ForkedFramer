import { writable } from "svelte/store";

export const materialBucketOpen = writable(false);

// 素材集の更新をトリガーするためのストア
export const materialCollectionUpdateToken = writable(false);
