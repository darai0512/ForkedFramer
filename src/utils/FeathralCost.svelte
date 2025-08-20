<script lang="ts">
  import sprytIcon from '../assets/spryt.webp';

  // 通貨単位はfeathral => sprytに変更
  // 内部データは変更困難なので、表示のみ変更

  export let showsLabel = true;
  export let cost: number;
  export let inline = false;
</script>

<span class="{inline ? 'inline-flex mr-1' : 'flex'} flex-row items-center" style="{inline ? 'vertical-align: middle;' : ''}">
  {#if showsLabel}
    <span class="caption">消費</span>
  {/if}
  <img src={sprytIcon} alt="spryt" width=20 height=20 class="{inline ? 'inline align-middle' : ''}" style="{inline ? 'vertical-align: middle; margin: 0 2px;' : ''}"/>
  <span class="caption" style="{inline ? 'vertical-align: middle;' : ''}">x{cost}</span>
</span>

<style>
  .caption {
    font-family: '源暎アンチック';
    font-size: 16px;
  }
</style>
