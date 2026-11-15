// Test tone: a plain sine used to verify the Faust -> WebAssembly -> engine pipeline.
declare name "testtone";

import("stdfaust.lib");

freq = hslider("freq [unit:Hz]", 440, 20, 20000, 0.01) : si.smoo;
gain = hslider("gain", 0.125, 0, 1, 0.0001) : si.smoo;

process = os.osc(freq) * gain;
