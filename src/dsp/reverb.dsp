// Reverb: stereo hall/room reverb based on Fons Adriaensen's zita-rev1 design: an 8-line
// feedback delay network with diffusing allpasses and a two-band decay (low / mid), damped
// towards the highs.
//
// The network is adapted from `re.zita_rev_fdn` and `re.zita_rev1_stereo` in the Faust reverbs
// library (Copyright (C) 2003-2017 Julius O. Smith III, STK-4.3 licence, GPL compatible).
// The difference: the library computes its feedback gains and filter coefficients directly from
// the controls, so moving Size or Damping makes them jump and the tail clicks. Here those
// coefficients are computed once per block from the raw control values (cheap) and then
// smoothed per sample, so every knob moves without clicks.
//
// Inputs 0/1: left/right (left feeds both sides while right is unpatched).
// Outputs 0/1: left/right, dry and reverb mixed.
//
// Parameters:
// - size:     decay time (T60) of the midrange, in seconds; the bass decays 20% longer
// - predelay: extra time before the reverb starts, in ms (on top of the ~20 ms the diffusers
//             take by themselves)
// - damping:  0..1, how quickly the highs die away (0 = bright, 1 = dark)
// - mix:      0..1, dry/wet with an equal-power law
//
// The tail declaration only has to cover the pre-delay: the engine also waits until the
// outputs themselves have fallen silent before it puts the module to sleep.

declare name "reverb";
declare tail "1";
declare normal "1:0";

import("stdfaust.lib");

N = 8;
FSMAX = 192000;

size     = hslider("size", 2.5, 0.3, 12, 0.01);
predelay = hslider("predelay", 10, 0, 150, 0.1);
damping  = hslider("damping", 0.4, 0, 1, 0.001);
mix      = hslider("mix", 0.3, 0, 1, 0.001);

// Smoothing (~20 ms) that jumps straight to the value on the very first sample, so a module
// created with saved settings starts in the right state instead of gliding there.
first = 1 - 1';
smo = si.polySmooth(first, 1 - 44.1 / ma.SR, 1);

t60m  = size;
t60dc = size * 1.2;
f1    = 200;
// Frequency at which the decay is half as long: 20 kHz (bright) down to 1.5 kHz (dark).
f2    = 20000 * pow(1500 / 20000, damping);

// ---- Feedback delay network (after re.zita_rev_fdn) -------------------------------------
apdelays = (0.020346, 0.024421, 0.031604, 0.027333, 0.022904, 0.029291, 0.013458, 0.019123);
tdelays  = (0.153129, 0.210389, 0.127837, 0.256891, 0.174713, 0.192303, 0.125000, 0.219991);
tdelay(i)  = floor(0.5 + ma.SR * ba.take(i + 1, tdelays));
apdelay(i) = floor(0.5 + ma.SR * ba.take(i + 1, apdelays));
fbdelay(i) = tdelay(i) - apdelay(i);
nextpow2(x) = ceil(log(x) / log(2.0));
maxapdelay(i) = int(2.0 ^ max(1.0, nextpow2(floor(0.5 + FSMAX * ba.take(i + 1, apdelays)))));
maxfbdelay(i) = int(2.0 ^ max(1.0, nextpow2(floor(0.5 + FSMAX * ba.take(i + 1, tdelays))
                                            - floor(0.5 + FSMAX * ba.take(i + 1, apdelays)))));
apcoeff(i) = select2(i & 1, 0.6, -0.6);

// Per-line decay: gain per loop for a given T60, computed at control rate.
loopgain(i, t60) = exp(-3.0 * log(10.0) * tdelay(i) / (t60 * ma.SR));

// Coefficients of each line's decay filter, computed from the raw controls (once per block)
// and smoothed per sample.
gM(i)  = loopgain(i, t60m);
g0(i)  = loopgain(i, t60dc);
// One-pole lowpass with unity DC gain and gain gM at f2 (zita-rev1): pole from a quadratic.
pole(i) = mbo2 - sqrt(max(0, mbo2 * mbo2 - 1.0))
with {
  gs = gM(i) * gM(i);
  c = select2(f2 > 0.49 * ma.SR, cos(2.0 * ma.PI * f2 / float(ma.SR)), -1.0);
  mbo2 = (1.0 - gs * c) / (1.0 - gs);
};

staynormal = 10.0 ^ (-20); // decay far below audibility, but never into denormals
lowshelf(G0, x) = x + (G0 - 1) * fi.lowpass(1, f1, x);
decayfilter(i) = *(gm) : lowshelf(shelf) : si.smooth(p) : /(sqrt(float(N))) : +(staynormal)
with {
  gm = gM(i) : smo;
  shelf = g0(i) / gM(i) : smo;
  p = pole(i) : smo;
};

allpass_combs = par(i, N, fi.allpass_comb(maxapdelay(i), apdelay(i), apcoeff(i)));
fbdelaylines  = par(i, N, de.delay(maxfbdelay(i), fbdelay(i) - 1));
fdn = (si.bus(2 * N) :> allpass_combs : ro.hadamard(N)) ~ (par(i, N, decayfilter(i)) : fbdelaylines);

// ---- Input and output stages (after re.zita_rev1_stereo) --------------------------------
// Pre-delay with a smoothly gliding read position (time constant 0.3 s): turning the knob
// bends the pitch of the incoming sound briefly, like tape, instead of clicking. The glide is
// slow enough that even a full jump stays within about half an octave.
// 8192 samples is 170 ms at 48 kHz.
preSamples = predelay * 0.001 * ma.SR : min(8190) : si.polySmooth(first, ba.tau2pole(0.3), 1);
inDelay = de.fdelay(8192, preSamples) * 0.3;

// Output: sum and difference of two lines. A longer tail holds more energy; zita-rev1 offsets
// that with 0.525 / sqrt(T60), which over our 0.3..12 s range made short rooms 8 dB louder
// than long halls. A fourth root keeps 1..12 s within ~1 dB (the smallest rooms come out about
// 3 dB louder), equal to zita-rev1's level at 2.5 s.
wetGain = 0.525 / sqrt(2.5) * pow(2.5 / t60m, 0.25) : smo;
outmix = !, _, _, !, !, !, !, ! : ro.butterfly(2) : *(wetGain), *(wetGain);

wet = (inDelay, inDelay) : re.zita_distrib2(N) : fdn : outmix;

// Equal-power dry/wet; the wet side is normalised so mix = 0.5 gives zita-rev1's own level.
dryGain = cos(mix * ma.PI / 2) : smo;
wetMix  = sin(mix * ma.PI / 2) / sin(ma.PI / 4) : smo;

process = _, _ <: (*(dryGain), *(dryGain)), (wet : *(wetMix), *(wetMix)) :> _, _;
