import { describe, expect, it } from 'vitest';
import { LeadsPaginationBar } from './ModernLeads';

describe('LeadsPaginationBar', () => {
  it('is exported so /leads can render without isLoadingLeads crashing', () => {
    expect(typeof LeadsPaginationBar).toBe('function');
  });
});
