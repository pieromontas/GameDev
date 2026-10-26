/**
 * Look-test switch for the Scenario crypt models.
 *
 * Leave this true to show the GLBs. Set it false to restore the procedural
 * hall in code. `?models=0` hides them for one session without a rebuild.
 */
export const CRYPT_MODELS_ENABLED = true;

function currentSearch(): string {
  if (typeof window === 'undefined') return '';
  return window.location.search;
}

/**
 * Master flag, then the URL. `?models=0` (also `false` / `off`) forces the
 * procedural hall. Any other value, including a missing param, keeps the flag.
 */
export function resolveCryptModels(master: boolean, search: string): boolean {
  if (!master) return false;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  let value: string | null = null;
  try {
    value = new URLSearchParams(raw).get('models');
  } catch {
    return true;
  }
  if (value == null) return true;
  const token = value.trim().toLowerCase();
  if (token === '0' || token === 'false' || token === 'off' || token === 'no') return false;
  return true;
}

export function cryptModelsEnabled(search?: string): boolean {
  return resolveCryptModels(CRYPT_MODELS_ENABLED, search ?? currentSearch());
}
