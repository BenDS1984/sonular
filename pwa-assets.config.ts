// Generates the PWA icons from public/app-icon.svg (run: npm run icons).
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#16191e' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#16191e' } },
  },
  images: ['public/app-icon.svg'],
});
