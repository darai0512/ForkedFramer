<script lang="ts">
  import { mainBook, bookOperators, viewport } from '../bookeditor/workspaceStore';
  import leftIcon from '../assets/horizontal.webp'; // Maybe not horizontal.webp but a chevron? Or left/right arrow. I'll use simple text or if there is an icon.

  $: maxValue = $mainBook ? $mainBook.pages.length : 1;
  $: isRightToLeft = $mainBook?.direction === "right-to-left";

  let currentPageIndex = 0;

  $: if ($viewport && $mainBook && $bookOperators) {
    try {
      const currentPage = $bookOperators.getFocusedPage();
      currentPageIndex = $mainBook.pages.indexOf(currentPage);
    } catch(e) {}
  }

  function goLeft() {
    if (!$bookOperators || !$mainBook) return;
    let nextIndex = currentPageIndex + 1;
    
    if (nextIndex >= $mainBook.pages.length) {
      $bookOperators.insertPage($mainBook.pages.length);
      // Wait for page to be added, then focus
      setTimeout(() => {
        if ($mainBook) $bookOperators.focusToPage($mainBook.pages.length - 1, 1, false);
      }, 100);
      return;
    }
    $bookOperators.focusToPage(nextIndex, 1, false);
  }

  function goRight() {
    if (!$bookOperators || !$mainBook) return;
    let prevIndex = currentPageIndex - 1;
    
    if (prevIndex >= 0) {
      $bookOperators.focusToPage(prevIndex, 1, false);
    }
  }

  $: showRight = currentPageIndex > 0;
</script>

{#if $mainBook}
<div class="fixed top-1/2 left-4 transform -translate-y-1/2 z-[800] pointer-events-auto">
  <button 
    class="btn-icon bg-surface-900/50 hover:bg-surface-800 text-white w-16 h-32 rounded-lg flex items-center justify-center text-4xl shadow-lg border border-surface-600 transition-all duration-200" 
    on:click={goLeft}>
    <span class="opacity-80 hover:opacity-100">&lt;</span>
  </button>
</div>

{#if showRight}
<div class="fixed top-1/2 right-4 transform -translate-y-1/2 z-[800] pointer-events-auto">
  <button 
    class="btn-icon bg-surface-900/50 hover:bg-surface-800 text-white w-16 h-32 rounded-lg flex items-center justify-center text-4xl shadow-lg border border-surface-600 transition-all duration-200" 
    on:click={goRight}>
    <span class="opacity-80 hover:opacity-100">&gt;</span>
  </button>
</div>
{/if}
{/if}

<style>
  .btn-icon {
    font-family: monospace;
    font-weight: bold;
  }
</style>
