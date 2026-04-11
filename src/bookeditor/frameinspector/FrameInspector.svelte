<script lang="ts">
  import writableDerived from "svelte-writable-derived";
  import { frameInspectorTarget, frameInspectorRebuildToken } from './frameInspectorStore';
  import { insertFrameLayers, collectLeaves } from "../../lib/layeredCanvas/dataModels/frameTree";
  import { Film } from "../../lib/layeredCanvas/dataModels/film";
  import FilmList from "./FilmList.svelte";
  import { dominantMode } from "../../uiStore";
  import Drawer from "../../utils/Drawer.svelte";
  import { bookOperators, mainBook } from "../workspaceStore";
  import { RadioGroup, RadioItem } from '@skeletonlabs/skeleton';
  import type { FilmTool } from '../../utils/filmTools';
  import { _ } from 'svelte-i18n';
  import { makePlainCanvas } from '../../lib/layeredCanvas/tools/imageUtil';
  import { ImageMedia } from '../../lib/layeredCanvas/dataModels/media';
  import { sendMediaToMaterialCollection } from '../../materialBucket/materialOperations';
  import { toastStore } from '@skeletonlabs/skeleton';

  import scribbleIcon from '../../assets/frameLayer/scribble.webp';

  let innerWidth = window.innerWidth;
  let innerHeight = window.innerHeight;

  const visibility = writableDerived(
  	frameInspectorTarget,
  	(fit) => fit?.frame.visibility,
  	(v, fit) => {
      fit!.frame.visibility = v!;
      $bookOperators!.commit(null);
      return fit;
    }
  );

  $: opened = !manuallyHidden && $dominantMode != "painting" && $frameInspectorTarget?.frame != null;
  let manuallyHidden = false;

  // 新しいコマが選択されたらドロワーを再表示
  $: if ($frameInspectorTarget?.frame) {
    manuallyHidden = false;
  }

  function close() {
    manuallyHidden = true;
  }
  $: filmStack = $frameInspectorTarget?.frame.filmStack!;

  $: downloadPrefix = (() => {
    const fit = $frameInspectorTarget;
    if (!fit || !$mainBook) return '';
    const pageIndex = $mainBook.pages.indexOf(fit.page);
    const leaves = collectLeaves(fit.page.frameTree);
    const frameIndex = leaves.indexOf(fit.frame);
    const p = String(pageIndex + 1).padStart(3, '0');
    const f = String(frameIndex + 1).padStart(3, '0');
    return `p${p}_f${f}`;
  })();

  function onCommit(e: CustomEvent<boolean>) {
    console.log("FrameInspector", e.detail);
    $bookOperators!.commit(e.detail ? null : "effect");
  }

  function onGenerate(e: CustomEvent<Film>) {
    $frameInspectorTarget!.commandTargetFilm = e.detail;
    $frameInspectorTarget!.command = "generate";
  }

  function onAccept(e: CustomEvent<{index: number, films: Film[]}>) {
    const {index, films} = e.detail;
    console.log("FrameInspector.onAccept", index, films);
    const page = $frameInspectorTarget!.page;
    const element = $frameInspectorTarget!.frame;
    const paperSize = page.paperSize;
    insertFrameLayers(page.frameTree, paperSize, element, index, films);

    filmStack = filmStack;
    $bookOperators!.commit(null);
  }

  function onTool(e: CustomEvent<{tool:FilmTool, film:Film}>) {
    const { tool, film } = e.detail;
    switch(tool) {
      case "duplicate":
        onDuplicate(film);
        break;
      case "sendToMaterialCollection":
        onSendToMaterialCollection(film);
        break;
    }
  }

  function onDuplicate(film: Film) {
    console.log("FrameInspector.onDuplicate", film);
    const index = filmStack.films.indexOf(film);
    const page = $frameInspectorTarget!.page;
    const element = $frameInspectorTarget!.frame;
    const paperSize = page.paperSize;
    const newFilm = film.clone();
    insertFrameLayers(page.frameTree, paperSize, element, index, [newFilm]);
    filmStack = filmStack;
    $bookOperators!.commit(null);
  }

  async function onSendToMaterialCollection(film: Film) {
    if (film.content.kind !== 'media') return;
    const media = film.content.media;
    const result = await sendMediaToMaterialCollection(media);
    toastStore.trigger({ message: result.message, timeout: 2000 });
  }

  function onScribble() {
    const fit = $frameInspectorTarget;
    if (!fit) return;

    const page = fit.page;
    const element = fit.frame;
    const paperSize = page.paperSize;

    // 透明レイヤを一番上に追加
    const [fw, fh] = paperSize;
    const w = Math.max(256, Math.ceil(fw));
    const h = Math.max(256, Math.ceil(fh));
    const media = new ImageMedia(makePlainCanvas(w, h, '#ffffff00'));
    const newFilm = Film.fromMedia(media);
    insertFrameLayers(page.frameTree, paperSize, element, element.filmStack.films.length, [newFilm]);
    filmStack = filmStack;
    $bookOperators!.commit(null);

    // モーダルを閉じる
    manuallyHidden = true;

    // scribbleコマンド発行 (新しい透明レイヤで落書き)
    frameInspectorTarget.set({
      frame: element,
      filmStack: element.filmStack,
      page,
      command: "scribble",
      commandTargetFilm: newFilm,
    });
  }

</script>

<svelte:window bind:innerWidth bind:innerHeight/>

<div class="drawer-outer">
  <Drawer placement={"left"} open={opened} overlay={false} size={"350px"} on:clickAway={close}>
    <div class="drawer-content">
      <div class="header-row">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <img
          class="scribble-btn"
          src={scribbleIcon}
          alt="scribble"
          on:click={onScribble}
          title={$_('hint.frame.scribbleOnTop')}
        />
        <RadioGroup active="variant-filled-primary" hover="hover:variant-soft-primary">
          <RadioItem bind:group={$visibility} name="embed" value={0}>{$_('frame.hidden')}</RadioItem>
          <RadioItem bind:group={$visibility} name="embed" value={1}>{$_('frame.frameOnly')}</RadioItem>
          <RadioItem bind:group={$visibility} name="embed" value={2}>{$_('frame.all')}</RadioItem>
        </RadioGroup>
      </div>
      {#key $frameInspectorRebuildToken}
        <FilmList
          showsBarrier={true}
          filmStack={filmStack}
          paperSize={$frameInspectorTarget?.page?.paperSize || null}
          {downloadPrefix}
          on:commit={onCommit}
          on:generate={onGenerate}
          on:accept={onAccept}
          on:tool={onTool}/>
      {/key}
    </div>
  </Drawer>
</div>

<style>
  .drawer-content {
    width: 350px;
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 2px;
  }
  .drawer-outer :global(.drawer .panel) {
    background-color: rgb(var(--color-surface-100));
  }
  .header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .scribble-btn {
    width: 28px;
    height: 28px;
    cursor: pointer;
    padding: 2px;
    border-radius: 6px;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .scribble-btn:hover {
    background: rgba(0,0,0,0.1);
  }
</style>
