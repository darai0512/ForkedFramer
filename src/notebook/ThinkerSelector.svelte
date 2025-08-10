<script lang="ts">
  import { type Thinker } from "$protocolTypes/adviseTypes.d";

  export let thinker: Thinker;
  
  const thinkerOptions = [
    { value: "gpt4o", label: "gpt4o" },
    { value: "gpt4.1", label: "gpt4.1" },
    { value: "gpt4.1-mini", label: "gpt4.1-mini" },
    { value: "gpt-5", label: "gpt-5" },
    { value: "gpt-5-mini", label: "gpt-5-mini" },
    { value: "gpt-5-chat", label: "gpt-5-chat" },
    // { value: "sonnet", label: "sonnet" },
    { value: "sonnet:think", label: "sonnet(think)" },
    { value: "sonnet-4.0", label: "sonnet-4.0" },
    { value: "opus-4.1", label: "opus-4.1" },
    { value: "gemini", label: "gemini" },
    { value: "gemini-flash", label: "gemini-flash" },
    // { value: "gemini-flash:think", label: "gemini-flash(think)" },
    { value: "grok4", label: "grok4" }
  ];
</script>

<select bind:value={thinker} name="mode" class="p-2 border rounded bg-white text-black">
  {#each thinkerOptions as option}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>
