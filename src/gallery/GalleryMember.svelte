<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { ImageMedia, VideoMedia, type Media } from '../lib/layeredCanvas/dataModels/media';
  import GalleryElement from './GalleryElement.svelte';
  import MediaLoading from './MediaLoading.svelte';
  import type { GalleryItem } from './gallery';

  export let item: GalleryItem;
  export let columnWidth: number;
  export let chosen: Media | null;
  export let refered: Media | null;
  export let accessable: boolean;
  export let referable: boolean;
  export let viewable: boolean = true;

  let medias: Media[] | undefined;
  let observerTarget: HTMLDivElement; // 監視用の DOM 要素
  let observer: IntersectionObserver | null = null;
  let cancelled = false;

  const distach = createEventDispatcher();

  function onDelete(e: CustomEvent<Media>) {
    // 子の削除イベントはここで止めて、親(Gallery)に二重で届かないようにする
    e.stopPropagation();
    console.log('GalleryMember.onDelete(before)', e.detail, medias!.length);
    medias = medias!.filter(c => c !== e.detail);
    console.log('GalleryMember.onDelete(after)', e.detail, medias!.length);
    if (medias!.length === 0) {
      distach('delete', item);
    }
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function isScrollableElement(element: HTMLElement): boolean {
    const style = getComputedStyle(element);
    const overflowY = style.overflowY ?? style.overflow;
    const overflowX = style.overflowX ?? style.overflow;
    const scrollableY = /(auto|scroll|overlay)/.test(overflowY);
    const scrollableX = /(auto|scroll|overlay)/.test(overflowX);
    const canScrollY = scrollableY && Math.ceil(element.scrollHeight) > Math.ceil(element.clientHeight);
    const canScrollX = scrollableX && Math.ceil(element.scrollWidth) > Math.ceil(element.clientWidth);
    return canScrollY || canScrollX;
  }

  function getScrollableParent(node: HTMLElement | null): Element | null {
    if (typeof window === 'undefined') {
      return null;
    }
    let current: HTMLElement | null = node?.parentElement ?? null;
    while (current) {
      if (isScrollableElement(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function waitForNextFrames(): Promise<void> {
    if (typeof requestAnimationFrame !== 'function') {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function setupObserver() {
    if (typeof window === 'undefined') {
      return;
    }
    if (medias || !observerTarget || observer) {
      return;
    }

    await tick();
    await waitForNextFrames();

    if (cancelled || medias || !observerTarget || observer) {
      return;
    }

    const root = getScrollableParent(observerTarget);

    observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || medias) {
          return;
        }
        (item as () => Promise<Media[]>)().then(result => {
          if (cancelled) {
            return;
          }
          medias = result;
          disconnectObserver();
        });
      },
      { root, threshold: 0 }
    );
    observer.observe(observerTarget);
  }

  onMount(() => {
    if (item instanceof ImageMedia || item instanceof VideoMedia) {
      medias = [item];
      return;
    }

    setupObserver();

    return () => {
      cancelled = true;
      disconnectObserver();
    };
  });

  onDestroy(() => {
    cancelled = true;
    disconnectObserver();
  });

  $: if (!medias) {
    setupObserver();
  }
</script>

{#if !medias}
  <!-- ロードされる前のみ表示される 1マスぶんのプレースホルダー -->
  <div bind:this={observerTarget}>
    <MediaLoading width={columnWidth} />
  </div>
{:else}
  {#each medias as media (media)}
    <GalleryElement
      bind:chosen
      bind:refered
      width={columnWidth}
      media={media}
      {accessable}
      {referable}
      {viewable}
      on:commit
      on:delete={onDelete}
      on:dragstart
    />
  {/each}
{/if}
