import type { ToasterId } from './orchestrator.ts';

/** Only essential permission UI can be forced; removed promotions stay removed. */
export function forcedCardFromQuery(search: string, _opts: { adsAvailable?: boolean } = {}): ToasterId | null {
  return new URLSearchParams(search).get('forceCard') === 'permissions' ? 'permissions' : null;
}
