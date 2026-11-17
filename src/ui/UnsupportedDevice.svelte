<!--
  Shown instead of the app on phones and tablets (see platform/device.ts). There is deliberately
  no way past it: Sonular is made for computers.
-->
<script lang="ts">
  // No logic: a static message.
</script>

<main class="unsupported">
  <div class="card">
    <div class="brand" aria-hidden="true">
      <img src="/favicon.svg" alt="" width="56" height="56" />
      <span>SONULAR</span>
    </div>
    <h1>Sonular is made for computers</h1>
    <p>
      Sonular is a music workspace for laptops and desktops, used with a mouse or trackpad and a
      keyboard. It doesn't work on phones or tablets.
    </p>
    <p>Visit <strong>sonular.app</strong> on your computer to get started.</p>
  </div>
</main>

<style>
  .unsupported {
    display: grid;
    place-items: center;
    min-height: 100%;
    padding: 24px 16px;
    box-sizing: border-box;
    overflow-y: auto;
    background-color: var(--bg-canvas);
    background-image: radial-gradient(circle, var(--bg-canvas-dot) 1px, transparent 1.2px);
    background-size: 24px 24px;
  }
  .card {
    width: min(440px, 100%);
    padding: 32px 24px;
    box-sizing: border-box;
    text-align: center;
    background: var(--sheen-module), var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.6);
  }
  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 24px;
  }
  .brand img {
    border-radius: 12px;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.45);
  }
  .brand span {
    font-size: 28px;
    font-weight: var(--weight-bold);
    letter-spacing: 0.14em;
    color: var(--text-strong);
  }
  h1 {
    margin: 0 0 12px;
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--text-strong);
  }
  p {
    margin: 0 0 12px;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.55;
  }
  p:last-child {
    margin-bottom: 0;
  }
  strong {
    color: var(--signal-audio-soft);
    font-weight: var(--weight-bold);
  }
</style>
