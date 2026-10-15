// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildTextPdf } from './simplePdf';

describe('buildTextPdf', () => {
  it('embeds a Type3 font for the Turkish lira sign', async () => {
    const blob = buildTextPdf(['Invoice total: ₺1200.00']);
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    expect(text).toContain('/Subtype /Type3');
    expect(text).toContain('/lira');
    expect(text).toContain('/F2');
  });
});
