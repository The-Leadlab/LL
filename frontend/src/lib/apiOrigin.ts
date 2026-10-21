const DEFAULT_PROD_ORIGIN = 'https://api.the-leadlab.com'

/**
 * API origin only (e.g. https://api.the-leadlab.com), never including /api/v1.
 * Strips a mistaken trailing /api/v1 from VITE_API_URL so requests are not doubled.
 * In dev returns '' so `${origin}/api/v1/...` becomes a same-origin /api/v1 path (Vite proxy).
 *
 * Never call Render's free hostname from production: Vercel may still bake a stale
 * VITE_API_URL (ll-ec9p). Always prefer the custom domain on the Starter service.
 */
export function getApiOrigin(): string {
  if (import.meta.env.DEV) return ''
  const raw = (import.meta.env.VITE_API_URL || DEFAULT_PROD_ORIGIN).trim().replace(/\/+$/, '')
  const origin = raw.replace(/\/api\/v1$/i, '')
  // Any *.onrender.com bake (esp. free ll-ec9p) → custom domain on Starter.
  if (!origin || /onrender\.com/i.test(origin)) {
    return DEFAULT_PROD_ORIGIN
  }
  return origin
}
