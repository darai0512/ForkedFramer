<script lang="ts">
  import writableDerived from "svelte-writable-derived";
  import { frameInspectorTarget, frameInspectorRebuildToken } from './frameInspectorStore';
  import { insertFrameLayers, collectLeaves } from "../../lib/layeredCanvas/dataModels/frameTree";
  import { type Film } from "../../lib/layeredCanvas/dataModels/film";
  import FilmList from "./FilmList.svelte";
  import { dominantMode } from "../../uiStore";
  import Drawer from "../../utils/Drawer.svelte";
  import { bookOperators, mainBook } from "../workspaceStore";
  import { RadioGroup, RadioItem } from '@skeletonlabs/skeleton';
  import type { FilmTool } from '../../utils/filmTools';
  import { _ } from 'svelte-i18n';

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



</script>

<svelte:window bind:innerWidth bind:innerHeight/>

<div class="drawer-outer">
  <Drawer placement={"left"} open={opened} overlay={false} size={"350px"} on:clickAway={close}>
    <div class="drawer-content">
      <div class="h-full flex items-center justify-center gap-4 mb-4">
        <h2>{$_('frame.visibility')}</h2>
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
  h2 {
    font-family: '源暎エムゴ';
    font-size: 16px;
    line-height: normal;
  }
</style>
