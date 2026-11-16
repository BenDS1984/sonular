<!-- Small status light in a signal colour. `level` 0..1 sets how brightly it glows. -->
<script lang="ts">
  import type { SignalType } from '../signals';

  interface Props {
    level: number;
    signal?: SignalType;
    label?: string;
  }

  let { level, signal = 'gate', label = '' }: Props = $props();

  const glow = $derived(Math.min(1, Math.max(0, level)));
</script>

<span
  class="led"
  style:--led-color={`var(--signal-${signal})`}
  style:--led-glow={glow}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
></span>

<style>
  .led {
    display: inline-block;
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--led-color) calc(15% + 85% * var(--led-glow)), var(--surface-inset));
    box-shadow: 0 0 calc(6px * var(--led-glow)) color-mix(in srgb, var(--led-color) calc(70% * var(--led-glow)), transparent);
  }
</style>
