import { DELAY_DIVISIONS, DELAY_FREE_MAX_MS, DELAY_MODES, DELAY_ROUTING } from '../../engine/modules/Delay';
import type { ModuleDefinition, ParamSpec } from '../types';
import DelayPanel from './DelayPanel.svelte';

const SIDES = ['L', 'R'] as const;
/** Start on a dotted eighth on the left and a quarter on the right (375 ms and 500 ms at 120 BPM). */
const START_DIVISION = [2, 3];
const START_MODE = [2, 0];
const FREE_TIMES = [375, 500];

export const delay: ModuleDefinition = {
  type: 'delay',
  version: 1,
  title: 'Dual Delay',
  category: 'Effects',
  description:
    'A left and a right delay line, each a musical time of the project tempo (straight, triplet or dotted) or free in milliseconds. One shared feedback with a high-pass and a low-pass in the loop, tape saturation and wobble, and a dry/wet mix. Stereo or ping-pong. The screen draws the echoes.',
  summary: 'Stereo delay, synced to tempo, with feedback and tape.',
  signal: 'audio',
  width: 464,
  inputs: [
    { id: 'inL', label: 'L', signal: 'audio' },
    { id: 'inR', label: 'R', signal: 'audio' },
  ],
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [
    { id: 'sync', label: 'Sync', min: 0, max: 1, default: 1, step: 1, format: 'toggle' },
    ...SIDES.flatMap((side, i): ParamSpec[] => [
      { id: `time${side}`, label: `Time ${side}`, min: 1, max: DELAY_FREE_MAX_MS, default: FREE_TIMES[i]!, scale: 'log', format: 'ms' },
      {
        id: `div${side}`,
        label: `Time ${side}`,
        min: 0,
        max: DELAY_DIVISIONS.length - 1,
        default: START_DIVISION[i]!,
        step: 1,
        format: 'choice',
        choices: DELAY_DIVISIONS.map((d) => d.label),
      },
      {
        id: `mode${side}`,
        label: `Note ${side}`,
        min: 0,
        max: DELAY_MODES.length - 1,
        default: START_MODE[i]!,
        step: 1,
        format: 'choice',
        choices: DELAY_MODES.map((m) => m.label),
      },
    ]),
    { id: 'feedback', label: 'Feedback', min: 0, max: 0.95, default: 0.4, format: 'percent' },
    { id: 'hp', label: 'HP', min: 20, max: 2000, default: 20, scale: 'log', format: 'hz' },
    { id: 'lp', label: 'LP', min: 500, max: 20000, default: 20000, scale: 'log', format: 'hz' },
    { id: 'tape', label: 'Tape', min: 0, max: 1, default: 0.3, format: 'percent' },
    { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.35, format: 'percent' },
    { id: 'routing', label: 'Routing', min: 0, max: DELAY_ROUTING.length - 1, default: 0, step: 1, format: 'choice', choices: [...DELAY_ROUTING] },
  ],
  panel: DelayPanel,
  engine: 'native:delay',
};
