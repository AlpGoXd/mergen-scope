export type AppSize = 'compact' | 'comfortable' | 'large';
export const DEFAULT_APP_SIZE: AppSize = 'comfortable';
export function normalizeAppSize(value: unknown): AppSize { return value === 'compact' || value === 'large' || value === 'comfortable' ? value : DEFAULT_APP_SIZE; }
export function readStoredAppSize(): AppSize {
  try { const raw: unknown = JSON.parse(localStorage.getItem('mergen-app-preferences') ?? '{}'); return typeof raw === 'object' && raw !== null ? normalizeAppSize((raw as { size?: unknown }).size) : DEFAULT_APP_SIZE; } catch { return DEFAULT_APP_SIZE; }
}
export function applyAppSize(size: AppSize): void { document.documentElement.dataset.size = size; }
