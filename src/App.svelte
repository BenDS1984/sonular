<script lang="ts">
  import TopBar from './ui/TopBar.svelte';
  import Workspace from './ui/Workspace.svelte';
  import TabBar from './ui/TabBar.svelte';
  import MixerView from './ui/mixer/MixerView.svelte';
  import { view } from './ui/view.svelte';
  import Gallery from './ui/gallery/Gallery.svelte';
  import Toasts from './ui/Toasts.svelte';
  import SaveDialog from './ui/SaveDialog.svelte';
  import WelcomeDialog from './ui/WelcomeDialog.svelte';
  import { dialogs } from './ui/dialogs.svelte';
  import { prefs } from './ui/prefs.svelte';
  import UpdateBanner from './ui/UpdateBanner.svelte';

  // First visit: show the welcome window once.
  if (!prefs.welcomed) dialogs.welcome = true;

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
    <TabBar />
    {#if view.mixer}
      <MixerView />
    {:else}
      <Workspace />
    {/if}
  </div>
  <SaveDialog />
  <WelcomeDialog />
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
