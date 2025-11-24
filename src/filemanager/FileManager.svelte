<script lang="ts">
  import FileManagerRoot from './FileManagerRoot.svelte';
  //import { buildFileSystem } from './developmentFileSystem';
  import { buildFileSystem } from './productionFileSystem';

  let fileSystemPromise = buildFileSystem();    
</script>

{#await fileSystemPromise then fileSystem}
  <FileManagerRoot localFileSystem={fileSystem}/>
{/await}
