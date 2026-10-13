import { describe, expect, it } from 'vitest';
import { shouldFakeTaskError } from './axiosErrorPolicy';

describe('shouldFakeTaskError', () => {
  it('does not swallow task create or update failures', () => {
    expect(shouldFakeTaskError('/api/v1/tasks', 'post')).toBe(false);
    expect(shouldFakeTaskError('/api/v1/tasks/12', 'put')).toBe(false);
    expect(shouldFakeTaskError('/api/v1/tasks/12', 'delete')).toBe(false);
  });

  it('does not invent a body for a missing task detail', () => {
    expect(shouldFakeTaskError('/api/v1/tasks/12', 'get')).toBe(false);
  });

  it('still allows an empty list fallback for GET /tasks', () => {
    expect(shouldFakeTaskError('/api/v1/tasks', 'get')).toBe(true);
    expect(shouldFakeTaskError('/api/v1/tasks?', 'GET')).toBe(true);
  });
});
