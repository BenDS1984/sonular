// Reverb: stereo hall/room reverb based on Fons Adriaensen's zita-rev1 design: an 8-line
// feedback delay network with diffusing allpasses and a two-band decay (low / mid), damped
// towards the highs.
//
// Four changes make it smoother and more natural than plain zita-rev1:
// - Input diffusion: four allpasses per side (as in Dattorro's plate and the Lexicon designs)
//   smear every sound into a dense cloud before it enters the network, so the reverb starts
//   smooth instead of as a series of separate early echoes.
// - Slow modulation of two of the eight delay lines (a few samples, below 1 Hz) breaks up the
//   metallic ringing of long tails without sounding like chorus. Two lines spread through the
//   whole network; modulating more cost noticeably more CPU for little audible gain.
// - Realistic high-frequency decay: in a real hall the air and walls swallow the highs, so they
//   die out at about half the time of the midrange (and a third at 8 kHz). zita-rev1's damping
//   range (to 20 kHz) left the highs ringing almost as long as the mids, which sounded glassy on
//   bright sources such as detuned saws. Damping now spans 10 kHz .. 500 Hz, and a gentle
//   high-cut (8 kHz) keeps the sharpest fizz out of the reverb (the dry signal stays bright).
// - Equal left and right: zita-rev1 takes left and right from different delay lines, so a
//   sustained pure tone lands on different resonances per side and could be up to 14 dB
//   quieter on one side. Here both sides come from one network output, each through its own
//   chain of allpasses ("decorrelators"). Allpasses change only timing, never the level at any
//   frequency, so both sides are always equally loud, while they still sound wide (left/right
//   correlation 0.04 on noise). A source panned left gets a centred reverb.
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
// - damping:  0..1, how quickly the highs die away (0 = bright, 1 = dark); at the default 0.5
//             4 kHz decays in about half and 8 kHz in about a third of the midrange time
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
damping  = hslider("damping", 0.5, 0, 1, 0.001);
mix      = hslider("mix", 0.3, 0, 1, 0.001);

// Smoothing (~20 ms) that jumps straight to the value on the very first sample, so a module
// created with saved settings starts in the right state instead of gliding there.
first = 1 - 1';
smo = si.polySmooth(first, 1 - 44.1 / ma.SR, 1);

t60m  = size;
t60dc = size * 1.2;
f1    = 200;
// Frequency at which the decay is half as long: 10 kHz (bright) down to 500 Hz (dark);
// 2.2 kHz at the default 0.5.
f2    = 10000 * pow(500 / 10000, damping);

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
// Lines 0 and 4 get a slow sine-like modulation of their length (interpolated delay). The rates
// are unrelated so the lines never move together; depth is ~0.2 ms, about 2 cents of wobble.
modrates = (0.43, 0.71);
moddepth = 0.0002 * ma.SR;
// A parabolic sine approximation from a ramp: smooth enough for a slow wobble, and far cheaper
// than calling sin() every sample.
lfo(f) = 4 * x * (1 - abs(x)) with { x = 2 * os.lf_sawpos(f) - 1; };
modulation(j) = moddepth * (1 + lfo(ba.take(j + 1, modrates))) / 2;
// de.fdelay adds one to its size; passing a power of two minus one keeps the buffer a power of
// two, which Faust indexes with a cheap bit mask instead of a modulo.
modline(i, j) = de.fdelay(maxfbdelay(i) - 1, fbdelay(i) - 1 + modulation(j));
plainline(i)  = de.delay(maxfbdelay(i), fbdelay(i) - 1);
fbdelaylines  = par(j, N / 4, (modline(4 * j, j), plainline(4 * j + 1), plainline(4 * j + 2), plainline(4 * j + 3)));
fdn = (si.bus(2 * N) :> allpass_combs : ro.hadamard(N)) ~ (par(i, N, decayfilter(i)) : fbdelaylines);

// ---- Input and output stages (after re.zita_rev1_stereo) --------------------------------
// Pre-delay with a smoothly gliding read position (time constant 0.3 s): turning the knob
// bends the pitch of the incoming sound briefly, like tape, instead of clicking. The glide is
// slow enough that even a full jump stays within about half an octave.
// 8192 samples is 170 ms at 48 kHz.
preSamples = predelay * 0.001 * ma.SR : min(8190) : si.polySmooth(first, ba.tau2pole(0.3), 1);
// The high-cut (2nd order, 8 kHz) keeps the sharpest fizz out of the reverb.
inDelay = de.fdelay(8192, preSamples) * 0.3 : fi.lowpass(2, 8000);

// Output: sum and difference of two lines. A longer tail holds more energy; zita-rev1 offsets
// that with 0.525 / sqrt(T60), which over our 0.3..12 s range made short rooms 8 dB louder
// than long halls. A fourth root keeps 1..12 s within ~1 dB (the smallest rooms come out about
// 3 dB louder), equal to zita-rev1's level at 2.5 s.
wetGain = 0.525 / sqrt(2.5) * pow(2.5 / t60m, 0.25) : smo;
// One output (the sum of two lines), made into a wide stereo pair by two different allpass
// chains: the same level on both sides at every frequency, but different timing.
decorrL = fi.allpass_comb(2048, dsamples(0.0113), 0.6) : fi.allpass_comb(2048, dsamples(0.0173), 0.6)
        : fi.allpass_comb(4096, dsamples(0.0331), 0.55) : fi.allpass_comb(4096, dsamples(0.0353), 0.5);
decorrR = fi.allpass_comb(2048, dsamples(0.0137), 0.6) : fi.allpass_comb(2048, dsamples(0.0211), 0.6)
        : fi.allpass_comb(4096, dsamples(0.0297), 0.55) : fi.allpass_comb(4096, dsamples(0.0389), 0.5);
outmix = !, _, _, !, !, !, !, ! : + : *(wetGain) <: decorrL, decorrR;

// Input diffusion: four allpasses per side, after Dattorro (input diffusion 0.75 / 0.625).
// The two sides use different delay times, so left and right stay decorrelated.
dsamples(t) = floor(0.5 + t * ma.SR);
diffuser(t1, t2, t3, t4) = fi.allpass_comb(4096, dsamples(t1), 0.75)
                         : fi.allpass_comb(4096, dsamples(t2), 0.75)
                         : fi.allpass_comb(4096, dsamples(t3), 0.625)
                         : fi.allpass_comb(4096, dsamples(t4), 0.625);
diffuseL = diffuser(0.00477, 0.00360, 0.01273, 0.00931);
diffuseR = diffuser(0.00513, 0.00391, 0.01187, 0.00863);

wet = (inDelay : diffuseL), (inDelay : diffuseR) : re.zita_distrib2(N) : fdn : outmix;

// Equal-power dry/wet; the wet side is normalised so mix = 0.5 gives zita-rev1's own level.
dryGain = cos(mix * ma.PI / 2) : smo;
wetMix  = sin(mix * ma.PI / 2) / sin(ma.PI / 4) : smo;

process = _, _ <: (*(dryGain), *(dryGain)), (wet : *(wetMix), *(wetMix)) :> _, _;
