<script lang="ts">
  // 外からvalueが変えられると、textareaの高さが変わる
  // 中で編集しても変わらない

  import { tick } from "svelte";
  import { promptHistory as promptHistoryAction, type PromptHistoryActionOptions } from '../utils/promptHistoryAction';

  export let value = '';
  export let minHeight = 24;
  export let placeholder ='';
  export let historyStoreKey: string | undefined = undefined;

  let textarea: HTMLTextAreaElement;

  let internalValue: string | null = null;
  $: onValueChanged(value);
  async function onValueChanged(value: string) {
    if (value === internalValue) return;
    internalValue = value;
    await tick();
    textarea.style.height = (textarea.scrollHeight + 2) + 'px';
  }

  $: if (internalValue != null) {
    value = internalValue;
  }

  // プロンプト履歴オプション
  let valueBinding = {
    get value() {
      return internalValue || '';
    },
    set value(newValue: string) {
      internalValue = newValue;
    }
  };

  let historyOptions: PromptHistoryActionOptions | undefined;
  $: historyOptions = historyStoreKey ? {
    storeKey: historyStoreKey,
    valueBinding
  } : undefined;

</script>

<textarea
  class="rounded-corner-token textarea"
  style="min-height: {minHeight}px"
  bind:value={internalValue}
  bind:this={textarea}
  placeholder={placeholder}
  on:keydown
  use:promptHistoryAction={historyOptions}
></textarea>

<style>
  textarea {
    width: 100%;
    padding: 4px;
    font-family: '源暎アンチック';
    font-size: 14px;
    height: auto;
    max-height: 360px;
  }
</style>