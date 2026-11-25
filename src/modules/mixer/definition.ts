import type { ModuleDefinition, ParamSpec } from '../types';
import MixerPanel from './MixerPanel.svelte';

const CHANNELS = [1, 2, 3, 4];

/** +6 dB of headroom above unity. */
const MAX_GAIN = 2;

export const mixer: ModuleDefinition = {
  type: 'mixer',
  version: 1,
  title: 'Mixer',
  category: 'Mixing',
  description: 'Four channels with level, pan and mute, summed to a stereo output.',
  signal: 'audio',
  width: 464,
  inputs: CHANNELS.map((ch) => ({ id: `in${ch}`, label: `in ${ch}`, signal: 'audio' as const })),
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [
    ...CHANNELS.flatMap((ch): ParamSpec[] => [
      { id: `gain${ch}`, label: `Level ${ch}`, min: 0, max: MAX_GAIN, default: 1, format: 'gain-db' },
      { id: `pan${ch}`, label: 'Pan', min: -1, max: 1, default: 0, bipolar: true, format: 'pan' },
      { id: `mute${ch}`, label: `Mute ${ch}`, min: 0, max: 1, default: 0, step: 1, format: 'toggle' },
    ]),
    { id: 'main', label: 'Main', min: 0, max: MAX_GAIN, default: 1, format: 'gain-db' },
  ],
  panel: MixerPanel,
  engine: 'faust:mixer',
};
