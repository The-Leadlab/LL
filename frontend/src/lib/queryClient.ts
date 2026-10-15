import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function invalidateOrgScopedQueries() {
  queryClient.invalidateQueries({ queryKey: ['assignable-users'] });
  queryClient.invalidateQueries({ queryKey: ['organization-users'] });
  queryClient.invalidateQueries({ queryKey: ['users'] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
  queryClient.invalidateQueries({ queryKey: ['task-details'] });
}
