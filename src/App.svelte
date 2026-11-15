<script lang="ts">
  import TopBar from './ui/TopBar.svelte';
  import Workspace from './ui/Workspace.svelte';
</script>

<div class="app">
  <TopBar />
  <Workspace />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
</style>
