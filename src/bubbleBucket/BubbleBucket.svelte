<script lang="ts">
  import Drawer from '../utils/Drawer.svelte'
  import { bubbleBucketPage, bubbleBucketDirty } from './bubbleBucketStore';
  import { bookOperators } from '../bookeditor/workspaceStore';
  import BubbleBucketItem from './BubbleBucketItem.svelte';
  import { collectPageContents } from '../lib/book/book';
  import { mainBook } from '../bookeditor/workspaceStore';
  import { getHaiku } from "../lib/layeredCanvas/tools/haiku";
  import { Bubble } from "../lib/layeredCanvas/dataModels/bubble";
  import { getRectCenter, sizeToRect } from '../lib/layeredCanvas/tools/geometry/geometry';
  import { onMount } from 'svelte';
  import { sortableList } from '../utils/sortableList';
  import { moveInArray } from '../utils/moveInArray';
  import { splitBubbleAt } from '../lib/layeredCanvas/tools/bubbleUtil';
  import { toolTip } from '../utils/passiveToolTipStore';
  import { _ } from 'svelte-i18n';
  import { toastStore } from '@skeletonlabs/skeleton';

  import clipboardIcon from '../assets/clipboard.webp';
  import pasteIcon from '../assets/fileManager/paste.webp';


  let bubbles: Bubble[] = [];
  let drawerElement: HTMLDivElement;

  function setUpBubbles() {
    bubbles = $bubbleBucketPage!.bubbles;
  }
  $: if ($bubbleBucketPage != null) {
    setUpBubbles();
  }

  function close() {
    $bubbleBucketPage = null;
    $bubbleBucketDirty = true;
  }

  function onAddBubble() {
    const dir = $mainBook!.direction;
    const page = $bubbleBucketPage!;
    const frameSeq = collectPageContents(page, 0, dir)
    const contents = frameSeq.contents;

    let rect;

    if (contents.length == 0) {
      rect = sizeToRect(page.paperSize);
    } else {
      // 一番番号が若くてbubblesが少ないマスを探す
      let min = 0;
      for (let i = 0; i < contents.length; i++) {
        if (contents[i].bubbles.length < contents[min].bubbles.length) {
          min = i;
        }
      }
      rect = contents[min].sourceRect;
    }

    const paperSize = page.paperSize;
    const center = getRectCenter(rect);

    const bubble = new Bubble();
    bubble.text = getHaiku();
    bubble.initOptions();
    // bubble.forceEnoughSize(paperSize);
    bubble.setPhysicalCenter(paperSize, center);
    const size = bubble.calculateFitSize(paperSize);
    bubble.setPhysicalSize(paperSize, size);

    page.bubbles.push(bubble);
    $bubbleBucketPage = page;
    $bubbleBucketDirty = true;
  }

  function onSortUpdate(e: { oldIndex: number | undefined; newIndex: number | undefined }) {
    if (e.oldIndex == null || e.newIndex == null) return;
    const page = $bubbleBucketPage!;
    moveInArray(page.bubbles, e.oldIndex, e.newIndex);
    bubbles = page.bubbles;
    $bubbleBucketPage = page;
    $bubbleBucketDirty = true;
  }

  function onDeleteBubble(event: CustomEvent<Bubble>) {
    const bubble = event.detail;
    const page = $bubbleBucketPage!;
    const index = page.bubbles.indexOf(bubble);
    if (index !== -1) {
      page.bubbles.splice(index, 1);
      // 親参照のクリア
      for (let b of page.bubbles) {
        if (b.parent === bubble.uuid) {
          b.parent = null;
        }
      }
      $bubbleBucketPage = page;
      $bubbleBucketDirty = true;
    }
  }

  function onSplitBubble(event: CustomEvent<{ bubble: Bubble; cursor: number; paperSize: [number, number] }>) {
    const { bubble, cursor, paperSize } = event.detail;
    const page = $bubbleBucketPage!;

    const newBubble = splitBubbleAt(bubble, paperSize, cursor);
    if (!newBubble) {
      toastStore.trigger({ message: '分割できません', timeout: 1500 });
      return;
    }

    // 元のバブルの次に挿入
    const index = page.bubbles.indexOf(bubble);
    if (index !== -1) {
      page.bubbles.splice(index + 1, 0, newBubble);
    } else {
      page.bubbles.push(newBubble);
    }

    $bubbleBucketPage = page;
    $bubbleBucketDirty = true;
  }

  function onSelectBubble(event: CustomEvent<Bubble>) {
    const bubble = event.detail;
    const page = $bubbleBucketPage!;

    // bucketを閉じる
    close();

    // bookOperatorsで直接選択
    $bookOperators?.selectBubbleExternal(page, bubble);
  }

  function handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const text = clipboardData.getData('text/plain');
    if (!text) return;

    // 空行で分割（連続する改行、\n\n または \r\n\r\n）
    const texts = text.split(/\n\s*\n|\r\n\s*\r\n/).filter(t => t.trim());

    if (texts.length === 0) return;

    // bubbleLayer.tsのcreateTextBubbleと同じ配置ロジック
    const page = $bubbleBucketPage!;
    const paperSize = page.paperSize;

    let cursorX = 10;
    let cursorY = 10;
    let lineHeight = 0;

    texts.forEach(t => {
      const bubble = new Bubble();
      bubble.text = t.trim();
      bubble.initOptions();
      const size = bubble.calculateFitSize(paperSize);

      if (cursorX + size[0] > paperSize[0]) {
        cursorX = 10;
        cursorY += lineHeight + 10;
        lineHeight = 0;
      }

      bubble.setPhysicalRect(paperSize, [cursorX, cursorY, ...size]);
      page.bubbles.push(bubble);

      cursorX += size[0] + 10;
      lineHeight = Math.max(lineHeight, size[1]);
    });

    $bubbleBucketPage = page;
    $bubbleBucketDirty = true;
  }

  // ドロワーが開いたときにフォーカスを設定
  $: if ($bubbleBucketPage != null && drawerElement) {
    setTimeout(() => {
      drawerElement.focus();
    }, 100);
  }

  async function copyAll() {
    if (bubbles.length === 0) {
      toastStore.trigger({ message: 'コピーするフキダシがありません', timeout: 2000 });
      return;
    }
    const text = bubbles.map(b => b.text).join('\n\n');
    await navigator.clipboard.writeText(text);
    toastStore.trigger({ message: `${bubbles.length}件のフキダシをコピーしました`, timeout: 2000 });
  }

  async function pasteAll() {
    const text = await navigator.clipboard.readText();
    if (!text) {
      toastStore.trigger({ message: 'クリップボードにテキストがありません', timeout: 2000 });
      return;
    }

    // 空行で分割（連続する改行、\n\n または \r\n\r\n）
    const texts = text.split(/\n\s*\n|\r\n\s*\r\n/).filter(t => t.trim());

    if (texts.length === 0) {
      toastStore.trigger({ message: 'ペーストするテキストがありません', timeout: 2000 });
      return;
    }

    const page = $bubbleBucketPage!;
    const paperSize = page.paperSize;

    let cursorX = 10;
    let cursorY = 10;
    let lineHeight = 0;

    texts.forEach(t => {
      const bubble = new Bubble();
      bubble.text = t.trim();
      bubble.initOptions();
      const size = bubble.calculateFitSize(paperSize);

      if (cursorX + size[0] > paperSize[0]) {
        cursorX = 10;
        cursorY += lineHeight + 10;
        lineHeight = 0;
      }

      bubble.setPhysicalRect(paperSize, [cursorX, cursorY, ...size]);
      page.bubbles.push(bubble);

      cursorX += size[0] + 10;
      lineHeight = Math.max(lineHeight, size[1]);
    });

    $bubbleBucketPage = page;
    $bubbleBucketDirty = true;
    toastStore.trigger({ message: `${texts.length}件のフキダシをペーストしました`, timeout: 2000 });
  }
