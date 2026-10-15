/** Single-page PDF writer. Helvetica cannot draw ₺, so the lira sign is stroked as paths. */

const LIRA = '₺';
const LIRA_LOOKALIKES = new Set(['₺', '₤', '£']);

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Map a few WinAnsi currency glyphs; everything else becomes ASCII. */
function toPdfString(value: string): string {
  return Array.from(value)
    .map((ch) => {
      if (ch === LIRA || ch === '₤') return '';
      const code = ch.charCodeAt(0);
      if (code === 8364) return '\\200'; // euro
      if (code === 163 || code === 8356) return '\\243'; // pound / lira-like
      if (code === 165) return '\\245'; // yen
      if (code < 32 || code > 126) return code === 160 ? ' ' : '?';
      return ch;
    })
    .join('');
}

function liraPath(x: number, y: number): string {
  // Page-space stroke of a ₺-like mark (~10pt tall) sitting on the text baseline.
  const x0 = x.toFixed(1);
  const y0 = y.toFixed(1);
  return [
    'q 1.15 w 1 J 1 j',
    `${x0} ${y0} m ${x0} ${(y + 10).toFixed(1)} l S`,
    `${x0} ${(y + 10).toFixed(1)} m ${(x + 2.4).toFixed(1)} ${(y + 12.4).toFixed(1)} ${(x + 7.6).toFixed(1)} ${(y + 12.2).toFixed(1)} ${(x + 9.5).toFixed(1)} ${(y + 10).toFixed(1)} c S`,
    `${(x - 3).toFixed(1)} ${(y + 6.6).toFixed(1)} m ${(x + 9).toFixed(1)} ${(y + 6.6).toFixed(1)} l S`,
    `${(x - 3).toFixed(1)} ${(y + 4.2).toFixed(1)} m ${(x + 9).toFixed(1)} ${(y + 4.2).toFixed(1)} l S`,
    'Q',
  ].join('\n');
}

function wrapLine(text: string, max = 92): string[] {
  const clean = text.replace(/\r/g, '');
  if (clean.length <= max) return [clean];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

type PdfOp = { kind: 'text'; x: number; y: number; size: number; text: string } | { kind: 'lira'; x: number; y: number };

function approxWidth(text: string, size: number): number {
  return Math.max(text.length, 1) * size * 0.5;
}

function opsForMixed(text: string, x: number, y: number, size: number): PdfOp[] {
  const ops: PdfOp[] = [];
  let cursor = x;
  let buffer = '';
  const emitText = () => {
    if (!buffer) return;
    ops.push({ kind: 'text', x: cursor, y, size, text: buffer });
    cursor += approxWidth(toPdfString(buffer).replace(/\\[0-9]{3}/g, 'X'), size);
    buffer = '';
  };
  for (const ch of text) {
    if (ch === LIRA || ch === '₤') {
      emitText();
      ops.push({ kind: 'lira', x: cursor, y });
      cursor += 11;
    } else {
      buffer += ch;
    }
  }
  emitText();
  return ops;
}

function renderOps(ops: PdfOp[]): string {
  const chunks: string[] = [];
  for (const op of ops) {
    if (op.kind === 'lira') {
      chunks.push(liraPath(op.x, op.y));
      continue;
    }
    const safe = toPdfString(op.text);
    if (!safe) continue;
    chunks.push(
      `BT /F1 ${op.size} Tf ${op.x.toFixed(1)} ${op.y.toFixed(1)} Td (${escapePdfText(safe)}) Tj ET`,
    );
  }
  return chunks.join('\n');
}

export type InvoicePdfItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type InvoicePdfInput = {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  status?: string;
  paymentTerms?: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  clientName: string;
  clientCompany?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  items: InvoicePdfItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
  terms?: string;
  currencySymbol: string;
};

function money(symbol: string, amount: number): string {
  const value = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  const glyph = LIRA_LOOKALIKES.has(symbol) || symbol === 'TRY' ? LIRA : symbol || '';
  return `${glyph}${value}`;
}

function partyLines(title: string, lines: Array<string | undefined>): string[] {
  const body = lines.map((line) => (line || '').trim()).filter(Boolean);
  return [`${title}:`, ...(body.length ? body : ['—'])];
}

export function buildInvoicePdf(data: InvoicePdfInput): Blob {
  const left = 50;
  let y = 760;
  const ops: PdfOp[] = [];

  const add = (text: string, size = 10, x = left) => {
    for (const line of wrapLine(text, size >= 14 ? 48 : 92)) {
      ops.push(...opsForMixed(line, x, y, size));
      y -= size + 4;
    }
  };

  add('INVOICE', 18);
  add(`Invoice ${data.invoiceNumber}`, 12);
  if (data.status) add(`Status: ${data.status}`);
  add(`Invoice date: ${data.date}    Due: ${data.dueDate}`);
  if (data.paymentTerms) add(`Payment terms: ${data.paymentTerms}`);
  y -= 6;

  const from = partyLines('From', [
    data.companyName,
    data.companyAddress,
    data.companyPhone,
    data.companyEmail,
    data.companyWebsite,
  ]);
  const to = partyLines('To', [
    data.clientName,
    data.clientCompany,
    data.clientAddress,
    data.clientPhone,
    data.clientEmail,
  ]);
  const partyStart = y;
  from.forEach((line, i) => {
    y = partyStart - i * 13;
    ops.push(...opsForMixed(line, left, y, 10));
  });
  to.forEach((line, i) => {
    y = partyStart - i * 13;
    ops.push(...opsForMixed(line, 320, y, 10));
  });
  y = partyStart - Math.max(from.length, to.length) * 13 - 12;

  add('Description                         Qty        Unit         Line total', 9);
  y -= 2;
  const items = data.items.length ? data.items : [{ description: '—', quantity: 0, unitPrice: 0, total: 0 }];
  for (const item of items) {
    const qty = String(item.quantity ?? '');
    const unit = money(data.currencySymbol, Number(item.unitPrice) || 0);
    const lineTotal = money(data.currencySymbol, Number(item.total) || 0);
    const desc = (item.description || 'Item').slice(0, 40);
    add(`${desc.padEnd(34)} ${qty.padStart(4)}   ${unit}   ${lineTotal}`, 10);
    if (y < 120) break;
  }

  y -= 8;
  add(`Subtotal: ${money(data.currencySymbol, Number(data.subtotal) || 0)}`, 10, 360);
  if (Number(data.discountAmount) > 0) {
    add(`Discount: -${money(data.currencySymbol, Number(data.discountAmount) || 0)}`, 10, 360);
  }
  add(`Tax (${Number(data.taxRate) || 0}%): ${money(data.currencySymbol, Number(data.taxAmount) || 0)}`, 10, 360);
  add(`Total: ${money(data.currencySymbol, Number(data.total) || 0)}`, 13, 360);

  if (data.notes) {
    y -= 6;
    add('Notes:');
    add(data.notes);
  }
  if (data.terms) {
    y -= 4;
    add('Terms & Conditions:');
    add(data.terms);
  }

  return assemblePdf(renderOps(ops));
}

export function buildTextPdf(lines: string[]): Blob {
  let y = 760;
  const ops: PdfOp[] = [];
  lines.slice(0, 48).forEach((line) => {
    ops.push(...opsForMixed(line || ' ', 50, y, 12));
    y -= 16;
  });
  return assemblePdf(renderOps(ops));
}

function assemblePdf(contentStream: string): Blob {
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new Blob([body + xref + trailer], { type: 'application/pdf' });
}
