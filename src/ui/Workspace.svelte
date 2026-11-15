<script lang="ts">
  // The patching canvas. For now it only shows an empty state; modules and cables arrive in step 4.
</script>

<main class="workspace">
  <div class="empty">
    <p class="title">Your patch is empty</p>
    <p class="hint">Modules and cables will live here.</p>
  </div>
</main>

<style>
  .workspace {
    position: relative;
    flex: 1;
    overflow: hidden;
    background-color: var(--color-bg);
    background-image: radial-gradient(#22262d 1px, transparent 1px);
    background-size: 20px 20px;
    display: grid;
    place-items: center;
  }
  .empty {
    text-align: center;
    user-select: none;
  }
  .title {
    margin: 0 0 4px;
    font-size: 15px;
    color: var(--color-text);
  }
  .hint {
    margin: 0;
    color: var(--color-text-muted);
  }
</style>
