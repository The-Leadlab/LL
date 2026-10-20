import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Prefer cached data on navigation so pages don't flash full-screen loaders (B19/B41)
      staleTime: 60_000,
      gcTime: 10 * 60_000,
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
