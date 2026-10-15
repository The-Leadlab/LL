import { describe, expect, it } from 'vitest';
import {
  displayAssigneeLabel,
  displayUserName,
  extractUserList,
  filterAssigneeUsers,
  normalizeAssigneeUsers,
} from './assigneeUsers';

describe('normalizeAssigneeUsers', () => {
  it('always includes the current user even when the API omitted them', () => {
    const users = normalizeAssigneeUsers(
      [{ id: 1, first_name: 'Ali', last_name: 'Attia', is_active: true }],
      { id: '42', first_name: 'Josh', last_name: 'Tester', email: 'josh@example.com' },
    );

    expect(users.map((user) => user.id)).toEqual([42, 1]);
    expect(displayUserName(users.find((user) => user.id === 42)!)).toBe('Josh Tester');
    expect(displayAssigneeLabel(users[0], { id: '42' })).toBe('Me (Josh Tester)');
  });

  it('keeps users that only have an email address', () => {
    const users = normalizeAssigneeUsers(
      [{ id: 7, first_name: '', last_name: '', email: 'solo@org.com', is_active: true }],
      { id: 7, email: 'solo@org.com' },
    );

    expect(users).toHaveLength(1);
    expect(displayUserName(users[0])).toBe('solo@org.com');
  });

  it('filters by name or email', () => {
    const users = [
      { id: 1, first_name: 'Ali', last_name: 'Attia', email: 'ali@the-leadlab.com' },
      { id: 2, first_name: 'Josh', last_name: 'Lee', email: 'josh@org.com' },
    ];
    expect(filterAssigneeUsers(users, 'josh').map((user) => user.id)).toEqual([2]);
    expect(filterAssigneeUsers(users, 'leadlab').map((user) => user.id)).toEqual([1]);
  });

  it('reads items from wrapped API payloads', () => {
    expect(extractUserList({ items: [{ id: 3, first_name: 'A', last_name: 'B' }] })).toHaveLength(1);
  });
});
