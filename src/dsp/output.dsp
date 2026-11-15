// Output: stereo volume to the audio device, with peak meters.
//
// Inputs 0/1: left/right (the engine feeds left to both sides when right is unpatched).
// Declared as a sink: the engine sends its outputs to the speakers.

declare name "output";
declare sink "1";
declare tail "0";

import("stdfaust.lib");

peak = abs : max ~ *(ba.tau2pole(0.15));

volume = hslider("volume", 0.5, 0, 1, 0.0001) : si.smoo;

meterL = _ <: attach(_, peak : vbargraph("meterL", 0, 4));
meterR = _ <: attach(_, peak : vbargraph("meterR", 0, 4));

// Note: in Faust `:` binds tighter than `,`, so groups are parenthesised explicitly.
process = (*(volume), *(volume)) : (meterL, meterR);
