/** Parse API datetimes (naive values are UTC) and display them in the user's timezone. */

export function parseServerDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized);
  const date = new Date(hasZone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDateTime(value: string | Date | null | undefined): string {
  const date = parseServerDate(value);
  if (!date) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatLocalDate(value: string | Date | null | undefined): string {
  const date = parseServerDate(value);
  if (!date) return '';
  return date.toLocaleDateString();
}
