import { useEffect, useState } from 'react';
import { fetchAttachmentWithAuth, openAttachmentInNewTab } from '@/lib/apiAttachmentUrls';

type Props = {
  url: string;
  alt: string;
  className?: string;
  /** Own-message bubble uses light frame on purple */
  variant?: 'default' | 'onPrimary';
};

/**
 * Auth-fetch an attachment and show an inline image thumbnail.
 * Click opens the full file in a new tab.
 */
export function AttachmentImagePreview({
  url,
  alt,
  className = '',
  variant = 'default',
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);
    setBlobUrl(null);

    fetchAttachmentWithAuth(url)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!revoked) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (loading) {
    return (
      <div
        className={`h-32 w-full max-w-xs animate-pulse rounded-lg ${
          variant === 'onPrimary' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'
        } ${className}`}
      />
    );
  }

  if (error || !blobUrl) {
    return null;
  }

  return (
    <button
      type="button"
      className={`block overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 ${className}`}
      onClick={async () => {
        try {
          await openAttachmentInNewTab(url);
        } catch {
          /* open may fail; image still visible */
        }
      }}
      title={alt}
    >
      <img
        src={blobUrl}
        alt={alt}
        className="max-h-64 max-w-full object-contain bg-black/5 dark:bg-black/20"
      />
    </button>
  );
}
