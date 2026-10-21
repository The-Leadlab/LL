import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/axios';

interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  organization_id: number;
  created_at: string;
  updated_at: string | null;
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const response = await api.get('/auth/me');
      return response.data;
    },
    retry: false,
    staleTime: 60_000,
  });

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user
  };
}
