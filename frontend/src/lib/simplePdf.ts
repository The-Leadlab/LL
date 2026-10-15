/** Minimal single-page PDF so invoice download is a real PDF, not JSON.
 * Helvetica (WinAnsi) cannot draw ₺ (U+20BA), so a Type3 glyph is embedded.
 */

const LIRA = '₺';
const LIRA_CODE = '\\200'; // character 128 in the Type3 encoding

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toWinAnsiSafe(value: string): string {
  return Array.from(value)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (ch === LIRA) return ch;
      if (code < 32 || code > 126) return code === 160 ? ' ' : '?';
      return ch;
    })
    .join('');
}

function lineToTj(line: string): string {
  const safe = toWinAnsiSafe(line).slice(0, 110);
  if (!safe.includes(LIRA)) {
    return `(${escapePdfText(safe)}) Tj`;
  }
  const parts = safe.split(LIRA);
  const ops: string[] = [];
  parts.forEach((part, index) => {
    if (part) ops.push(`(${escapePdfText(part)}) Tj`);
    if (index < parts.length - 1) {
      ops.push(`/F2 12 Tf (${LIRA_CODE}) Tj /F1 12 Tf`);
    }
  });
  return ops.join(' ');
}

const LIRA_GLYPH = [
  '600 0 0 0 600 700 d1',
  '40 w 1 j 1 J',
  '220 90 m 220 520 l S',
  '220 520 m 250 610 340 630 420 590 c S',
  '90 430 m 470 430 l S',
  '90 330 m 470 330 l S',
].join('\n');

export function buildTextPdf(lines: string[]): Blob {
  const commands = ['BT', '/F1 12 Tf', '50 760 Td', '16 TL'];
  lines.slice(0, 40).forEach((line, index) => {
    const tj = lineToTj(line);
    if (index === 0) {
      commands.push(tj);
    } else {
      commands.push(`T* ${tj}`);
    }
  });
  commands.push('ET');
  const stream = commands.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj\n`,
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    '6 0 obj << /Type /Font /Subtype /Type3 /FontBBox [0 0 600 700] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs 7 0 R /Encoding 8 0 R /FirstChar 128 /LastChar 128 /Widths [600] >> endobj\n',
    '7 0 obj << /lira 9 0 R >> endobj\n',
    '8 0 obj << /Type /Encoding /Differences [128 /lira] >> endobj\n',
    `9 0 obj << /Length ${LIRA_GLYPH.length} >> stream\n${LIRA_GLYPH}\nendstream\nendobj\n`,
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
