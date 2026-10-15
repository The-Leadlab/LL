// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildInvoicePdf, buildTextPdf } from './simplePdf';

async function pdfText(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString('latin1');
}

describe('buildTextPdf', () => {
  it('strokes a page-space lira mark instead of relying on Helvetica', async () => {
    const blob = buildTextPdf(['Invoice total: ₺1200.00']);
    const text = await pdfText(blob);
    expect(text).toContain('Invoice total:');
    expect(text).toContain('1200.00');
    expect(text).not.toContain('₺');
    expect(text).toMatch(/ m /);
    expect(text).toMatch(/ l S/);
  });
});

describe('buildInvoicePdf', () => {
  it('includes parties, line items, and totals', async () => {
    const blob = buildInvoicePdf({
      invoiceNumber: 'INV-100',
      date: '2026-10-15',
      dueDate: '2026-10-30',
      companyName: 'LeadLab',
      companyEmail: 'billing@leadlab.test',
      clientName: 'Acme Co',
      clientEmail: 'ap@acme.test',
      items: [{ description: 'Discovery workshop', quantity: 2, unitPrice: 500, total: 1000 }],
      subtotal: 1000,
      taxRate: 20,
      taxAmount: 200,
      discountAmount: 0,
      total: 1200,
      currencySymbol: '₺',
    });
    const text = await pdfText(blob);
    expect(text).toContain('INVOICE');
    expect(text).toContain('INV-100');
    expect(text).toContain('LeadLab');
    expect(text).toContain('Acme Co');
    expect(text).toContain('Discovery workshop');
    expect(text).toContain('Subtotal:');
    expect(text).toContain('Total:');
    expect(text).not.toContain('₺');
    expect(text).toMatch(/ l S/);
  });
});
