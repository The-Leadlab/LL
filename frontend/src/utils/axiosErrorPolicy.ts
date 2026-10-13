/** Decide when the axios interceptor may invent a fake 404/401 body. */

export function shouldFakeTaskError(url: string, method?: string): boolean {
  if (!url.includes('/tasks')) return false;
  const verb = (method || 'get').toLowerCase();
  if (verb !== 'get') return false;
  if (/\/tasks\/\d+/.test(url)) return false;
  return true;
}
