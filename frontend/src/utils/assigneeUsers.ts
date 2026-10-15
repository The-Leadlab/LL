export interface AssigneeUser {
  id: number;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  is_active?: boolean;
  is_self?: boolean;
}

export interface CurrentUserLike {
  id?: string | number | null;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
}

function toNumericId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function displayUserName(user: Pick<AssigneeUser, 'first_name' | 'last_name' | 'email'>): string {
  const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return full || user.email || 'Unknown user';
}

export function displayAssigneeLabel(
  user: Pick<AssigneeUser, 'first_name' | 'last_name' | 'email' | 'is_self' | 'id'>,
  currentUser?: CurrentUserLike | null,
): string {
  const name = displayUserName(user);
  const currentId = toNumericId(currentUser?.id);
  const isSelf = Boolean(user.is_self) || (currentId !== null && toNumericId(user.id) === currentId);
  return isSelf ? `Me (${name})` : name;
}

export function displayUserInitials(user: Pick<AssigneeUser, 'first_name' | 'last_name' | 'email'>): string {
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
  }
  return (user.email || '?').charAt(0).toUpperCase();
}

export function normalizeAssigneeUsers(
  users: AssigneeUser[] | null | undefined,
  currentUser?: CurrentUserLike | null,
): AssigneeUser[] {
  const byId = new Map<number, AssigneeUser>();

  for (const user of users || []) {
    const id = toNumericId(user?.id);
    if (!id) continue;
    if (user.is_active === false) continue;
    byId.set(id, user);
  }

  const currentId = toNumericId(currentUser?.id);
  if (currentId && !byId.has(currentId)) {
    byId.set(currentId, {
      id: currentId,
      email: currentUser?.email,
      first_name: currentUser?.first_name || '',
      last_name: currentUser?.last_name || '',
      is_active: true,
      is_self: true,
    });
  } else if (currentId && byId.has(currentId)) {
    byId.set(currentId, { ...byId.get(currentId)!, is_self: true });
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aSelf = Boolean(a.is_self) || a.id === currentId;
    const bSelf = Boolean(b.is_self) || b.id === currentId;
    if (aSelf && !bSelf) return -1;
    if (!aSelf && bSelf) return 1;
    return displayUserName(a).localeCompare(displayUserName(b));
  });
}

export function filterAssigneeUsers(users: AssigneeUser[], searchTerm: string): AssigneeUser[] {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return users;
  return users.filter((user) => {
    const name = displayUserName(user).toLowerCase();
    const email = (user.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });
}

export function extractUserList(payload: unknown): AssigneeUser[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as AssigneeUser[];
  if (typeof payload === 'object') {
    const data = payload as { items?: AssigneeUser[]; results?: AssigneeUser[]; data?: AssigneeUser[] };
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.data)) return data.data;
  }
  return [];
}
