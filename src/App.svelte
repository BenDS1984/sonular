<script lang="ts">
  import TopBar from './ui/TopBar.svelte';
  import Workspace from './ui/Workspace.svelte';
  import Gallery from './ui/gallery/Gallery.svelte';
  import Toasts from './ui/Toasts.svelte';
  import SaveDialog from './ui/SaveDialog.svelte';
  import UpdateBanner from './ui/UpdateBanner.svelte';

  // Minimal hash routing: '#gallery' opens the component gallery, anything else the app.
  let hash = $state(window.location.hash);
  $effect(() => {
    const onHashChange = () => (hash = window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });
</script>

{#if hash === '#gallery'}
  <Gallery />
{:else}
  <div class="app">
    <TopBar />
    <Workspace />
  </div>
  <SaveDialog />
  <Toasts />
  <UpdateBanner />
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
</style>
