// Filter: stereo state-variable filter (12 dB per octave) with low-pass, high-pass and band-pass.
//
// Inputs 0/1: left/right audio. Input 2: modulation (a bipolar or unipolar signal that moves the
// cutoff by `mod` octaves per unit). Outputs 0/1: left/right.
//
// The filter is the topology-preserving (TPT) state-variable filter of Zavalishin: it stays
// stable and smooth while the cutoff moves, at every frequency up to the top of the range.
// Both channels share one set of coefficients.
//
// Coefficients are computed per sample (the modulation input moves them), so the power and the
// tangent are short polynomials: a call to pow()/tan() leaves WebAssembly every time.

declare name "filter";

import("stdfaust.lib");

// Knob smoothing (~20 ms) that starts at the knob's value: the engine clears every module when
// Play is pressed, and a plain smoother would then fade in from zero.
first = 1 - 1';
smo = si.polySmooth(first, 1 - 44.1 / ma.SR, 1);

cutoff = hslider("cutoff", 1000, 20, 20000, 0.01) : smo;
// Resonance 0..1 becomes Q 0.71 (flat, no peak) .. 25 (rings); the exponential reads evenly on a
// knob. It depends on a slider only, so Faust computes it once per block.
res = hslider("resonance", 0, 0, 1, 0.0001);
k = 1 / (0.7071 * pow(35.0, res)) : smo;
modAmt = hslider("mod", 0, -4, 4, 0.01) : smo;
type = hslider("type", 0, 0, 2, 1);

wLow = (type < 0.5) : smo;
wBand = ((type > 0.5) & (type < 1.5)) : smo;
wHigh = (type > 1.5) : smo;

// 2^x for |x| <= 6: e^(16 z) with z = x ln2 / 16, e^z by a series, then four squarings.
exp2(x) = e3 * e3
with {
  z = max(-6.0, min(6.0, x)) * (0.6931472 / 16.0);
  e0 = 1 + z * (1 + z * (0.5 + z * (0.16666667 + z * (0.041666668 + z * 0.008333334))));
  e1 = e0 * e0;
  e2 = e1 * e1;
  e3 = e2 * e2;
};

// tan(pi f / SR): half the angle with a Pade fraction (error < 0.1 % up to 0.45 of the sample
// rate), then the double-angle formula.
tanw(f) = 2 * t / (1 - t * t)
with {
  h = ma.PI * f / ma.SR / 2;
  h2 = h * h;
  t = h * (15 - h2) / (15 - 6 * h2);
};

// Coefficients from the modulation input m: g (tuning), then a1, a2, a3 of the filter.
coefs(m) = g, k, a1, a2, a3
with {
  f = cutoff * exp2(modAmt * m) : max(20.0) : min(min(20000.0, 0.45 * ma.SR));
  g = tanw(f);
  a1 = 1 / (1 + g * (g + k));
  a2 = g * a1;
  a3 = g * a2;
};

// One channel: inputs g, k, a1, a2, a3, x. Outputs the selected response. The state is the two
// integrators (ic1, ic2); low-pass is v2, band-pass is k * v1 (0 dB at its peak), high-pass the rest.
channel(g, k_, a1, a2, a3, x) = (core ~ (_, _)) : (!, !, _, _, _) : mix
with {
  core(ic1, ic2) = 2 * v1 - ic1, 2 * v2 - ic2, v2, k_ * v1, x - k_ * v1 - v2
  with {
    v3 = x - ic2;
    v1 = a1 * ic1 + a2 * v3;
    v2 = ic2 + a2 * ic1 + a3 * v3;
  };
  mix(lp, bp, hp) = lp * wLow + bp * wBand + hp * wHigh;
};

// A meter for the panel: how many octaves the modulation moves the cutoff right now.
shiftMeter = _ <: attach(_, (*(modAmt) : vbargraph("shift", -8, 8)));

// (left, right, mod) -> shared coefficients -> two channels.
process = (_, _, (shiftMeter : coefs)) : route(7, 12, (3, 1), (4, 2), (5, 3), (6, 4), (7, 5), (1, 6), (3, 7), (4, 8), (5, 9), (6, 10), (7, 11), (2, 12))
        : (channel, channel);
