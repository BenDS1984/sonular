/** Short status messages shown at the bottom of the screen. */

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'warning' | 'error';
}

export const toasts = $state<Toast[]>([]);

let nextId = 1;

export function showToast(message: string, kind: Toast['kind'] = 'info') {
  const toast: Toast = { id: nextId++, message, kind };
  toasts.push(toast);
  setTimeout(() => dismissToast(toast.id), kind === 'info' ? 3000 : 7000);
}

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
