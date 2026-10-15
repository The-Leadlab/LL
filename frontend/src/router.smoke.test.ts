import { describe, expect, it } from 'vitest';
import { router } from './router';

function collectPaths(routes: any[], acc: string[] = []): string[] {
  for (const route of routes || []) {
    if (typeof route.path === 'string') acc.push(route.path);
    if (route.children) collectPaths(route.children, acc);
  }
  return acc;
}

describe('app route smoke', () => {
  it('registers the screens that failed live retest', () => {
    const paths = collectPaths(router.routes);
    const required = [
      '/leads',
      '/reports',
      '/calendar',
      '/settings/team',
      '/emails/outreach',
    ];
    for (const path of required) {
      expect(paths).toContain(path);
    }
  });
});
