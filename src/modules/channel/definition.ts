import type { ModuleDefinition } from '../types';
import ChannelPanel from './ChannelPanel.svelte';

/** −6 dB, the level the old Output module started at. */
export const CHANNEL_DEFAULT_LEVEL = 0.5;

export const channel: ModuleDefinition = {
  type: 'channel',
  version: 1,
  title: 'Channel',
  category: 'Output',
  description: "The patch's mixer channel: level, pan, mute, solo and sends, sent on to the master.",
  signal: 'audio',
  width: 152,
  fixed: true,
  inputs: [
    { id: 'L', label: 'L', signal: 'audio' },
    { id: 'R', label: 'R', signal: 'audio' },
  ],
  outputs: [],
  params: [
    { id: 'level', label: 'Level', min: 0, max: 2, default: CHANNEL_DEFAULT_LEVEL, format: 'gain-db' },
    { id: 'pan', label: 'Pan', min: -1, max: 1, default: 0, bipolar: true, format: 'pan' },
    // Mute and solo decide which patches are heard on the main thread, not in the engine.
    { id: 'mute', label: 'Mute', min: 0, max: 1, default: 0, step: 1, format: 'toggle', automatable: false },
    { id: 'solo', label: 'Solo', min: 0, max: 1, default: 0, step: 1, format: 'toggle', automatable: false },
    // Sends do nothing yet: they will feed the effect channels.
    { id: 'send1', label: 'Send 1', min: 0, max: 1, default: 0, format: 'gain-db' },
    { id: 'send2', label: 'Send 2', min: 0, max: 1, default: 0, format: 'gain-db' },
  ],
  panel: ChannelPanel,
  engine: 'faust:channel',
};
