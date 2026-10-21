const TOUR_KEY_PREFIX = 'leadlab_tour_completed_'
export const TOUR_START_EVENT = 'leadlab:start-tour'

export function tourStorageKey(userId: string | number | undefined | null): string {
  const id = userId != null && String(userId).length > 0 ? String(userId) : 'anon'
  return `${TOUR_KEY_PREFIX}${id}`
}

export function isTourCompleted(userId: string | number | undefined | null): boolean {
  try {
    return localStorage.getItem(tourStorageKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markTourCompleted(userId: string | number | undefined | null): void {
  try {
    localStorage.setItem(tourStorageKey(userId), '1')
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearTourCompleted(userId: string | number | undefined | null): void {
  try {
    localStorage.removeItem(tourStorageKey(userId))
  } catch {
    /* ignore */
  }
}

/** Ask WelcomeTour to open (optional force restart). */
export function requestProductTour(options?: { force?: boolean }): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(TOUR_START_EVENT, { detail: { force: Boolean(options?.force) } }),
  )
}
