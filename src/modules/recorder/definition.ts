import type { ModuleDefinition } from '../types';
import RecorderPanel from './RecorderPanel.svelte';

export const recorder: ModuleDefinition = {
  type: 'recorder',
  version: 1,
  title: 'Recorder',
  category: 'Output',
  description:
    'Records its stereo input as a 24-bit WAV file. Press Rec, then Play: recording starts on the first beat. The sound passes through unchanged.',
  signal: 'audio',
  width: 204,
  inputs: [
    { id: 'inL', label: 'L', signal: 'audio' },
    { id: 'inR', label: 'R', signal: 'audio' },
  ],
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [],
  panel: RecorderPanel,
  engine: 'native:recorder',
};
