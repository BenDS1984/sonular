import { untrack } from 'svelte';

/**
 * A calmer copy of a live value for a meter: it jumps up at once (so peaks are never missed) and
 * falls back gradually, with time constant `tau` seconds. Fast sequences then no longer make the
 * display flicker. Call it while a component is being set up; read `.value` in the template.
 */
export function smoothed(read: () => number, tau = 0.1): { readonly value: number } {
  let value = $state(0);
  let frame = 0;
  let last = 0;

  function fall(now: number) {
    frame = 0;
    const target = read();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const next = Math.max(target, value * Math.exp(-dt / tau));
    if (next - target < 1e-4) {
      value = target;
    } else {
      value = next;
      frame = requestAnimationFrame(fall);
    }
  }

  $effect(() => {
    const target = read();
    untrack(() => {
      if (target >= value) {
        value = target;
      } else if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(fall);
      }
    });
  });

  $effect(() => () => cancelAnimationFrame(frame));

  return {
    get value() {
      return value;
    },
  };
}
