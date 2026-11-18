// Output: stereo volume to the audio device, with peak meters.
//
// Inputs 0/1: left/right (the engine feeds left to both sides when right is unpatched).
// Declared as a sink: the engine sends its outputs to the speakers.

declare name "output";
declare sink "1";
declare tail "0";

import("stdfaust.lib");

peak = abs : max ~ *(ba.tau2pole(0.15));

// Knob smoothing (~20 ms, so turning a knob never clicks) that starts at the knob's value: the
// engine clears every module when Play is pressed, and a plain smoother would then fade in from
// zero, swallowing the start of the first note. `first` is 1 only on the first sample after
// that, which makes the smoother jump straight to its target.
first = 1 - 1';
smo = si.polySmooth(first, 1 - 44.1 / ma.SR, 1);

volume = hslider("volume", 0.5, 0, 1, 0.0001) : smo;

meterL = _ <: attach(_, peak : vbargraph("meterL", 0, 4));
meterR = _ <: attach(_, peak : vbargraph("meterR", 0, 4));

// Groups are parenthesised for readability. (Faust priorities: `~` > `,` > `:` > `<:`/`:>`.)
process = (*(volume), *(volume)) : (meterL, meterR);
