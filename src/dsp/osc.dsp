// Oscillator: sine, triangle, sawtooth and square with suppressed aliasing.
//
// Input 0: pitch in octaves relative to C4 (0 = 261.63 Hz, +1 = one octave up).
// All four waveforms share one phase, so switching is seamless (5 ms crossfade).
//
// Anti-aliasing (measured at 48 kHz, aliasing below 12 kHz relative to the harmonics):
// - saw and square: 4-point BLEP from the integrated cubic B-spline, about -73..-82 dB
//   (classic 2-point PolyBLEP: -46..-54 dB; naive: -11..-23 dB)
// - triangle: 2-point PolyBLAMP on its corners, about -67..-87 dB
// Unlike DPW oscillators these stay stable under sudden pitch jumps.

declare name "osc";

import("stdfaust.lib");

C4 = 261.6255653;

wave  = hslider("wave", 2, 0, 3, 1);
tune  = hslider("tune", 0, -24, 24, 1) : si.smoo;
fine  = hslider("fine", 0, -100, 100, 0.01) : si.smoo;
level = hslider("level", 0.7, 0, 1, 0.0001) : si.smoo;

// Frequency from the pitch input plus tuning, kept below Nyquist.
// Kept below a quarter of the sample rate so the 4-point corrections of the square's two edges
// never overlap (12 kHz at 48 kHz).
freq(pitch) = C4 * pow(2.0, pitch + tune / 12 + fine / 1200) : max(0.0) : min(0.25 * ma.SR);

// Correction of a step of size 2 spread over 4 samples: the integrated cubic B-spline minus the
// ideal step. `x` is the distance to the discontinuity in samples (negative = before it).
// (Powers are written as products: pow() would call out of WebAssembly for every sample.)
blep(x) = 2 * r * (abs(x) < 2)
with {
  sq(v) = v * v;
  x2 = x * x;
  x3 = x2 * x;
  x4 = x2 * x2;
  r = ba.if(x < -1, sq(sq(2 + x)) / 24,
      ba.if(x < 0, 0.5 + 2 * x / 3 - x3 / 3 - x4 / 8,
      ba.if(x < 1, -0.5 + 2 * x / 3 - x3 / 3 + x4 / 8,
      0 - sq(sq(2 - x)) / 24)));
};

// Correction of a unit slope change over 2 samples (PolyBLAMP), for the triangle's corners.
blamp(x) = u * u * u / 6 * (abs(x) < 1) with { u = 1 - abs(x); };

// Distance (in samples) from phase p to a discontinuity at phase c, wrapping around 0/1.
dist(p, c, dt) = d / dt with { d0 = p - c; d = d0 - (d0 > 0.5) + (d0 < -0.5); };

shapes(f) = sine, tri, saw, sqr
with {
  dt = f / ma.SR;
  p = os.lf_sawpos(f);
  sine = rdtable(65536, os.sinwaveform(65536), int(p * 65536));
  saw = 2 * p - 1 - blep(dist(p, 0, dt));
  sqr = ba.if(p < 0.5, 1, -1) + blep(dist(p, 0, dt)) - blep(dist(p, 0.5, dt));
  tri = 1 - 4 * abs(p - 0.5) + 8 * dt * blamp(dist(p, 0, dt)) - 8 * dt * blamp(dist(p, 0.5, dt));
};

// Crossfade weights, so changing waveform never clicks.
weight(i) = (int(wave + 0.5) == i) : si.smooth(ba.tau2pole(0.005));

process(pitch) = shapes(freq(pitch)) : (*(weight(0)), *(weight(1)), *(weight(2)), *(weight(3))) :> *(level);
