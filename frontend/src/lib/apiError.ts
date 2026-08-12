/**
 * Normalize FastAPI / Axios error payloads into a safe display string.
 * Prevents React error #31 when `detail` is a validation object/array.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const err = error as {
    message?: string;
    response?: { data?: { message?: unknown; detail?: unknown } };
  };

  const data = err.response?.data;
  const fromDetail = formatDetail(data?.detail);
  if (fromDetail) return fromDetail;

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message;
  }

  if (typeof err.message === 'string' && err.message.trim() && err.message !== 'Network Error') {
    // Axios wraps HTTP errors as "Request failed with status code 422"
    if (!/^Request failed with status code \d+$/i.test(err.message)) {
      return err.message;
    }
  }

  return fallback;
}

function formatDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === 'string') {
    const t = detail.trim();
    return t || null;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const msg = (item as { msg?: unknown; message?: unknown }).msg
            ?? (item as { message?: unknown }).message;
          if (typeof msg === 'string') return msg;
        }
        return null;
      })
      .filter((x): x is string => Boolean(x && x.trim()));
    return parts.length ? parts.join('. ') : null;
  }
  if (typeof detail === 'object') {
    const msg = (detail as { msg?: unknown; message?: unknown }).msg
      ?? (detail as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return null;
}