</script>

<div class="drawer-outer">
  <Drawer placement={"right"} open={$bubbleBucketPage != null} size="720px" on:clickAway={close}>
    <div
      class="drawer-content"
      bind:this={drawerElement}
      on:paste={handlePaste}
      tabindex="-1"
      role="region"
      aria-label="バブルバケット"
    >
      <div class="global-control-panel">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <img
          draggable={false}
          class="global-control-icon"
          src={clipboardIcon}
          alt={$_('bubbleBucket.copyAll')}
          use:toolTip={$_('bubbleBucket.copyAll')}
          on:click={copyAll}
        />
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <img
          draggable={false}
          class="global-control-icon"
          src={pasteIcon}
          alt={$_('bubbleBucket.pasteAll')}
          use:toolTip={$_('bubbleBucket.pasteAll')}
          on:click={pasteAll}
        />
      </div>
      <div
        class="bubble-list"
        use:sortableList={{
          animation: 150,
          handle: ".drag-handle",
          ghostClass: "sortable-ghost",
          chosenClass: "sortable-chosen",
          onUpdate: onSortUpdate
        }}
      >
        {#each bubbles as bubble (bubble.uuid)}
          <BubbleBucketItem bubble={bubble} paperSize={$bubbleBucketPage?.paperSize ?? [0, 0]} on:delete={onDeleteBubble} on:split={onSplitBubble} on:select={onSelectBubble} />
        {/each}
      </div>
      <div>
        <button class="btn variant-filled" on:click={onAddBubble}>+</button>
      </div>
    </div>
  </Drawer>
</div>

<style>
  .drawer-content {
    width: 100%;
    font-family: 'Yu Gothic', sans-serif;
    font-weight: 500;
    text-align: left;
    padding-top: 16px;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    outline: none;
  }
  .drawer-content:focus {
    outline: 2px solid rgba(var(--color-primary-500), 0.2);
    outline-offset: -2px;
  }
  .drawer-outer :global(.drawer .panel) {
    background-color: rgb(var(--color-surface-100));
  }
  .global-control-panel {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(var(--color-surface-500), 0.3);
  }
  .global-control-icon {
    width: 36px;
    height: 36px;
    padding: 6px;
    box-sizing: content-box;
    cursor: pointer;
    transition: opacity 0.2s, background-color 0.2s, border-color 0.2s;
    border: 2px solid #888;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.5);
  }
  .global-control-icon:hover {
    background-color: rgba(200, 220, 255, 0.5);
    border-color: #46c;
  }
  .bubble-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  :global(.sortable-ghost) {
    opacity: 0.4;
  }
  :global(.sortable-chosen) {
    background-color: rgba(var(--color-primary-500), 0.1);
    border-radius: 8px;
  }
</style>