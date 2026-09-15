import { useEffect, useRef, useState } from 'react';
import api from '@/lib/axios';

const AVATAR_COLORS = [
  '#1D4ED8',
  '#0F766E',
  '#7C3AED',
  '#C2410C',
  '#BE123C',
  '#0369A1',
  '#15803D',
  '#A16207',
];

const TINY_BLOB_BYTES = 200;

export function getUserInitials(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (last) return last.slice(0, 2).toUpperCase();
  const local = (email || '').split('@')[0].trim();
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  if (local) return `${local[0]}${local[0]}`.toUpperCase();
  return 'U';
}

export function avatarColorForId(id?: number | string | null): string {
  const numeric = typeof id === 'number' ? id : Number.parseInt(String(id || '0'), 10);
  const index = Math.abs(Number.isFinite(numeric) ? numeric : 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export function isUsableAvatarBlob(blob: Blob | null | undefined): boolean {
  return Boolean(blob && blob.size >= TINY_BLOB_BYTES);
}

type UserAvatarProps = {
  user?: {
    id?: number | string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  photoUrl?: string | null;
  className?: string;
  textClassName?: string;
};

export function UserAvatar({
  user,
  photoUrl,
  className = 'w-10 h-10',
  textClassName = 'text-sm',
}: UserAvatarProps) {
  const initials = getUserInitials(user?.first_name, user?.last_name, user?.email);
  const color = avatarColorForId(user?.id);

  return (
    <div
      className={`${className} rounded-full flex items-center justify-center overflow-hidden shrink-0`}
      style={{ backgroundColor: color }}
      aria-hidden={false}
      aria-label={initials}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`${textClassName} font-semibold text-white leading-none`}>{initials}</span>
      )}
    </div>
  );
}

export function useCurrentUserAvatar(userId?: number | string | null, revision?: number) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/users/me/avatar', { responseType: 'blob' });
        if (cancelled) return;
        if (!isUsableAvatarBlob(res.data) || String(res.data.type || '').includes('svg')) {
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          setPhotoUrl(null);
          return;
        }
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        const url = URL.createObjectURL(res.data);
        objectUrlRef.current = url;
        setPhotoUrl(url);
      } catch {
        if (cancelled) return;
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setPhotoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  return photoUrl;
}
