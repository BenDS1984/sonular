// Channel: the mixer strip at the end of every patch. Level, balance and mute, with peak meters.
//
// Inputs 0/1: left/right (the engine feeds left to both sides when right is unpatched).
// Declared as a sink: the engine sends its outputs to the master bus.
// Solo and the two sends are patch parameters that the engine and mixer handle; they do not
// change the sound inside this program.

declare name "channel";
declare sink "1";
declare tail "0";

import("stdfaust.lib");

peak = abs : max ~ *(ba.tau2pole(0.15));

// Knob smoothing (~20 ms, so moving a control never clicks) that starts at the control's value:
// the engine clears every module when Play is pressed, and a plain smoother would then fade in
// from zero, swallowing the start of the first note. `first` is 1 only on the first sample after
// that, which makes the smoother jump straight to its target.
first = 1 - 1';
smo = si.polySmooth(first, 1 - 44.1 / ma.SR, 1);

level = hslider("level", 0.5, 0, 2, 0.0001);
mute = hslider("mute", 0, 0, 1, 1);
pan = hslider("pan", 0, -1, 1, 0.001);

// Balance: centred, both sides pass unchanged (a mono source fed to both sides keeps the level
// the old Output module gave it). Turning right fades the left side out along a quarter cosine,
// and the other way round. Gains are computed per block (Faust hoists control-rate expressions
// out of the sample loop) and smoothed afterwards, so no cos runs per sample.
gainL = level * (1 - mute) * cos(max(pan, 0) * ma.PI / 2) : smo;
gainR = level * (1 - mute) * cos(max(0 - pan, 0) * ma.PI / 2) : smo;

meterL = _ <: attach(_, peak : vbargraph("meterL", 0, 4));
meterR = _ <: attach(_, peak : vbargraph("meterR", 0, 4));

// Groups are parenthesised for readability. (Faust priorities: `~` > `,` > `:` > `<:`/`:>`.)
process = (*(gainL), *(gainR)) : (meterL, meterR);
