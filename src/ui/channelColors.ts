/**
 * Colours a patch / mixer channel can have. Patches store an index into this list, so the
 * colours can be refined later without touching saved projects. New patches take the next
 * colour in order.
 */
export const CHANNEL_COLORS: readonly { name: string; value: string }[] = [
  { name: 'Amber', value: '#e0a030' },
  { name: 'Orange', value: '#e07a3a' },
  { name: 'Red', value: '#d9534f' },
  { name: 'Pink', value: '#d65a9a' },
  { name: 'Purple', value: '#a26bd6' },
  { name: 'Indigo', value: '#6f7fe0' },
  { name: 'Blue', value: '#4a9de0' },
  { name: 'Cyan', value: '#3bb8c4' },
  { name: 'Teal', value: '#3fb08a' },
  { name: 'Green', value: '#6cbf4a' },
  { name: 'Lime', value: '#b5c43e' },
  { name: 'Sand', value: '#b89a72' },
];

export function channelColor(index: number): string {
  const n = CHANNEL_COLORS.length;
  return CHANNEL_COLORS[((Math.floor(index) % n) + n) % n]!.value;
}
