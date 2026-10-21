import { getApiOrigin } from './apiOrigin';

/**
 * Absolute API URL for /api/v1/... paths.
 * In dev, origin is empty → same-origin `/api/v1/...` (Vite proxy).
 * In prod, uses VITE_API_URL / api.the-leadlab.com so links are not sent to the static site host.
 */
export function apiV1Url(pathAfterV1: string): string {
  const segment = pathAfterV1.startsWith('/') ? pathAfterV1 : `/${pathAfterV1}`;
  const origin = getApiOrigin();
  return origin ? `${origin}/api/v1${segment}` : `/api/v1${segment}`;
}

export function messageAttachmentUrl(storedName: string): string {
  return apiV1Url(`/messages/attachments/${encodeURIComponent(storedName)}`);
}

export function taskAttachmentUrl(taskId: number, storedName: string): string {
  return apiV1Url(`/tasks/${taskId}/attachments/${encodeURIComponent(storedName)}`);
}

export function emailAttachmentUrl(emailId: number, attachmentId: number): string {
  return apiV1Url(`/email/emails/${emailId}/attachments/${attachmentId}`);
}

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);

/** True when MIME or filename indicates a displayable image. */
export function isImageAttachment(
  contentType?: string | null,
  fileName?: string | null
): boolean {
  const mime = (contentType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXT.has(ext);
}

export async function fetchAttachmentWithAuth(url: string): Promise<Blob> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail) detail = JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.blob();
}

/** Open attachment in a new tab using the session token (plain href cannot send Authorization). */
export async function openAttachmentInNewTab(url: string): Promise<void> {
  const opened = window.open('', '_blank', 'noopener,noreferrer');
  const blob = await fetchAttachmentWithAuth(url);
  const blobUrl = URL.createObjectURL(blob);
  if (opened) {
    opened.location.href = blobUrl;
  } else {
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}
