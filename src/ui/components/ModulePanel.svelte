<!--
  The frame every module sits in: header with title, a body for controls,
  and a footer strip for its ports.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SignalType } from '../signals';

  interface Props {
    title: string;
    /** Accent colour of the module, usually the type of signal it produces. */
    signal?: SignalType;
    width?: number;
    children: Snippet;
    ports?: Snippet;
  }

  let { title, signal = 'audio', width = 200, children, ports }: Props = $props();
</script>

<section class="module" style:width={`${width}px`} style:--module-accent={`var(--signal-${signal})`}>
  <header class="header">
    <span class="dot" aria-hidden="true"></span>
    <h3 class="title">{title}</h3>
  </header>
  <div class="body">
    {@render children()}
  </div>
  {#if ports}
    <footer class="ports">
      {@render ports()}
    </footer>
  {/if}
</section>

<style>
  .module {
    display: flex;
    flex-direction: column;
    background: var(--surface-module);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-module);
    user-select: none;
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    background: var(--surface-module-header);
    border-bottom: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    cursor: grab;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--module-accent);
    flex: none;
  }
  .title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-strong);
    letter-spacing: 0.01em;
  }
  .body {
    flex: 1;
    padding: var(--space-3);
  }
  .ports {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-top: 1px solid var(--border-subtle);
  }
</style>
