// Mixer: four mono channels with level, pan (−3 dB equal-power law), mute and solo, summed to stereo.
//
// Inputs 0-3: channels 1-4. Outputs 0/1: left/right.
// Meters (peak followers): meter1..meter4 per channel (post-fader), mainL / mainR.

declare name "mixer";
declare tail "0";
declare observer "1"; // keeps running with nothing on its outputs, so the panel meters move

import("stdfaust.lib");

// Knob smoothing (~20 ms, so turning a knob never clicks) that starts at the knob's value: the
// engine clears every module when Play is pressed, and a plain smoother would then fade in from
// zero, swallowing the start of the first note. `first` is 1 only on the first sample after
// that, which makes the smoother jump straight to its target.
first = 1 - 1';
smo = si.polySmooth(first, 1 - 44.1 / ma.SR, 1);

// Peak follower for meters: instant attack, ~150 ms release.
peak = abs : max ~ *(ba.tau2pole(0.15));

// Pan gains are computed from the slider value (once per block, since Faust hoists
// control-rate expressions out of the sample loop) and smoothed afterwards. Smoothing the pan
// position first would force cos/sin to be evaluated for every sample.
panL(pan) = cos((pan + 1) * ma.PI / 4) : smo;
panR(pan) = sin((pan + 1) * ma.PI / 4) : smo;

// Groups are parenthesised for readability. (Faust priorities: `~` > `,` > `:` > `<:`/`:>`.)
// `attach(a, b)` has two inputs, so a meter is attached with `_ <: attach(_, peak : meter)`.
channel(gain, mute, solo, pan, meter) = (*(level) : (_ <: attach(_, peak : meter))) <: (*(panL(pan)), *(panR(pan)))
with {
  // While any channel is soloed, only the soloed channels are heard (mute still silences a soloed one).
  audible = max(solo, 1 - anySolo);
  level = gain * (1 - mute) * audible : smo;
};

solo1 = hslider("solo1", 0, 0, 1, 1);
solo2 = hslider("solo2", 0, 0, 1, 1);
solo3 = hslider("solo3", 0, 0, 1, 1);
solo4 = hslider("solo4", 0, 0, 1, 1);
anySolo = max(max(solo1, solo2), max(solo3, solo4));

ch1 = channel(hslider("gain1", 1, 0, 2, 0.0001), hslider("mute1", 0, 0, 1, 1), solo1, hslider("pan1", 0, -1, 1, 0.001),
              vbargraph("meter1", 0, 4));
ch2 = channel(hslider("gain2", 1, 0, 2, 0.0001), hslider("mute2", 0, 0, 1, 1), solo2, hslider("pan2", 0, -1, 1, 0.001),
              vbargraph("meter2", 0, 4));
ch3 = channel(hslider("gain3", 1, 0, 2, 0.0001), hslider("mute3", 0, 0, 1, 1), solo3, hslider("pan3", 0, -1, 1, 0.001),
              vbargraph("meter3", 0, 4));
ch4 = channel(hslider("gain4", 1, 0, 2, 0.0001), hslider("mute4", 0, 0, 1, 1), solo4, hslider("pan4", 0, -1, 1, 0.001),
              vbargraph("meter4", 0, 4));

main = hslider("main", 1, 0, 2, 0.0001) : smo;

meterL = _ <: attach(_, peak : vbargraph("mainL", 0, 4));
meterR = _ <: attach(_, peak : vbargraph("mainR", 0, 4));

process = ((ch1, ch2, ch3, ch4) :> (*(main), *(main))) : (meterL, meterR);
