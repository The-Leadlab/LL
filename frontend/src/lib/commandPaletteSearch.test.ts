import { describe, expect, it } from 'vitest';
import { shouldSearchLeads } from './commandPaletteSearch';

describe('shouldSearchLeads', () => {
  it('searches any query of 2+ characters including spaces', () => {
    expect(shouldSearchLeads('Q')).toBe(false);
    expect(shouldSearchLeads('QA')).toBe(true);
    expect(shouldSearchLeads('QA TE')).toBe(true);
    expect(shouldSearchLeads('QA TEST L')).toBe(true);
    expect(shouldSearchLeads('  QA  ')).toBe(true);
  });
});
