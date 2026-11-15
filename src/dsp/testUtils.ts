/** Signal analysis helpers for DSP tests. */

const SR = 48000;

export function rms(x: Float32Array): number {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}

export function estimateFrequency(x: Float32Array, sr = SR): number {
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1]! < 0 && x[i]! >= 0) {
      const t = i - 1 + -x[i - 1]! / (x[i]! - x[i - 1]!);
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  return ((count - 1) * sr) / (last - first);
}

/** In-place radix-2 FFT; returns the power spectrum of the first half. */
export function powerSpectrum(signal: Float32Array): Float64Array {
  const n = signal.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  // Blackman-Harris window keeps leakage far below the alias levels we measure.
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / (n - 1);
    const w = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
    re[i] = signal[i]! * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const ai = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k + len / 2] = re[i + k]! - ar;
        im[i + k + len / 2] = im[i + k]! - ai;
        re[i + k] = re[i + k]! + ar;
        im[i + k] = im[i + k]! + ai;
      }
    }
  }
  const p = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) p[i] = re[i]! * re[i]! + im[i]! * im[i]!;
  return p;
}

/**
 * Aliasing in dB: power outside the true harmonics, below `limitHz`, relative to the harmonic
 * power. Lower is better. Use a frequency that is not an integer divisor of the sample rate,
 * otherwise aliases fold exactly onto harmonics and become invisible to this measure.
 */
export function aliasingDb(x: Float32Array, f0: number, sr = SR, limitHz = sr / 2): number {
  const p = powerSpectrum(x);
  const n = p.length * 2;
  const binHz = sr / n;
  const guard = 6;
  const isHarmonic = new Uint8Array(p.length);
  for (let h = f0; h < sr / 2; h += f0) {
    const c = Math.round(h / binHz);
    for (let b = c - guard; b <= c + guard; b++) if (b >= 0 && b < p.length) isHarmonic[b] = 1;
  }
  let harm = 0;
  let alias = 0;
  for (let b = guard; b < p.length; b++) {
    if (isHarmonic[b]) harm += p[b]!;
    else if (b * binHz < limitHz) alias += p[b]!;
  }
  return 10 * Math.log10(alias / harm);
}

/** Naive (non-band-limited) reference waveforms, for comparison. */
export function naive(shape: 'saw' | 'square' | 'triangle', f: number, n: number, sr = SR): Float32Array {
  const out = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    out[i] = shape === 'saw' ? 2 * p - 1 : shape === 'square' ? (p < 0.5 ? 1 : -1) : 1 - 4 * Math.abs(p - 0.5);
    p += f / sr;
    if (p >= 1) p -= 1;
  }
  return out;
}

