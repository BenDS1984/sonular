<!-- Small latching button, e.g. channel mute. -->
<script lang="ts">
  interface Props {
    pressed: boolean;
    label: string;
    title?: string;
    tone?: 'danger' | 'accent';
    onchange?: (pressed: boolean) => void;
  }

  let { pressed = $bindable(), label, title = '', tone = 'accent', onchange }: Props = $props();

  function toggle() {
    pressed = !pressed;
    onchange?.(pressed);
  }
</script>

<button
  class="toggle {tone}"
  class:pressed
  type="button"
  aria-pressed={pressed}
  title={title || label}
  onclick={toggle}
>
  {label}
</button>

<style>
  .toggle {
    min-width: 22px;
    height: 20px;
    padding: 0 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-control);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    line-height: 1;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }
  .toggle:hover {
    background: var(--surface-control-hover);
    color: var(--text-default);
  }
  .danger.pressed {
    background: var(--danger-bg);
    border-color: var(--danger);
    color: var(--danger);
  }
  .accent.pressed {
    background: var(--signal-audio-bg);
    border-color: var(--signal-audio);
    color: var(--signal-audio-soft);
  }
</style>
