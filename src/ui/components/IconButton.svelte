<!-- Square toolbar button with a line icon. -->
<script lang="ts">
  type IconName = 'new' | 'open' | 'save' | 'export' | 'undo' | 'redo' | 'fullscreen' | 'exit-fullscreen' | 'browser';

  interface Props {
    icon: IconName;
    label: string;
    disabled?: boolean;
    active?: boolean;
    onclick?: (e: MouseEvent) => void;
  }

  let { icon, label, disabled = false, active = false, onclick }: Props = $props();
</script>

<button
  class="icon-button"
  class:active
  type="button"
  title={label}
  aria-label={label}
  {disabled}
  onpointerdown={(e) => e.stopPropagation()}
  {onclick}
>
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    {#if icon === 'new'}
      <path d="M9 1.75H4.5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5.25L9 1.75z" />
      <path d="M9 1.75v3.5h3.5M8 7.5v4M6 9.5h4" />
    {:else if icon === 'open'}
      <path d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.5h5.5a1 1 0 0 1 1 1v6.75a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1V4.25z" />
    {:else if icon === 'save'}
      <path d="M8 2v8M4.75 7 8 10.25 11.25 7M2.75 11.5v1.75h10.5V11.5" />
    {:else if icon === 'export'}
      <path d="M1.75 9.5h1.5l1.5-4 2 7 2-9.5 1.75 6.5h3.75" />
    {:else if icon === 'undo'}
      <path d="M5.5 3.5 2.5 6.5l3 3" />
      <path d="M2.75 6.5H10a3.25 3.25 0 0 1 0 6.5H7" />
    {:else if icon === 'redo'}
      <path d="m10.5 3.5 3 3-3 3" />
      <path d="M13.25 6.5H6a3.25 3.25 0 0 0 0 6.5h3" />
    {:else if icon === 'fullscreen'}
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    {:else if icon === 'exit-fullscreen'}
      <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />
    {:else if icon === 'browser'}
      <path d="M2.75 2.75h10.5v10.5H2.75zM6.25 2.75v10.5" />
    {/if}
  </svg>
</button>

<style>
  .icon-button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .icon-button:hover:not(:disabled) {
    background: var(--surface-control);
    border-color: var(--border-strong);
    color: var(--text-strong);
  }
  .icon-button.active {
    border-color: var(--border-focus);
  }
  .icon-button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
