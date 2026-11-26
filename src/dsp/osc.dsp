// Oscillator: sine, triangle, sawtooth and square with suppressed aliasing.
//
// Input 0: pitch in octaves relative to C4 (0 = 261.63 Hz, +1 = one octave up).
// Input 1: tune modulation (+-1 = +-24 semitones, the whole Tune knob range).
// Input 2: pulse width modulation for the square (+-1 moves the width by +-45 points).
// Input 3: frequency modulation, exponential: the "fm" knob sets octaves per unit of signal.
// Input 4: hard sync: every rising zero crossing sends the phase back to the start.
// An unpatched input is silence, which leaves the knob as it is.
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

// Knob smoothing (~20 ms, so turning a knob never clicks) that starts at the knob's value: the
// engine clears every module when Play is pressed, and a plain smoother would then fade in from
// zero, swallowing the start of the first note. `first` is 1 only on the first sample after
// that, which makes the smoother jump straight to its target.
first = 1 - 1';
smo = si.polySmooth(first, 1 - 44.1 / ma.SR, 1);

wave  = hslider("wave", 2, 0, 3, 1);
tune  = hslider("tune", 0, -24, 24, 1) : smo;
fine  = hslider("fine", 0, -100, 100, 0.01) : smo;
level = hslider("level", 0.7, 0, 1, 0.0001) : smo;
pw    = hslider("pw", 0.5, 0.05, 0.95, 0.0001) : smo;
fmAmt = hslider("fm", 0, 0, 4, 0.001) : smo;

clip1(x) = max(-1.0, min(1.0, x));

// Frequency from the pitch input plus tuning, kept below Nyquist.
// Kept below a quarter of the sample rate so the 4-point corrections of the square's two edges
// never overlap (12 kHz at 48 kHz).
freq(pitch, tm, fmv) = C4 * pow(2.0, pitch + (tune + 24 * clip1(tm)) / 12 + fine / 1200 + fmAmt * max(-2.0, min(2.0, fmv))) : max(0.0) : min(0.25 * ma.SR);

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

// The oscillator core for frequency f (Hz), pulse width modulation pwmv and the sync trigger
// `e` (1 on the one sample where the sync input rises through zero). Gives one signal: the four
// waveforms weighted by the wave switch, with the output delayed by one sample so that a sync
// can still correct the sample before it (see below).
core(f, pwmv, e) = main@1 + corr
with {
  dt = f / ma.SR;
  // Phase with a hard-sync reset: back to 0 on a trigger, otherwise it just moves on.
  step(prev) = select2(e, ma.frac(prev + dt), 0);
  p = step ~ _;
  // Where the phase would be without the reset, to know how big the jump is.
  pOld = ma.frac(p@1 + dt);
  // Pulse width: knob plus modulation, kept clear of the edges so the two corrections never
  // overlap. The square's mean is taken out and the peak scaled back to 1, so a narrow pulse
  // is quieter, not louder or off-centre. At 50% this is exactly the old square.
  pwE = max(2 * dt, min(1 - 2 * dt, pw + 0.45 * clip1(pwmv))) : max(0.02) : min(0.98);
  sqrLevel(q) = ((ba.if(q < pwE, 1, -1)) - (2 * pwE - 1)) / (2 * max(pwE, 1 - pwE));
  sineAt(q) = rdtable(65536, os.sinwaveform(65536), int(q * 65536));
  triAt(q) = 1 - 4 * abs(q - 0.5);
  sawAt(q) = 2 * q - 1;

  sine = sineAt(p);
  saw = sawAt(p) - blep(dist(p, 0, dt));
  sqrRaw = ba.if(p < pwE, 1, -1) + blep(dist(p, 0, dt)) - blep(dist(p, pwE, dt));
  sqr = (sqrRaw - (2 * pwE - 1)) / (2 * max(pwE, 1 - pwE));
  tri = triAt(p) + 8 * dt * blamp(dist(p, 0, dt)) - 8 * dt * blamp(dist(p, 0.5, dt));
  main = sine * weight(0) + tri * weight(1) + saw * weight(2) + sqr * weight(3);

  // Hard sync: at the reset the waveform jumps from where it would have been to its start. The
  // jump (weighted like the waveforms) is smoothed with the same 4-point BLEP as the saw's wrap,
  // spread over the samples around the reset: one before it (that is why the output is delayed
  // by one sample), the reset sample itself and the one after it. The saw and the square already
  // apply their own wrap correction on the two samples from the reset on (the phase starts at 0
  // like after a wrap), for a jump of -2 or +2; only the difference is added there.
  jump = e * ((0 - sineAt(pOld)) * weight(0)
            + (triAt(0) - triAt(pOld)) * weight(1)
            + (sawAt(0) - sawAt(pOld)) * weight(2)
            + (sqrLevel(0) - sqrLevel(pOld)) * weight(3));
  wrapJump = e * (-2 * weight(2) + 2 / (2 * max(pwE, 1 - pwE)) * weight(3));
  corr = 0.5 * (jump * blep(-1) + (jump - wrapJump)@1 * blep(0) + (jump - wrapJump)@2 * blep(1));
};

// Crossfade weights, so changing waveform never clicks.
weight(i) = (int(wave + 0.5) == i) : si.polySmooth(first, ba.tau2pole(0.005), 1);

// A rising zero crossing of the sync input: one sample high, once per crossing.
trigger(x) = (x > 0) * (x@1 <= 0);

process(pitch, tm, pwmv, fmv, sy) = core(freq(pitch, tm, fmv), pwmv, trigger(sy)) * level;
