import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const routerSrc = readFileSync(path.resolve(__dirname, './router.tsx'), 'utf8');

describe('app route smoke', () => {
  it('registers the screens that failed live retest', () => {
    const required = [
      "path: '/leads'",
      "path: '/reports'",
      "path: '/calendar'",
      "path: '/settings/team'",
      "path: '/emails/outreach'",
    ];
    for (const pathDecl of required) {
      expect(routerSrc).toContain(pathDecl);
    }
  });
});
