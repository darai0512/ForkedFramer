<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Film, FilmStack } from "../../lib/layeredCanvas/dataModels/film";
  import { sortableList } from '../../utils/sortableList'
  import { fileDroppableList, FileDroppableContainer } from '../../utils/fileDroppableList'
  import { moveInArray } from '../../utils/moveInArray';
  import FilmListItem from "./FilmListItem.svelte";
  import { buildMedia } from '../../lib/layeredCanvas/dataModels/media';
  import { mergeSelectedFilms } from '../operations/filmMergeOperations';
  import { _ } from 'svelte-i18n';
  import { redrawToken } from '../workspaceStore';

  export let showsBarrier: boolean;
  export let filmStack: FilmStack;
  export let paperSize: [number, number] | null = null;
  export let downloadPrefix: string = '';

  const dispatch = createEventDispatcher();

  for (let i = 0; i < filmStack.films.length; i++) {
    filmStack.films[i].index = i;
  }

  let isDragging = false;
  let ghostIndex = -1;

  function onAcceptDrop(newIndex: number, mediaResources: (HTMLCanvasElement | HTMLVideoElement)[]) {
    const index = filmStack.films.length - newIndex;
    const films = mediaResources.map(buildMedia).map(media => Film.fromMedia(media));
    dispatch('accept', {index, films});
  }

  function onGhost(newIsDragging: boolean, newGhostIndex: number) {
    isDragging = newIsDragging;
    ghostIndex = newGhostIndex;
    console.log("ghost", ghostIndex);
  }

  const fileDroppableContainer = new FileDroppableContainer(
    onAcceptDrop,
    onGhost);

  // 最後に選択したフィルムの参照（Shift範囲選択で使用）
  let lastSelectedFilm: Film | null = null;

  function onSelectFilm(e: CustomEvent<{ film: Film, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean }>) {
    const { film, ctrlKey, metaKey, shiftKey } = e.detail;
    // 表示順（逆順）の配列
    const displayFilms = filmStack.films.toReversed();

    if (shiftKey && lastSelectedFilm) {
      // Shift+クリック: 範囲選択
      const lastIndex = displayFilms.indexOf(lastSelectedFilm);
      const currentIndex = displayFilms.indexOf(film);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const from = Math.min(lastIndex, currentIndex);
        const to = Math.max(lastIndex, currentIndex);
        // Ctrl/Metaを併用しない場合は既存選択をクリア
        if (!ctrlKey && !metaKey) {
          filmStack.films.forEach(f => f.selected = false);
        }
        for (let i = from; i <= to; i++) {
          displayFilms[i].selected = true;
        }
      }
      // lastSelectedFilm は更新しない（範囲の起点を維持）
    } else if (ctrlKey || metaKey) {
      // Ctrl/Meta+クリック: トグル
      film.selected = !film.selected;
      lastSelectedFilm = film;
    } else {
      // 通常クリック: 単一選択
      const oldSelected = film.selected;
      filmStack.films.forEach(f => f.selected = false);
      film.selected = !oldSelected;
      lastSelectedFilm = film.selected ? film : null;
    }
    filmStack = filmStack;
    $redrawToken = true;
  }

  function onDeleteFilm(e: CustomEvent<Film>) {
    const film = e.detail;
    filmStack.films = filmStack.films.filter(f => f !== film);
    dispatch('commit', true);
    filmStack = filmStack;
  }

  function onGenerate() {
    dispatch('generate');
  }

  function onSortableUpdate(e: {oldIndex: number | undefined, newIndex:number | undefined}) {
    // reversed order
    const oldIndex = filmStack.films.length - 1 - e.oldIndex!;
    const newIndex = filmStack.films.length - 1 - e.newIndex!;
    //const oldIndex = e.oldIndex;
    // const newIndex = e.newIndex;
    moveInArray(filmStack.films, oldIndex, newIndex);
    dispatch('commit', true);
    filmStack = filmStack;
  }

  function onMergeSelectedFilms() {
    if (!paperSize) {
      console.warn('paperSize is required for merging films');
      return;
    }
    
    const mergedFilm = mergeSelectedFilms(filmStack, paperSize);
    if (mergedFilm) {
      dispatch('commit', true);
      filmStack = filmStack;
    }
  }

  // 結合可能かどうかを判定
  $: canMerge = filmStack.getOperationTargetFilms().length > 1;

  // 全選択状態
  $: selectedCount = filmStack.films.filter(f => f.selected).length;
  $: allSelected = filmStack.films.length > 0 && selectedCount === filmStack.films.length;

  function onSelectAll() {
    filmStack.films.forEach(f => f.selected = true);
    lastSelectedFilm = filmStack.films.length > 0 ? filmStack.films[filmStack.films.length - 1] : null;
    filmStack = filmStack;
    $redrawToken = true;
  }

  function onDeselectAll() {
    filmStack.films.forEach(f => f.selected = false);
    lastSelectedFilm = null;
    filmStack = filmStack;
    $redrawToken = true;
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="film-list-container">
  <FilmListItem showsBarrier={false} film={null} on:select={onGenerate}/>
  
  <div 
    class="flex flex-col gap-2 mt-2 min-h-[20px]" 
    use:sortableList={{animation: 100, onUpdate: onSortableUpdate}} 
    use:fileDroppableList={fileDroppableContainer.getDropZoneProps()}
  >
    {#each filmStack.films.toReversed() as film, index (film.ulid)}
      {#if isDragging && ghostIndex === index}
        <div data-ghost class="ghost-element"/>
      {/if}
      <FilmListItem
        {showsBarrier}
        bind:film={film}
        downloadName={downloadPrefix ? `${downloadPrefix}_l${String(filmStack.films.length - index).padStart(3, '0')}` : ''}
        on:select={onSelectFilm}
        on:delete={onDeleteFilm}
        on:tool
        on:commit
      />
    {/each}
    {#if isDragging && ghostIndex === filmStack.films.length}
      <div data-ghost class="ghost-element"/>
    {/if}
  </div>  
  <!-- 選択操作ボタン群 -->
  {#if filmStack.films.length > 1}
    <div class="selection-actions">
      {#if allSelected}
        <button
          class="btn btn-sm variant-ghost-surface w-full h-6"
          on:click={onDeselectAll}
        >
          {$_('frame.deselectAll')}
        </button>
      {:else}
        <button
          class="btn btn-sm variant-ghost-surface w-full h-6"
          on:click={onSelectAll}
        >
          {$_('frame.selectAll')}
        </button>
      {/if}
    </div>
  {/if}
  <!-- 結合ボタン -->
  {#if canMerge}
    <button 
      class="merge-button btn variant-filled-primary w-full mt-2 h-6 text-white" 
      on:click={onMergeSelectedFilms}
    >
{$_('frame.mergeSelectedLayers')}
    </button>
  {/if}
</div>

<style>
  .ghost-element {
    height: 20px;
    background-color: #007bff;
    margin: 5px 0;
  }
  :global(.listbox) {
    gap: 16px;
  }
  .selection-actions {
    margin-top: 4px;
  }
</style>
